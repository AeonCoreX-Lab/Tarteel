import type { QuranpediaBookAnswer, QuranpediaClient, QuranpediaSurahInfo } from "@tarteel/core";
import { useSettings } from "../state/settings";
import { useRemote } from "../hadith/hooks";
import type { Remote } from "../hadith/hooks";
import { getQuranpediaClient, quranpediaEnabled } from "./runtime";

/** Whether Quranpedia lookups may be made now: the build offers them AND the person turned them on. */
export function useQuranpediaAllowed(): boolean {
  const on = useSettings((s) => s.onlineQuranpedia);
  return quranpediaEnabled && on;
}

export function useQuranpediaSurahInfo(surah: number): { state: Remote<QuranpediaSurahInfo>; retry: () => void } {
  const allowed = useQuranpediaAllowed();
  return useRemote(allowed, getQuranpediaClient, (c: QuranpediaClient, signal: AbortSignal) => c.surahInfo(surah, signal), [surah]);
}

export function useQuranpediaBook(bookId: number, surah: number, ayah: number, enabled: boolean): { state: Remote<QuranpediaBookAnswer>; retry: () => void } {
  const allowed = useQuranpediaAllowed();
  return useRemote(allowed && enabled, getQuranpediaClient, (c: QuranpediaClient, signal: AbortSignal) => c.ayahBook(bookId, surah, ayah, signal), [bookId, surah, ayah]);
}
