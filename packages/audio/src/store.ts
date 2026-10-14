import type { FileStore } from "@tarteel/storage";
import { ayahFileName, parseAyahFileName } from "./catalog.ts";
import { MIN_AUDIO_BYTES } from "./mp3.ts";
import { ayahCountOf, totalAyahCount } from "./refs.ts";
import type { AyahRef } from "./types.ts";

export interface SurahAudioStatus {
  surahId: number;
  total: number;
  have: number;
  /** Ayah numbers that are not on disk, in order. Empty when `have === total`. */
  missing: number[];
}

export interface ReciterAudioStats {
  files: number;
  bytes: number;
  /** Every ayah of the book is on disk. */
  complete: boolean;
}

export interface AudioStore {
  /** Relative path of one ayah's audio inside the `audio` area. */
  relPath(reciterId: string, ref: AyahRef): string;
  /** The device path/URI of an ayah's audio if a believable file is on disk, else null. */
  localPath(reciterId: string, ref: AyahRef): Promise<string | null>;
  hasAyah(reciterId: string, ref: AyahRef): Promise<boolean>;
  /** Writes verified bytes via a `.part` file so a killed app never leaves a truncated file under the real name. */
  commitAyah(reciterId: string, ref: AyahRef, bytes: Uint8Array): Promise<string>;
  surahStatus(reciterId: string, surahId: number): Promise<SurahAudioStatus>;
  reciterStats(reciterId: string): Promise<ReciterAudioStats>;
  removeSurah(reciterId: string, surahId: number): Promise<number>;
  removeReciter(reciterId: string): Promise<void>;
  /** Writes a small side file (e.g. timings) next to a reciter's audio. */
  writeAux(reciterId: string, name: string, data: Uint8Array): Promise<void>;
  readAux(reciterId: string, name: string): Promise<Uint8Array | null>;
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SAFE_AUX = /^[a-z0-9][a-z0-9._-]{0,60}$/;

/**
 * Audio lives on the filesystem (large binaries): `<audio area>/<reciterId>/<SSS><AAA>.mp3`.
 * The reader's streaming-prefetch cache and an explicit download share these files, so nothing is stored twice.
 */
export function createAudioStore(files: FileStore): AudioStore {
  const dir = (id: string): string => {
    if (!SAFE_ID.test(id)) throw new Error(`Unsafe reciter id: ${id}`);
    return id;
  };
  const relPath = (id: string, ref: AyahRef): string => `${dir(id)}/${ayahFileName(ref)}`;

  async function listing(id: string): Promise<{ ref: AyahRef; size: number }[]> {
    let entries: { name: string; size: number }[];
    try {
      entries = await files.listWithSize("audio", dir(id));
    } catch {
      return []; // an unreadable or missing folder is an empty one
    }
    const out: { ref: AyahRef; size: number }[] = [];
    for (const e of entries) {
      const ref = parseAyahFileName(e.name);
      if (ref && e.size > MIN_AUDIO_BYTES) out.push({ ref, size: e.size });
    }
    return out;
  }

  return {
    relPath,
    async localPath(id, ref) {
      const rel = relPath(id, ref);
      try {
        if (!(await files.exists("audio", rel))) return null;
        return (await files.size("audio", rel)) > MIN_AUDIO_BYTES ? files.resolve("audio", rel) : null;
      } catch {
        return null;
      }
    },
    async hasAyah(id, ref) {
      return (await this.localPath(id, ref)) !== null;
    },
    async commitAyah(id, ref, bytes) {
      const rel = relPath(id, ref);
      const part = `${rel}.part`;
      await files.write("audio", part, bytes);
      try {
        await files.move("audio", part, rel);
      } catch (e) {
        await files.remove("audio", part).catch(() => undefined);
        throw e;
      }
      return files.resolve("audio", rel);
    },
    async surahStatus(id, surahId) {
      const total = ayahCountOf(surahId);
      const present = new Set<number>();
      for (const e of await listing(id)) if (e.ref.surahId === surahId) present.add(e.ref.ayahNumber);
      const missing: number[] = [];
      for (let a = 1; a <= total; a++) if (!present.has(a)) missing.push(a);
      return { surahId, total, have: total - missing.length, missing };
    },
    async reciterStats(id) {
      const all = await listing(id);
      const bytes = all.reduce((sum, e) => sum + e.size, 0);
      return { files: all.length, bytes, complete: all.length >= totalAyahCount() };
    },
    async removeSurah(id, surahId) {
      let removed = 0;
      let entries: { name: string; size: number }[] = [];
      try {
        entries = await files.listWithSize("audio", dir(id));
      } catch {
        return 0;
      }
      for (const e of entries) {
        const ref = parseAyahFileName(e.name);
        const isPart = e.name.endsWith(".part") && parseAyahFileName(e.name.slice(0, -5)) !== null;
        const target = ref ?? (isPart ? parseAyahFileName(e.name.slice(0, -5)) : null);
        if (!target || target.surahId !== surahId) continue;
        await files.remove("audio", `${dir(id)}/${e.name}`).catch(() => undefined);
        if (ref) removed += 1;
      }
      return removed;
    },
    async removeReciter(id) {
      let entries: { name: string; size: number }[] = [];
      try {
        entries = await files.listWithSize("audio", dir(id));
      } catch {
        return;
      }
      for (const e of entries) await files.remove("audio", `${dir(id)}/${e.name}`).catch(() => undefined);
    },
    async writeAux(id, name, data) {
      if (!SAFE_AUX.test(name)) throw new Error(`Unsafe file name: ${name}`);
      const rel = `${dir(id)}/${name}`;
      await files.write("audio", `${rel}.part`, data);
      await files.move("audio", `${rel}.part`, rel);
    },
    async readAux(id, name) {
      if (!SAFE_AUX.test(name)) return null;
      const rel = `${dir(id)}/${name}`;
      try {
        return (await files.exists("audio", rel)) ? await files.read("audio", rel) : null;
      } catch {
        return null;
      }
    },
  };
}
