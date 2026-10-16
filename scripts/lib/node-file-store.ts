import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileArea, FileEntry, FileStore } from "@tarteel/storage";
import { assertSafeRelativePath } from "@tarteel/storage";

/** FileStore on a real directory (`<root>/<area>/<path>`). Used by build scripts and tests, where SQLite needs a real file. */
export function createNodeFileStore(root: string): FileStore {
  const abs = (area: FileArea, relativePath: string): string => {
    assertSafeRelativePath(relativePath);
    return join(root, area, relativePath);
  };
  const listDir = async (area: FileArea, dir: string): Promise<string[]> => {
    if (dir) assertSafeRelativePath(dir);
    try {
      return (await readdir(join(root, area, dir), { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  return {
    resolve: (area, p) => abs(area, p),
    exists: async (area, p) => stat(abs(area, p)).then((s) => s.isFile(), () => false),
    read: async (area, p) => new Uint8Array(await readFile(abs(area, p))),
    write: async (area, p, data) => {
      const target = abs(area, p);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    },
    remove: async (area, p) => rm(abs(area, p), { force: true }),
    list: async (area, dir = "") => listDir(area, dir),
    size: async (area, p) => (await stat(abs(area, p))).size,
    move: async (area, from, to) => {
      const target = abs(area, to);
      await mkdir(dirname(target), { recursive: true });
      await rename(abs(area, from), target);
    },
    listWithSize: async (area, dir = ""): Promise<FileEntry[]> => {
      const out: FileEntry[] = [];
      for (const name of await listDir(area, dir)) out.push({ name, size: (await stat(join(root, area, dir, name))).size });
      return out;
    },
  };
}
