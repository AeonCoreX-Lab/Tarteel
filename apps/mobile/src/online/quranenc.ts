import type { QuranEncAyah, QuranEncClient, QuranEncVersion } from "@tarteel/core";
import { useSettings } from "../state/settings";
import { useRemote } from "../hadith/hooks";
import type { Remote } from "../hadith/hooks";
import { getQuranEncClient, quranEncEnabled } from "./runtime";

/** Whether QuranEnc lookups may be made now: the build offers them AND the person turned them on. */
export function useQuranEncAllowed(): boolean {
  const on = useSettings((s) => s.onlineQuranEnc);
  return quranEncEnabled && on;
}

export function useQuranEncAya(edition: string, sura: number, aya: number): { state: Remote<QuranEncAyah>; retry: () => void } {
  const allowed = useQuranEncAllowed();
  return useRemote(allowed, getQuranEncClient, (c: QuranEncClient, signal: AbortSignal) => c.aya(edition, sura, aya, signal), [edition, sura, aya]);
}

export function useQuranEncSura(edition: string, sura: number, enabled: boolean): { state: Remote<QuranEncAyah[]>; retry: () => void } {
  const allowed = useQuranEncAllowed();
  return useRemote(allowed && enabled, getQuranEncClient, (c: QuranEncClient, signal: AbortSignal) => c.sura(edition, sura, signal), [edition, sura]);
}

/** The publisher's version number for each edition (the terms ask the app to state it). Not stored. */
export function useQuranEncVersions(): { state: Remote<Record<string, QuranEncVersion>>; retry: () => void } {
  const allowed = useQuranEncAllowed();
  return useRemote(allowed, getQuranEncClient, (c: QuranEncClient, signal: AbortSignal) => c.versions(signal), []);
}
