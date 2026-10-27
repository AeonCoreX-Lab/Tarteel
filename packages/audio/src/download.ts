import { ayahUrl } from "./catalog.ts";
import { assertAudioBytes } from "./mp3.ts";
import type { AudioStore } from "./store.ts";
import type { AyahRef, Reciter } from "./types.ts";

/** The network, as the download engine needs it. The platform adapter supplies the real one. */
export interface AudioHttp {
  /** Resolves with the status and the whole body; rejects on a network error or when `timeoutMs` passes. */
  get(url: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<{ status: number; bytes: Uint8Array }>;
}

export interface DownloadProgress {
  /** Files settled so far: downloaded, already on disk, or failed. */
  done: number;
  total: number;
  failed: number;
}

/**
 * How a run ended. Three endings, not two, because they call for different screens:
 * - `complete`: every file is on disk;
 * - `interrupted`: the files stopped arriving altogether (the connection went), nothing is wrong, come back later;
 * - otherwise some files would not come (404, corrupt body) and the rest arrived: there is something to report.
 */
export interface DownloadOutcome {
  complete: boolean;
  interrupted: boolean;
  cancelled: boolean;
  done: number;
  total: number;
  failed: number;
}

/** One file failing is a file; this many in a row, across the workers, is the connection. */
export const GIVE_UP_AFTER_CONSECUTIVE_FAILURES = 8;
/**
 * Islamic Network's answer on its community forum (2026-10): per-user downloads of a whole reciter have no restrictions, "but
 * please be mindful of the rate limits if downloads will be multi-threaded". So few workers, and a longer pause when the server
 * says "too many requests" or "unavailable" than for an ordinary failure.
 */
export const DEFAULT_WORKERS = 3;
export const RATE_LIMIT_PAUSE_MS = 2000;
export const AYAH_TIMEOUT_MS = 60_000;
export const PREFETCH_TIMEOUT_MS = 30_000;

const sleepReal = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class PermanentError extends Error {}
/** HTTP 429 or 503: the server asks for fewer requests. Retried, after a longer pause. */
class RateLimitedError extends Error {}

/** Fetches one ayah and commits it to the store. Retries transient failures, never a 404. Throws when it cannot. */
export async function fetchAyahToStore(args: {
  store: AudioStore;
  http: AudioHttp;
  reciter: Reciter;
  ref: AyahRef;
  attempts?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const { store, http, reciter, ref, signal } = args;
  const attempts = args.attempts ?? 3;
  const timeoutMs = args.timeoutMs ?? AYAH_TIMEOUT_MS;
  const sleep = args.sleep ?? sleepReal;
  const url = ayahUrl(reciter, ref);
  let last: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new Error("cancelled");
    try {
      const res = await http.get(url, { timeoutMs, signal });
      if (res.status === 404 || res.status === 403 || res.status === 410) throw new PermanentError(`HTTP ${res.status}`);
      if (res.status === 429 || res.status === 503) throw new RateLimitedError(`HTTP ${res.status}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      assertAudioBytes(res.bytes); // a 200 is not proof of audio: see looksLikeMp3
      return await store.commitAyah(reciter.id, ref, res.bytes);
    } catch (e) {
      last = e;
      if (e instanceof PermanentError || signal?.aborted) break;
      if (attempt < attempts) await sleep((e instanceof RateLimitedError ? RATE_LIMIT_PAUSE_MS : 400) * attempt);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export interface RunOptions {
  store: AudioStore;
  http: AudioHttp;
  reciter: Reciter;
  refs: readonly AyahRef[];
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  workers?: number;
  attempts?: number;
  timeoutMs?: number;
  giveUpAfter?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Works a queue of ayahs down to nothing, a few at a time.
 *
 * Resume is the whole story: a file already on disk and big enough to be real is skipped, so a cancelled or killed run
 * starts again from the top and spends a moment walking past what it has. There is no index or checkpoint to get out of
 * step with the files themselves, and a `.part` file is never counted as a download.
 *
 * A failure is counted, never thrown: six thousand files over a phone connection will lose some, and losing the other
 * five thousand nine hundred over it would be absurd. What failed is simply still missing for the next run to find.
 */
export async function runAyahDownload(opts: RunOptions): Promise<DownloadOutcome> {
  const { store, http, reciter, signal } = opts;
  const total = opts.refs.length;
  const pending = [...opts.refs];
  const workers = Math.max(1, opts.workers ?? DEFAULT_WORKERS);
  const giveUpAfter = opts.giveUpAfter ?? GIVE_UP_AFTER_CONSECUTIVE_FAILURES;
  let done = 0;
  let failed = 0;
  let inARow = 0;
  let interrupted = false;

  if (total === 0) return { complete: true, interrupted: false, cancelled: false, done: 0, total: 0, failed: 0 };

  const worker = async (): Promise<void> => {
    while (!signal?.aborted && !interrupted) {
      const ref = pending.shift();
      if (!ref) return;
      try {
        if (!(await store.hasAyah(reciter.id, ref))) {
          await fetchAyahToStore({ store, http, reciter, ref, attempts: opts.attempts, timeoutMs: opts.timeoutMs, signal, sleep: opts.sleep });
        }
        inARow = 0;
      } catch {
        if (signal?.aborted) return; // a cancelled fetch is not a failed file
        failed += 1;
        inARow += 1;
        if (inARow >= giveUpAfter) interrupted = true;
      }
      done += 1;
      opts.onProgress?.({ done, total, failed });
    }
  };

  await Promise.all(Array.from({ length: Math.min(workers, total) }, () => worker()));
  const cancelled = signal?.aborted === true;
  return {
    complete: !cancelled && !interrupted && failed === 0 && done === total,
    interrupted: interrupted && !cancelled,
    cancelled,
    done,
    total,
    failed,
  };
}

/**
 * Prefetch one ayah ahead of the listener. Best effort: resolves the local path, or null. It gives up sooner than a
 * download someone asked for, because a prefetch still in flight when the ayah arrives has already lost.
 */
export async function prefetchAyah(args: {
  store: AudioStore;
  http: AudioHttp;
  reciter: Reciter;
  ref: AyahRef;
  signal?: AbortSignal;
}): Promise<string | null> {
  try {
    const existing = await args.store.localPath(args.reciter.id, args.ref);
    if (existing) return existing;
    return await fetchAyahToStore({ ...args, attempts: 2, timeoutMs: PREFETCH_TIMEOUT_MS });
  } catch {
    return null;
  }
}
