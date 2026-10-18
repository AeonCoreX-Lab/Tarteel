import { useCallback, useEffect, useRef, useState } from "react";
import { HadithError } from "@tarteel/core";
import type { HadithBook, HadithClient, HadithCollection, HadithEntry, HadithErrorCode, HadithHit, HadithPage } from "@tarteel/core";
import { useSettings } from "../state/settings";
import type { StringKey } from "../i18n";
import { getHadithClient, hadithEnabled } from "./runtime";

/** Whether lookups may be made now: the build offers them AND the person turned them on. */
export function useHadithAllowed(): boolean {
  const on = useSettings((s) => s.onlineHadith);
  return hadithEnabled && on;
}

export type Remote<T> = { status: "idle" | "loading" } | { status: "ready"; value: T } | { status: "error"; code: HadithErrorCode; retryAfterSeconds: number | null };

const toError = (e: unknown): { status: "error"; code: HadithErrorCode; retryAfterSeconds: number | null } =>
  e instanceof HadithError ? { status: "error", code: e.code, retryAfterSeconds: e.retryAfterSeconds } : { status: "error", code: "network", retryAfterSeconds: null };

/** What to tell the person for each way a lookup can fail. */
export function errorKey(code: HadithErrorCode): StringKey {
  switch (code) {
    case "network":
    case "timeout":
      return "hadErrNetwork";
    case "rate-limited":
      return "hadErrRate";
    case "not-found":
      return "hadErrNotFound";
    default:
      return "hadErrServer";
  }
}

/** One lookup, made when `enabled` and again when `deps` change or `retry` is called. A lookup that was overtaken is cancelled. */
function useLookup<T>(enabled: boolean, load: (c: HadithClient, signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): { state: Remote<T>; retry: () => void } {
  const [state, setState] = useState<Remote<T>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const run = useCallback(load, deps);
  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    run(getHadithClient(), controller.signal).then(
      (value) => !controller.signal.aborted && setState({ status: "ready", value }),
      (e: unknown) => !controller.signal.aborted && setState(toError(e)),
    );
    return () => controller.abort();
  }, [enabled, run, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}

export function useHadithCollections(): { state: Remote<HadithCollection[]>; retry: () => void } {
  const allowed = useHadithAllowed();
  return useLookup(allowed, (c, s) => c.collections(s), []);
}

export function useHadithBooks(collection: string): { state: Remote<HadithBook[]>; retry: () => void } {
  const allowed = useHadithAllowed();
  return useLookup(allowed, (c, s) => c.books(collection, s), [collection]);
}

export function useHadithEntry(collection: string, book: string, number: string): { state: Remote<HadithEntry>; retry: () => void } {
  const allowed = useHadithAllowed();
  return useLookup(allowed, (c, s) => c.hadith(collection, book, number, s), [collection, book, number]);
}

/** Search as the person types: nothing under two characters, one request 600 ms after the last keystroke. */
export function useHadithSearch(query: string, collection?: string): { state: Remote<HadithPage<HadithHit>>; retry: () => void } {
  const allowed = useHadithAllowed();
  const q = query.trim();
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(q), 600);
    return () => clearTimeout(timer);
  }, [q]);
  const active = allowed && settled.length >= 2 && settled === q;
  return useLookup(active, (c, s) => c.search(settled, { collection, limit: 20 }, s), [settled, collection]);
}

/** The hadith of one book, a page at a time; `more` adds the next page. */
export function useHadithList(collection: string, book: string): { items: HadithEntry[]; total: number; state: Remote<null>; more: () => void; retry: () => void } {
  const allowed = useHadithAllowed();
  const [items, setItems] = useState<HadithEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<Remote<null>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const offset = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback((from: number) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    busy.current = true;
    setState({ status: "loading" });
    getHadithClient().hadiths(collection, book, { limit: 20, offset: from }, c.signal).then(
      (page) => {
        if (c.signal.aborted) return;
        offset.current = from + page.items.length;
        setItems((prev) => (from === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
        busy.current = false;
        setState({ status: "ready", value: null });
      },
      (e: unknown) => {
        if (c.signal.aborted) return;
        busy.current = false;
        setState(toError(e));
      },
    );
  }, [collection, book]);

  useEffect(() => {
    if (!allowed) return undefined;
    offset.current = 0;
    setItems([]);
    setTotal(0);
    load(0);
    return () => controller.current?.abort();
  }, [allowed, load, attempt]);

  const more = useCallback(() => {
    if (!busy.current && offset.current < total) load(offset.current);
  }, [load, total]);
  const retry = useCallback(() => {
    if (offset.current === 0) setAttempt((a) => a + 1);
    else load(offset.current);
  }, [load]);
  return { items, total, state, more, retry };
}
