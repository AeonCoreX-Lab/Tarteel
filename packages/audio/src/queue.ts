import { ayahUrl } from "./catalog.ts";
import { audioRefOf, nextAyah } from "./refs.ts";
import type { AyahRef, PlayerTrack, Reciter } from "./types.ts";

/** Hard cap so repeat expansion can never build a pathological queue. */
export const MAX_QUEUE_TRACKS = 700;
/** Ayahs queued ahead while listening continuously, and the point at which the queue is topped up. */
export const LISTEN_WINDOW = 200;
export const LISTEN_REFILL_AT = 60;
/** How many upcoming ayahs are warmed onto disk. */
export const PREFETCH_AHEAD = 3;

/** `surah:ayah:index`. The index keeps ids unique when the same ayah is queued twice (repeats). */
export function trackId(ref: AyahRef, index: number): string {
  return `${ref.surahId}:${ref.ayahNumber}:${index}`;
}

export function parseTrackId(id: string): AyahRef | null {
  const m = /^(\d+):(\d+):\d+$/.exec(id);
  return m ? { surahId: Number(m[1]), ayahNumber: Number(m[2]) } : null;
}

/**
 * Memorisation repeats: each ayah ×`eachAyah`, then the whole sequence ×`range`.
 * Range repeats are trimmed first, then ayah repeats, to stay under the queue cap.
 */
export function applyRepeats(refs: readonly AyahRef[], eachAyah: number, range: number, max = MAX_QUEUE_TRACKS): AyahRef[] {
  let per = Math.max(1, Math.min(10, Math.floor(eachAyah) || 1));
  let whole = Math.max(1, Math.min(10, Math.floor(range) || 1));
  while (refs.length * per * whole > max && whole > 1) whole -= 1;
  while (refs.length * per * whole > max && per > 1) per -= 1;
  const once: AyahRef[] = [];
  for (const r of refs) for (let i = 0; i < per; i++) once.push(r);
  const out: AyahRef[] = [];
  for (let i = 0; i < whole; i++) out.push(...once);
  return out.slice(0, max);
}

/** The next `count` ayahs from `start` inclusive, and where to resume (null at the end of the book). */
export function listenWindow(start: AyahRef, count: number): { refs: AyahRef[]; cursor: AyahRef | null } {
  const refs: AyahRef[] = [];
  let cur: AyahRef | null = start;
  while (cur && refs.length < count) {
    refs.push(cur);
    cur = nextAyah(cur);
  }
  return { refs, cursor: cur };
}

export interface BuildTracksArgs {
  refs: readonly AyahRef[];
  reciter: Reciter;
  /** Local file URI for an ayah's recording, or null when it is not on the device. Asked for a Bismillah as 1:1. */
  localUri: (ref: AyahRef) => string | null;
  /** Whether a missing ayah may be streamed. When false, the queue stops at the first missing ayah. */
  allowStreaming: boolean;
  label: (ref: AyahRef) => { title: string; album?: string };
  /** Where these tracks start in the queue; ids must stay unique across top-ups. */
  indexOffset?: number;
}

export interface BuiltTracks {
  tracks: PlayerTrack[];
  /** The first ayah that is neither on the device nor allowed to stream. Tracks stop just before it. */
  blockedAt: AyahRef | null;
}

/** Local file when downloaded, stream otherwise, and nothing at all rather than a silent skip when streaming is off. */
export function buildTracks(a: BuildTracksArgs): BuiltTracks {
  const tracks: PlayerTrack[] = [];
  const offset = a.indexOffset ?? 0;
  for (let i = 0; i < a.refs.length; i++) {
    const ref = a.refs[i] as AyahRef;
    // A Bismillah has no file of its own: it plays the recording of 1:1.
    const source = audioRefOf(ref);
    const local = a.localUri(source);
    // Reported as the surah's first ayah: that is what the reader sees, and "download this surah" fetches the file.
    if (!local && !a.allowStreaming) return { tracks, blockedAt: source === ref ? ref : { surahId: ref.surahId, ayahNumber: 1 } };
    const { title, album } = a.label(ref);
    tracks.push({ id: trackId(ref, offset + i), url: local ?? ayahUrl(a.reciter, source), title, artist: a.reciter.name, album });
  }
  return { tracks, blockedAt: null };
}

/**
 * The pause after an ayah that finished by itself, for the "recite it back in the gap" memorisation drill:
 * `duration × factor`, capped at 30 s. Null when there should be no pause (factor 0, a skip rather than a natural end,
 * or a pause too short to matter).
 */
export function pauseBetweenRepeatsMs(args: { lastDurationSec: number; lastPositionSec: number; factor: number }): number | null {
  const { lastDurationSec, lastPositionSec, factor } = args;
  if (!(factor > 0) || !(lastDurationSec > 0)) return null;
  if (lastPositionSec < lastDurationSec - 0.4) return null; // skipped, not finished
  const ms = Math.min(30_000, lastDurationSec * factor * 1000);
  return ms < 250 ? null : ms;
}

export interface PrefetchTarget {
  index: number;
  ref: AyahRef;
  id: string;
}

/** Upcoming queue entries that are still remote URLs, i.e. worth warming onto disk. */
export function prefetchTargets(queue: readonly PlayerTrack[], activeIndex: number, ahead = PREFETCH_AHEAD): PrefetchTarget[] {
  const out: PrefetchTarget[] = [];
  const last = Math.min(activeIndex + ahead, queue.length - 1);
  for (let i = activeIndex + 1; i <= last; i++) {
    const t = queue[i];
    if (!t || !t.url.startsWith("https://")) continue;
    const ref = parseTrackId(t.id);
    if (ref) out.push({ index: i, ref, id: t.id });
  }
  return out;
}

/**
 * An entry may be swapped from URL to file only when it is at least two places ahead: the player may already be
 * buffering the immediate next item, and replacing it would cause the very gap prefetching exists to remove.
 */
export function canSwapAt(index: number, activeIndex: number | null): boolean {
  return activeIndex !== null && index >= activeIndex + 2;
}

