import { createAudioStore, createDownloadManager, createPlaybackController, createTimingCache, findReciter, isBasmalahRef, loadTimings, offeredReciters, parseCatalog, prefetchAyah, readCachedTimings, surahRefs } from "@tarteel/audio";
import type { AyahRef, PlaybackPolicy, Reciter, TimingTable } from "@tarteel/audio";
import { opensWithBismillahHeading } from "@tarteel/quran-data";
import type { Repositories } from "@tarteel/database";
import { useSettings } from "../state/settings";
import { createExpoFileStore, freeDiskBytes } from "./fileStore";
import { createFetchHttp } from "./http";
import { createTrackPlayerPort, wirePlayerEvents } from "./player";

/* eslint-disable @typescript-eslint/no-require-imports */
const catalog = parseCatalog(require("../../assets/audio/reciters.json"));
if (catalog.errors.length) console.warn("[audio] reciter catalog problems:", catalog.errors.join("; "));

/** Only enabled, licence-verified reciters are ever offered. An empty list means the build ships no recitation. */
export const RECITERS: readonly Reciter[] = offeredReciters(catalog.reciters);

const files = createExpoFileStore();
const store = createAudioStore(files);
const http = createFetchHttp();

/** Surah names for the lock-screen title, filled from the content database once it is open. */
const surahNames = new Map<number, { name: string; ayahCount: number }>();
export async function initAudio(repos: Repositories): Promise<void> {
  for (const s of await repos.quran.getSurahs()) surahNames.set(s.id, { name: s.nameTransliteration, ayahCount: s.ayahCount });
}
export function surahLabel(surahId: number): string {
  return surahNames.get(surahId)?.name ?? `Surah ${surahId}`;
}

/** The chosen reciter, or the first offered one when nothing is chosen yet, or null when none are offered. */
export function selectedReciter(): Reciter | null {
  return findReciter(RECITERS, useSettings.getState().audioReciterId) ?? RECITERS[0] ?? null;
}

function policy(): PlaybackPolicy {
  const s = useSettings.getState();
  return { allowStreaming: s.audioAllowStreaming, rate: s.audioPlaybackRate, repeatEachAyah: s.audioRepeatEachAyah, repeatRange: s.audioRepeatRange, pauseFactor: s.audioPauseFactor };
}

const port = createTrackPlayerPort();

const controller = createPlaybackController({
  player: {
    ...port,
    setup: async () => {
      await port.setup();
      wirePlayerEvents(controller);
    },
  },
  getReciter: selectedReciter,
  getPolicy: policy,
  localUri: (reciter, ref) => store.localPath(reciter.id, ref),
  prefetch: (reciter, ref) => prefetchAyah({ store, http, reciter, ref }),
  label: (ref) => {
    const n = surahNames.get(ref.surahId);
    if (isBasmalahRef(ref)) return { title: `${surahLabel(ref.surahId)} · Bismillah`, album: surahLabel(ref.surahId) };
    return { title: `${surahLabel(ref.surahId)} · ${ref.ayahNumber}${n ? ` / ${n.ayahCount}` : ""}`, album: surahLabel(ref.surahId) };
  },
  onListened: (ref, reciterId) => useSettings.getState().set("lastListened", { surahId: ref.surahId, ayahNumber: ref.ayahNumber, reciterId, at: Date.now(), pausedAt: null }),
  onPausedChange: (paused) => {
    const cur = useSettings.getState().lastListened;
    if (cur) useSettings.getState().set("lastListened", { ...cur, pausedAt: paused ? (cur.pausedAt ?? Date.now()) : null });
  },
});

const manager = createDownloadManager({
  store,
  http,
  getReciter: (id) => findReciter(RECITERS, id),
  freeBytes: async () => freeDiskBytes(),
});

/**
 * Word timings for the reader's highlight. They are a download like the audio: read from the device, and fetched only
 * when streaming is allowed (a surah or reciter download fetches them itself). With neither, the reader lights the
 * whole ayah and nothing goes online.
 */
const timingCache = createTimingCache({
  publishes: (id) => Boolean(findReciter(RECITERS, id)?.timings),
  load: async (id) => {
    const reciter = findReciter(RECITERS, id);
    if (!reciter) return null;
    return useSettings.getState().audioAllowStreaming ? loadTimings({ store, http, reciter }) : readCachedTimings(store, reciter);
  },
});
export function getTimings(reciterId: string): Promise<TimingTable | null> {
  return timingCache.get(reciterId);
}

/** The app's one audio runtime. Screens use it through `hooks.ts`; nothing else touches the player or the disk. */
export const audio = { store, manager, controller };

/** Queue the missing ayahs of a surah for download (a no-op while another download runs). */
export async function downloadSurah(reciter: Reciter, surahId: number): Promise<void> {
  const status = await store.surahStatus(reciter.id, surahId);
  // The surah's Bismillah plays the recording of 1:1, so the surah is not playable offline without that file.
  const bismillah: AyahRef = { surahId: 1, ayahNumber: 1 };
  const needBismillah = opensWithBismillahHeading(surahId) && !reciter.bismillahInFirstAyah && !(await store.hasAyah(reciter.id, bismillah));
  if (status.missing.length === 0 && !needBismillah) return;
  const refs: AyahRef[] = surahRefs(surahId).filter((r) => status.missing.includes(r.ayahNumber));
  if (needBismillah) refs.unshift(bismillah);
  await manager.start({ kind: "surah", reciterId: reciter.id, surahId, refs });
}
