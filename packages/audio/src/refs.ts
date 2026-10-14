import { HAFS_6236_AYAH_COUNTS, opensWithBismillahHeading } from "@tarteel/quran-data";
import type { AyahRef } from "@tarteel/types";

/**
 * The Bismillah that opens a surah is recited, but under the `hafs-6236` numbering it is not an ayah of that surah
 * (it is ayah 1 of al-Fatihah only). The player therefore queues it as ayah 0 of the surah it opens, and plays the
 * recording of 1:1, the same words, for it.
 */
export const BASMALAH_AYAH = 0;

export function basmalahRef(surahId: number): AyahRef {
  return { surahId, ayahNumber: BASMALAH_AYAH };
}

/** Which surahs have one is the reader's own rule (`opensWithBismillahHeading`): the heading and the recitation agree. */
export function isBasmalahRef(ref: AyahRef | null | undefined): boolean {
  return ref != null && ref.ayahNumber === BASMALAH_AYAH && opensWithBismillahHeading(ref.surahId);
}

/** The ayah whose recording is played (and downloaded) for a ref: 1:1 for a Bismillah, the ref itself otherwise. */
export function audioRefOf(ref: AyahRef): AyahRef {
  return isBasmalahRef(ref) ? { surahId: 1, ayahNumber: 1 } : ref;
}

/**
 * Puts the surah's Bismillah in front of its first ayah wherever a surah is entered: at the start of the list and at
 * each surah boundary. A repeated ayah 1 (the memorisation drill) does not repeat it, but a repeated pass over the
 * range starts with it again. `enabled: false` is for a recording whose first ayah already contains it.
 */
export function withBasmalah(refs: readonly AyahRef[], enabled = true): AyahRef[] {
  if (!enabled) return [...refs];
  const out: AyahRef[] = [];
  for (const r of refs) {
    const prev = out[out.length - 1];
    if (r.ayahNumber === 1 && opensWithBismillahHeading(r.surahId) && !sameRef(prev, r) && !(prev && prev.surahId === r.surahId && prev.ayahNumber === BASMALAH_AYAH)) {
      out.push(basmalahRef(r.surahId));
    }
    out.push(r);
  }
  return out;
}

/** Ayahs in a surah, or 0 for a number that is not a surah. */
export function ayahCountOf(surahId: number): number {
  return Number.isInteger(surahId) ? (HAFS_6236_AYAH_COUNTS[surahId - 1] ?? 0) : 0;
}

export function isValidRef(ref: AyahRef): boolean {
  const count = ayahCountOf(ref.surahId);
  return Number.isInteger(ref.ayahNumber) && ref.ayahNumber >= 1 && ref.ayahNumber <= count;
}

export function sameRef(a: AyahRef | null | undefined, b: AyahRef | null | undefined): boolean {
  return a != null && b != null && a.surahId === b.surahId && a.ayahNumber === b.ayahNumber;
}

/** The ayah after this one, or null after the last ayah of the last surah. */
export function nextAyah(ref: AyahRef): AyahRef | null {
  const count = ayahCountOf(ref.surahId);
  if (count === 0) return null;
  if (ref.ayahNumber < count) return { surahId: ref.surahId, ayahNumber: ref.ayahNumber + 1 };
  if (ref.surahId >= HAFS_6236_AYAH_COUNTS.length) return null;
  return { surahId: ref.surahId + 1, ayahNumber: 1 };
}

/**
 * The ayah's position in the whole book, 1..6236 (1:1 is 1, 2:1 is 8, 114:6 is 6236), or null for an invalid ref.
 * Some audio hosts number their files this way instead of by surah and ayah.
 */
export function globalAyahNumber(ref: AyahRef): number | null {
  if (!isValidRef(ref)) return null;
  let n = ref.ayahNumber;
  for (let s = 1; s < ref.surahId; s++) n += ayahCountOf(s);
  return n;
}

/** Every ayah of one surah, in order. Empty for a surah that does not exist. */
export function surahRefs(surahId: number): AyahRef[] {
  const count = ayahCountOf(surahId);
  return Array.from({ length: count }, (_, i) => ({ surahId, ayahNumber: i + 1 }));
}

/** Every ayah in the book, in recitation order. */
export function allAyahRefs(): AyahRef[] {
  const out: AyahRef[] = [];
  for (let s = 1; s <= HAFS_6236_AYAH_COUNTS.length; s++) out.push(...surahRefs(s));
  return out;
}

/** 6,236. Computed rather than written down, so it cannot drift from the numbering data. */
export function totalAyahCount(): number {
  return HAFS_6236_AYAH_COUNTS.reduce((a, b) => a + b, 0);
}

/**
 * A contiguous range as an ordered list. An inverted or invalid range plays just the starting ayah;
 * an invalid start gives an empty list.
 */
export function expandRange(from: AyahRef, to: AyahRef): AyahRef[] {
  if (!isValidRef(from)) return [];
  const inverted = to.surahId < from.surahId || (to.surahId === from.surahId && to.ayahNumber < from.ayahNumber);
  const end = inverted || !isValidRef(to) ? from : to;
  const out: AyahRef[] = [];
  let cur: AyahRef | null = from;
  while (cur) {
    out.push(cur);
    if (sameRef(cur, end)) break;
    cur = nextAyah(cur);
  }
  return out;
}
