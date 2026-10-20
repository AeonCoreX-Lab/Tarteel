import { useCallback, useEffect, useRef, useState } from "react";
import { HadithError, hadeethLanguage } from "@tarteel/core";
import type { HadeethCategory, HadeethClient, HadeethEntry, HadeethLanguage, HadeethSummary } from "@tarteel/core";
import { useSettings } from "../state/settings";
import { useRemote } from "./hooks";
import type { Remote } from "./hooks";
import { getHadeethClient, hadeethEncEnabled } from "./runtime";

/** Whether HadeethEnc lookups may be made now: the build offers them AND the person turned them on. */
export function useHadeethAllowed(): boolean {
  const on = useSettings((s) => s.onlineHadeethEnc);
  return hadeethEncEnabled && on;
}

/** The language to ask HadeethEnc for: the app's language, or English where the app's language is not one it is asked in. */
export function useHadeethLanguage(): HadeethLanguage {
  return hadeethLanguage(useSettings((s) => s.uiLanguage));
}

function useLookup<T>(enabled: boolean, load: (c: HadeethClient, signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): { state: Remote<T>; retry: () => void } {
  return useRemote(enabled, getHadeethClient, load, deps);
}

export function useHadeethCategories(): { state: Remote<HadeethCategory[]>; retry: () => void; language: HadeethLanguage } {
  const allowed = useHadeethAllowed();
  const language = useHadeethLanguage();
  return { ...useLookup(allowed, (c, s) => c.categories(language, s), [language]), language };
}

export function useHadeethEntry(id: string): { state: Remote<HadeethEntry>; retry: () => void; language: HadeethLanguage } {
  const allowed = useHadeethAllowed();
  const language = useHadeethLanguage();
  return { ...useLookup(allowed, (c, s) => c.hadeeth(language, id, s), [language, id]), language };
}

/** The hadith of one category, a page at a time; `more` adds the next page. */
export function useHadeethList(categoryId: string): { items: HadeethSummary[]; total: number; hasMore: boolean; state: Remote<null>; more: () => void; retry: () => void } {
  const allowed = useHadeethAllowed();
  const language = useHadeethLanguage();
  const [items, setItems] = useState<HadeethSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<Remote<null>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const nextPage = useRef(1);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback((page: number) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    busy.current = true;
    setState({ status: "loading" });
    getHadeethClient().hadeeths(language, categoryId, { page, perPage: 20 }, c.signal).then(
      (res) => {
        if (c.signal.aborted) return;
        nextPage.current = page + 1;
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items.filter((n) => !prev.some((p) => p.id === n.id))]));
        setTotal(res.total);
        setHasMore(res.page < res.lastPage);
        busy.current = false;
        setState({ status: "ready", value: null });
      },
      (e: unknown) => {
        if (c.signal.aborted) return;
        busy.current = false;
        setState(e instanceof HadithError ? { status: "error", code: e.code, retryAfterSeconds: e.retryAfterSeconds } : { status: "error", code: "network", retryAfterSeconds: null });
      },
    );
  }, [language, categoryId]);

  useEffect(() => {
    if (!allowed) return undefined;
    nextPage.current = 1;
    setItems([]);
    setTotal(0);
    setHasMore(false);
    load(1);
    return () => controller.current?.abort();
  }, [allowed, load, attempt]);

  const more = useCallback(() => {
    if (!busy.current && hasMore) load(nextPage.current);
  }, [load, hasMore]);
  const retry = useCallback(() => {
    if (nextPage.current === 1) setAttempt((a) => a + 1);
    else load(nextPage.current);
  }, [load]);
  return { items, total, hasMore, state, more, retry };
}
