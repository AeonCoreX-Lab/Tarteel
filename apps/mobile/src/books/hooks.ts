import { useCallback, useEffect, useState } from "react";
import type { IslamicBookDetail, IslamicBookSummary, IslamicBookText, IslamicBooksClient, IslamicGenre, IslamicSearchHit, OpenItiSaved } from "@tarteel/core";
import { useRemote } from "../hadith/hooks";
import type { Remote } from "../hadith/hooks";
import { getIslamicBooksClient, islamicBooksEnabled, openItiEnabled } from "../online/runtime";
import { useSettings } from "../state/settings";
import { booksBytes, listSaved } from "./store";

/** Whether islamic.app may be asked now: the build offers it AND the person turned it on. */
export function useIslamicBooksAllowed(): boolean {
  const on = useSettings((s) => s.onlineIslamicBooks);
  return islamicBooksEnabled && on;
}

/** Whether the OpenITI list and books may be downloaded now. Reading a book already kept needs neither. */
export function useOpenItiAllowed(): boolean {
  const on = useSettings((s) => s.onlineOpenIti);
  return openItiEnabled && on;
}

const PAGE = 30;

type Load<T> = (c: IslamicBooksClient, signal: AbortSignal) => Promise<T>;
function useBooksRemote<T>(enabled: boolean, load: Load<T>, deps: readonly unknown[]): { state: Remote<T>; retry: () => void } {
  return useRemote(enabled, getIslamicBooksClient, load, deps);
}

export function useIslamicGenres(): { state: Remote<IslamicGenre[]>; retry: () => void } {
  const allowed = useIslamicBooksAllowed();
  return useBooksRemote(allowed, (c, s) => c.genres(s), []);
}

export function useIslamicBook(slug: string): { state: Remote<IslamicBookDetail>; retry: () => void } {
  const allowed = useIslamicBooksAllowed();
  return useBooksRemote(allowed, (c, s) => c.book(slug, s), [slug]);
}

/** The whole text of a book. Held only while the reader is open. */
export function useIslamicBookText(slug: string, enabled: boolean): { state: Remote<IslamicBookText>; retry: () => void } {
  const allowed = useIslamicBooksAllowed();
  return useBooksRemote(allowed && enabled, (c, s) => c.text(slug, s), [slug]);
}

/** A search runs only when asked for (the publisher allows about ten a minute), never while typing. */
export function useIslamicSearch(query: string, genre: string): { state: Remote<IslamicSearchHit[]>; retry: () => void } {
  const allowed = useIslamicBooksAllowed();
  const q = query.trim();
  return useBooksRemote(allowed && q.length >= 2, (c, s) => c.search(q, { genre: genre === "" ? undefined : genre, limit: 30 }, s), [q, genre]);
}

/** The books of a genre, a page at a time: `loadMore` asks for the next page and adds it below. */
export function useIslamicBookList(genre: string): { items: IslamicBookSummary[]; total: number; state: Remote<unknown>; retry: () => void; loadMore: () => void; hasMore: boolean } {
  const allowed = useIslamicBooksAllowed();
  const [page, setPage] = useState<{ genre: string; offset: number }>({ genre, offset: 0 });
  const [acc, setAcc] = useState<{ genre: string; items: IslamicBookSummary[]; total: number }>({ genre, items: [], total: 0 });
  const offset = page.genre === genre ? page.offset : 0;
  const { state, retry } = useBooksRemote(allowed, (c, s) => c.books({ genre: genre === "" ? undefined : genre, limit: PAGE, offset }, s), [genre, offset]);
  useEffect(() => {
    if (state.status !== "ready") return;
    const { books, total } = state.value;
    setAcc((prev) => {
      const base = prev.genre === genre && offset > 0 ? prev.items : [];
      const seen = new Set(base.map((b) => b.slug));
      return { genre, total, items: [...base, ...books.filter((b) => !seen.has(b.slug))] };
    });
  }, [state]);
  const shown = acc.genre === genre ? acc : { genre, items: [], total: 0 };
  const loadMore = useCallback(() => setPage({ genre, offset: shown.items.length }), [genre, shown.items.length]);
  return { items: shown.items, total: shown.total, state, retry, loadMore, hasMore: shown.items.length < shown.total };
}

/** The OpenITI books kept on this device, and the space they use. `reload` after a change. */
export function useSavedBooks(): { saved: OpenItiSaved[] | null; bytes: number; reload: () => void } {
  const [saved, setSaved] = useState<OpenItiSaved[] | null>(null);
  const [bytes, setBytes] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, size] = await Promise.all([listSaved(), booksBytes().catch(() => 0)]);
      if (!cancelled) {
        setSaved(list);
        setBytes(size);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [n]);
  return { saved, bytes, reload: useCallback(() => setN((x) => x + 1), []) };
}
