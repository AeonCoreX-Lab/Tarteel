import { Directory, File, Paths } from "expo-file-system";
import { assertSafeRelativePath } from "@tarteel/storage";
import type { FileArea, FileEntry, FileStore } from "@tarteel/storage";

/**
 * FileStore on the device filesystem: `<documents>/tarteel/<area>/<relative path>`.
 * Large binaries only (audio, fonts, packages); never Quran text, notes or preferences.
 * The documents directory is private to the app and is not included in Android backups (`allowBackup: false`).
 */
const parts = (area: FileArea, rel: string): string[] => {
  assertSafeRelativePath(rel);
  return ["tarteel", area, ...rel.split("/")];
};

const fileAt = (area: FileArea, rel: string): File => new File(Paths.document, ...parts(area, rel));

function ensureParent(area: FileArea, rel: string): void {
  const segs = parts(area, rel);
  new Directory(Paths.document, ...segs.slice(0, -1)).create({ intermediates: true, idempotent: true });
}

function dirAt(area: FileArea, rel?: string): Directory {
  if (rel) assertSafeRelativePath(rel);
  return new Directory(Paths.document, "tarteel", area, ...(rel ? rel.split("/") : []));
}

export function createExpoFileStore(): FileStore {
  return {
    resolve: (area, rel) => fileAt(area, rel).uri,
    exists: async (area, rel) => fileAt(area, rel).exists,
    read: async (area, rel) => await fileAt(area, rel).bytes(),
    write: async (area, rel, data) => {
      ensureParent(area, rel);
      fileAt(area, rel).write(data);
    },
    remove: async (area, rel) => {
      const f = fileAt(area, rel);
      if (f.exists) f.delete();
    },
    list: async (area, rel) => {
      const root = dirAt(area, rel);
      if (!root.exists) return [];
      const out: string[] = [];
      const walk = (d: Directory, prefix: string): void => {
        for (const item of d.list()) {
          if (item instanceof Directory) walk(item, `${prefix}${item.name}/`);
          else out.push(`${prefix}${item.name}`);
        }
      };
      walk(root, "");
      return out;
    },
    size: async (area, rel) => fileAt(area, rel).size ?? 0,
    move: async (area, from, to) => {
      const src = fileAt(area, from);
      const dst = fileAt(area, to);
      ensureParent(area, to);
      if (dst.exists) dst.delete();
      src.move(dst);
    },
    listWithSize: async (area, rel): Promise<FileEntry[]> => {
      const root = dirAt(area, rel);
      if (!root.exists) return [];
      const out: FileEntry[] = [];
      for (const item of root.list()) if (item instanceof File) out.push({ name: item.name, size: item.size ?? 0 });
      return out;
    },
  };
}

/** Free space on the device, for the download space check. */
export function freeDiskBytes(): number {
  return Paths.availableDiskSpace;
}
