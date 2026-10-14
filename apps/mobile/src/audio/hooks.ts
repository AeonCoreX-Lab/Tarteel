import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { DownloadState, PlaybackStatus, SurahAudioStatus } from "@tarteel/audio";
import { audio } from "./runtime";

export function usePlaybackStatus(): PlaybackStatus {
  return useSyncExternalStore(audio.controller.subscribe, audio.controller.getStatus, audio.controller.getStatus);
}

export function useDownloadState(): DownloadState {
  return useSyncExternalStore(audio.manager.subscribe, audio.manager.getState, audio.manager.getState);
}

/** How much of a surah is on disk for a reciter. Re-read when a download finishes. */
export function useSurahAudioStatus(reciterId: string | null, surahId: number): SurahAudioStatus | null {
  const [status, setStatus] = useState<SurahAudioStatus | null>(null);
  const running = useDownloadState().running;
  useEffect(() => {
    let cancelled = false;
    if (!reciterId) {
      setStatus(null);
      return;
    }
    void audio.store.surahStatus(reciterId, surahId).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [reciterId, surahId, running]);
  return status;
}

export type ReciterStats = Record<string, { files: number; bytes: number; complete: boolean }>;

/** Bytes and file counts for every reciter, from one directory listing each. Re-read when a download starts or ends. */
export function useReciterStats(ids: readonly string[]): { stats: ReciterStats; refresh: () => void } {
  const [stats, setStats] = useState<ReciterStats>({});
  const running = useDownloadState().running;
  const [tick, setTick] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    let cancelled = false;
    void Promise.all(key.split(",").filter(Boolean).map(async (id) => [id, await audio.store.reciterStats(id)] as const)).then((rows) => {
      if (!cancelled) setStats(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [key, running, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { stats, refresh };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
