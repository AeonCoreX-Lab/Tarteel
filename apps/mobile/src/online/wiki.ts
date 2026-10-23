import { wikiLanguage } from "@tarteel/core";
import type { WikiArticle, WikiClient, WikiHit, WikiLanguage } from "@tarteel/core";
import { useSettings } from "../state/settings";
import { useRemote } from "../hadith/hooks";
import type { Remote } from "../hadith/hooks";
import { getWikiClient, wikipediaEnabled } from "./runtime";

/** Whether Wikipedia lookups may be made now: the build offers them AND the person turned them on. */
export function useWikiAllowed(): boolean {
  const on = useSettings((s) => s.onlineWikipedia);
  return wikipediaEnabled && on;
}

export interface WikiResults {
  /** The language the results are in: the app's language, or English where nothing was found in it. */
  language: WikiLanguage;
  hits: WikiHit[];
}

/**
 * Searches Wikipedia in the app's language and, if that finds nothing, in English. `build` makes the search words for a
 * language; `key` says when they change (a different surah, a different entry).
 */
export function useWikiLookup(build: (language: WikiLanguage) => string, key: string): { state: Remote<WikiResults>; retry: () => void; preferred: WikiLanguage } {
  const allowed = useWikiAllowed();
  const preferred = wikiLanguage(useSettings((s) => s.uiLanguage));
  const lookup = useRemote(
    allowed,
    getWikiClient,
    async (c: WikiClient, signal: AbortSignal): Promise<WikiResults> => {
      const first = await c.search(preferred, build(preferred), 5, signal);
      if (first.length > 0 || preferred === "en") return { language: preferred, hits: first };
      return { language: "en", hits: await c.search("en", build("en"), 5, signal) };
    },
    [preferred, key],
  );
  return { ...lookup, preferred };
}

export function useWikiArticle(language: WikiLanguage, title: string): { state: Remote<WikiArticle>; retry: () => void } {
  const allowed = useWikiAllowed();
  return useRemote(allowed, getWikiClient, (c: WikiClient, signal: AbortSignal) => c.article(language, title, signal), [language, title]);
}
