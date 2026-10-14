import { estimateReciterBytes } from "./catalog.ts";
import { runAyahDownload } from "./download.ts";
import type { AudioHttp, DownloadOutcome, DownloadProgress } from "./download.ts";
import { allAyahRefs, surahRefs, totalAyahCount } from "./refs.ts";
import type { AudioStore } from "./store.ts";
import { loadTimings } from "./timing.ts";
import type { AyahRef, Reciter } from "./types.ts";

export type DownloadJob =
  /** One reciter's whole Quran. */
  | { kind: "reciter"; reciterId: string }
  /** One surah in one voice; `refs` limits it to the missing ayahs so the progress counts the work that is left. */
  | { kind: "surah"; reciterId: string; surahId: number; refs?: readonly AyahRef[] };

export type DownloadErrorCode = "no-space" | "unknown-reciter" | "failed-to-start";

export interface LastRun {
  job: DownloadJob;
  complete: boolean;
  cancelled: boolean;
  interrupted: boolean;
  failed: number;
  done: number;
  total: number;
  error?: DownloadErrorCode;
}

export interface DownloadState {
  running: DownloadJob | null;
  progress: DownloadProgress;
  /** How the last run ended, for a screen that was not mounted when it did. Cleared when the next starts. */
  last: LastRun | null;
}

export interface DownloadManagerDeps {
  store: AudioStore;
  http: AudioHttp;
  getReciter: (id: string) => Reciter | null;
  /** Free bytes on the device; absent means the space check is skipped. */
  freeBytes?: () => Promise<number>;
  /** Cancel a run that makes no progress for this long, so it can never wedge the manager. Default 3 minutes. */
  stallMs?: number;
  /** Extra headroom required on top of the estimate. Default 64 MB. */
  spaceMarginBytes?: number;
}

export interface DownloadManager {
  getState(): DownloadState;
  subscribe(listener: (s: DownloadState) => void): () => void;
  /** Starts a job. A no-op returning `started: false` while anything is running: one download at a time. */
  start(job: DownloadJob): Promise<{ started: boolean }>;
  /** Cancelling is something a person does; it is never reported as an interruption. */
  cancel(): void;
  isRunning(job: DownloadJob): boolean;
}

const EMPTY: DownloadProgress = { done: 0, total: 0, failed: 0 };

function sameJob(a: DownloadJob, b: DownloadJob): boolean {
  if (a.kind !== b.kind || a.reciterId !== b.reciterId) return false;
  return a.kind === "surah" && b.kind === "surah" ? a.surahId === b.surahId : true;
}

/**
 * Downloads are owned by the app, not by a screen: leaving a screen never cancels anything. The only two things that
 * end a run are finishing and being cancelled. Progress is published at most once per percent (plus the final one),
 * because a whole-Quran run reports 6,236 times and each report would re-render every subscribed screen.
 */
export function createDownloadManager(deps: DownloadManagerDeps): DownloadManager {
  const stallMs = deps.stallMs ?? 180_000;
  const margin = deps.spaceMarginBytes ?? 64 * 1024 * 1024;
  let state: DownloadState = { running: null, progress: EMPTY, last: null };
  let abort: AbortController | null = null;
  let cancelledByUser = false;
  let lastPct = -1;
  const listeners = new Set<(s: DownloadState) => void>();

  const publish = (next: DownloadState): void => {
    state = next;
    for (const l of [...listeners]) {
      try {
        l(state);
      } catch {
        // a subscriber that throws must not take the download with it
      }
    }
  };

  const finish = (job: DownloadJob, o: Partial<LastRun> & { complete: boolean }): void => {
    publish({
      running: null,
      progress: state.progress,
      last: { job, cancelled: false, interrupted: false, failed: 0, done: state.progress.done, total: state.progress.total, ...o },
    });
  };

  async function bytesStillNeeded(job: DownloadJob, reciter: Reciter): Promise<number> {
    if (job.kind !== "reciter") return 0; // one surah is small; the margin covers it
    const have = (await deps.store.reciterStats(reciter.id)).bytes;
    return Math.max(0, estimateReciterBytes(reciter) - have);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    isRunning: (job) => state.running !== null && sameJob(state.running, job),
    cancel() {
      if (!abort) return;
      cancelledByUser = true;
      abort.abort();
    },
    async start(job) {
      if (state.running) return { started: false };
      // Claim the slot synchronously, before any await, so two quick taps cannot both start.
      const controller = new AbortController();
      abort = controller;
      cancelledByUser = false;
      lastPct = -1;
      const reciter = deps.getReciter(job.reciterId);
      const refs = job.kind === "reciter" ? allAyahRefs() : [...(job.refs ?? surahRefs(job.surahId))];
      const total = job.kind === "reciter" ? totalAyahCount() : refs.length;
      publish({ running: job, progress: { done: 0, total, failed: 0 }, last: null });
      if (!reciter) {
        abort = null;
        finish(job, { complete: false, error: "unknown-reciter" });
        return { started: true };
      }

      let watchdog: ReturnType<typeof setInterval> | null = null;
      try {
        if (deps.freeBytes) {
          const need = await bytesStillNeeded(job, reciter);
          if (need > 0 && need + margin > (await deps.freeBytes())) {
            finish(job, { complete: false, error: "no-space" });
            return { started: true };
          }
        }
        let lastProgressAt = Date.now();
        watchdog = setInterval(() => {
          if (Date.now() - lastProgressAt > stallMs) controller.abort();
        }, Math.max(10, Math.min(15_000, Math.floor(stallMs / 4))));

        // The words come with the audio, best effort: a download that fails here must not fail the audio.
        void loadTimings({ store: deps.store, http: deps.http, reciter, signal: controller.signal });

        const outcome: DownloadOutcome = await runAyahDownload({
          store: deps.store,
          http: deps.http,
          reciter,
          refs,
          signal: controller.signal,
          onProgress: (p) => {
            lastProgressAt = Date.now();
            const pct = Math.floor((p.done / Math.max(1, p.total)) * 100);
            if (pct === lastPct && p.done !== p.total) return;
            lastPct = pct;
            publish({ ...state, progress: p });
          },
        });
        const stalled = outcome.cancelled && !cancelledByUser;
        state = { ...state, progress: { done: outcome.done, total: outcome.total, failed: outcome.failed } };
        finish(job, {
          complete: outcome.complete,
          cancelled: outcome.cancelled && cancelledByUser,
          // A run that stalled is "the files stopped arriving": come back to it, do not call it failed.
          interrupted: outcome.interrupted || stalled,
          failed: outcome.failed,
          done: outcome.done,
          total: outcome.total,
        });
      } catch {
        finish(job, { complete: false, error: "failed-to-start" });
      } finally {
        if (watchdog) clearInterval(watchdog);
        abort = null;
      }
      return { started: true };
    },
  };
}
