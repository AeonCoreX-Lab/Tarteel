import type { AudioHttp } from "./download.ts";
import type { AudioStore } from "./store.ts";
import type { AyahRef, Reciter } from "./types.ts";

/**
 * One aligned span of an ayah's audio: `[firstWord, lastWordExclusive, startMs, endMs]`.
 * Word numbers are 0-based. A span covering several words means the aligner could not tell them apart.
 */
export type TimingSegment = readonly [number, number, number, number];

/** Segments by `"surah:ayah"`. Timings belong to ONE recording: another reciter's data would highlight the wrong word. */
export type TimingTable = Readonly<Record<string, readonly TimingSegment[]>>;

const KEY_RE = /^\d{1,3}:\d{1,3}$/;

/**
 * Reads a timing file. Returns null unless EVERY segment is well formed: a table that is half right would light the
 * wrong word, which is worse than lighting the whole ayah, so it is refused whole.
 */
export function parseTimings(input: unknown): TimingTable | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const out: Record<string, TimingSegment[]> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KEY_RE.test(key) || !Array.isArray(value)) return null;
    const segs: TimingSegment[] = [];
    for (const seg of value) {
      if (!Array.isArray(seg) || seg.length < 4) return null;
      const n = (seg as unknown[]).slice(0, 4);
      if (!n.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
      const first = n[0] as number;
      const last = n[1] as number;
      const start = n[2] as number;
      const end = n[3] as number;
      if (first < 0 || start < 0 || end <= start) return null;
      segs.push([first, last, start, end]);
    }
    out[key] = segs;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function segmentsFor(table: TimingTable | null, ref: AyahRef): readonly TimingSegment[] | null {
  const segs = table?.[`${ref.surahId}:${ref.ayahNumber}`];
  return segs && segs.length > 0 ? segs : null;
}

/** The 0-based word being recited `ms` into the ayah's audio, or null (a pause, a gap, or no timing for the ayah). */
export function activeWordAt(segments: readonly TimingSegment[] | null, ms: number): number | null {
  if (!segments) return null;
  for (const s of segments) if (ms >= s[2] && ms < s[3]) return s[0];
  return null;
}

/** A run of 0-based words, `first` through `end - 1`. */
export interface WordSpan {
  first: number;
  end: number;
}

/**
 * The words being recited `ms` into the ayah's audio. A segment may cover several words the aligner could not tell
 * apart: all of them are returned, so the reader lights the run instead of guessing one. Null in a pause or a gap.
 */
export function activeSpanAt(segments: readonly TimingSegment[] | null, ms: number): WordSpan | null {
  if (!segments) return null;
  for (const s of segments) {
    if (ms >= s[2] && ms < s[3]) return { first: s[0], end: s[1] > s[0] ? s[1] : s[0] + 1 };
  }
  return null;
}

/** The audio span for one 0-based word. A degenerate `[n, n, …]` span is read as word `n` alone. */
export function spanForWord(segments: readonly TimingSegment[] | null, wordIndex: number): { startMs: number; endMs: number } | null {
  if (!segments) return null;
  for (const s of segments) {
    const end = s[1] > s[0] ? s[1] : s[0] + 1;
    if (wordIndex >= s[0] && wordIndex < end) return { startMs: s[2], endMs: s[3] };
  }
  return null;
}

const AUX_NAME = "timings.json";

/** Parsed timings from the device, or null when there are none (or they are unreadable). */
export async function readCachedTimings(store: AudioStore, reciter: Reciter): Promise<TimingTable | null> {
  if (!reciter.timings) return null;
  const bytes = await store.readAux(reciter.id, AUX_NAME);
  if (!bytes) return null;
  try {
    return parseTimings(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Fetches (once) and caches a reciter's timings. Resolves null on any failure: word timing is strictly optional and
 * must never block, or fail, audio. A reciter without published timings costs no network request at all.
 */
export async function loadTimings(args: { store: AudioStore; http: AudioHttp; reciter: Reciter; signal?: AbortSignal }): Promise<TimingTable | null> {
  const { store, http, reciter, signal } = args;
  if (!reciter.timings) return null;
  const cached = await readCachedTimings(store, reciter);
  if (cached) return cached;
  try {
    const res = await http.get(reciter.timings.url, { timeoutMs: 60_000, signal });
    if (res.status !== 200) return null;
    const table = parseTimings(JSON.parse(new TextDecoder().decode(res.bytes)));
    if (!table) return null;
    await store.writeAux(reciter.id, AUX_NAME, res.bytes).catch(() => undefined);
    return table;
  } catch {
    return null;
  }
}
