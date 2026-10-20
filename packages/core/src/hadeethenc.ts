/**
 * Live hadith lookup from HadeethEnc.com (IslamHouse.com). Nothing is stored: a hadith is fetched when the person opens it, shown
 * exactly as the publisher wrote it, and forgotten (a short in-memory cache only saves repeated taps in one session).
 *
 * The publisher's terms: the content may not be changed, added to or cut; the publisher (HadeethEnc.com) must be clearly credited.
 * So this module never rewrites a text: it only checks that a field is a string, and screens must show every field it returns
 * together with `HADEETHENC_CREDIT`. The terms say nothing about keeping copies, so the app keeps none; do not build a pack from
 * this API before IslamHouse has agreed in writing.
 *
 * It is browse-only: the API has no search. Pure TypeScript; the network is the same `HadithHttp` port the other hadith client uses.
 */

import { HadithError } from "./hadith.ts";
import type { HadithHttp, HadithHttpResponse } from "./hadith.ts";

export const HADEETHENC_API_BASE = "https://hadeethenc.com/api/v1";
export const HADEETHENC_SITE = "https://hadeethenc.com";

/** What every HadeethEnc screen must say about where the text came from. */
export const HADEETHENC_CREDIT = { source: "HadeethEnc.com", publisher: "IslamHouse.com", url: HADEETHENC_SITE } as const;

/** Languages this app can ask for. The API offers many more; these are the ones the app's own languages map to. */
export type HadeethLanguage = "en" | "bn" | "ar";

/** The language to ask the API for, given the app's language. Always one the API serves. */
export function hadeethLanguage(uiLanguage: string): HadeethLanguage {
  return uiLanguage === "bn" ? "bn" : uiLanguage === "ar" ? "ar" : "en";
}

// ------------------------------------------------------------------- model

export interface HadeethCategory {
  id: string;
  title: string;
  hadeethsCount: number;
  /** null for a top-level category. */
  parentId: string | null;
}

/** One line of a category's list: enough to choose from; the whole hadith is a separate lookup. */
export interface HadeethSummary {
  id: string;
  title: string;
}

export interface HadeethPage {
  items: HadeethSummary[];
  page: number;
  lastPage: number;
  total: number;
  perPage: number;
}

export interface HadeethWordMeaning {
  word: string;
  meaning: string;
}

/**
 * A hadith as the publisher gives it. Every text field is kept as sent, and null where the publisher sent none. The `*Ar` fields
 * are the publisher's Arabic original; the others are in the language that was asked for.
 */
export interface HadeethEntry {
  id: string;
  language: HadeethLanguage;
  title: string | null;
  /** The hadith text in the asked-for language. */
  text: string | null;
  /** The part that names the narrator ("X reported that…"), when the publisher gives it apart from `text`. */
  intro: string | null;
  attribution: string | null;
  grade: string | null;
  explanation: string | null;
  hints: string[];
  categoryIds: string[];
  /** Language codes the publisher has this hadith in. */
  translations: string[];
  textAr: string | null;
  introAr: string | null;
  attributionAr: string | null;
  gradeAr: string | null;
  explanationAr: string | null;
  hintsAr: string[];
  wordMeaningsAr: HadeethWordMeaning[];
}

export interface HadeethClient {
  /** Every category (top-level ones have `parentId` null). */
  categories(language: HadeethLanguage, signal?: AbortSignal): Promise<HadeethCategory[]>;
  hadeeths(language: HadeethLanguage, categoryId: string, page?: { page?: number; perPage?: number }, signal?: AbortSignal): Promise<HadeethPage>;
  hadeeth(language: HadeethLanguage, id: string, signal?: AbortSignal): Promise<HadeethEntry>;
  clearCache(): void;
}

// ------------------------------------------------------------------- reading what the server sent

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (what: string): never => {
  throw new HadithError("bad-response", `unexpected answer: ${what}`);
};
/** A string kept exactly as sent; null when it is missing or empty. Never trimmed, so the text is not altered. */
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/** A number the API sends as a string or as a number. */
const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const idOf = (v: unknown): string | null => {
  const s = typeof v === "number" && Number.isInteger(v) && v >= 0 ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,9}$/.test(s) ? s : null;
};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

function parseCategory(v: unknown): HadeethCategory {
  const o = isObj(v) ? v : bad("category");
  const id = idOf(o.id) ?? bad("category.id");
  const parent = idOf(o.parent_id);
  return { id, title: text(o.title) ?? bad("category.title"), hadeethsCount: count(o.hadeeths_count) ?? 0, parentId: parent === null || parent === "0" ? null : parent };
}

function parseWordMeanings(v: unknown): HadeethWordMeaning[] {
  if (!Array.isArray(v)) return [];
  const out: HadeethWordMeaning[] = [];
  for (const w of v) if (isObj(w)) {
    const word = text(w.word);
    const meaning = text(w.meaning);
    if (word && meaning) out.push({ word, meaning });
  }
  return out;
}

function parseEntry(language: HadeethLanguage, v: unknown): HadeethEntry {
  const o = isObj(v) ? v : bad("hadeeth");
  const id = idOf(o.id) ?? bad("hadeeth.id");
  const entry: HadeethEntry = {
    id, language, title: text(o.title), text: text(o.hadeeth), intro: text(o.hadeeth_intro), attribution: text(o.attribution), grade: text(o.grade),
    explanation: text(o.explanation), hints: strings(o.hints), categoryIds: strings(o.categories).filter((c) => idOf(c) !== null), translations: strings(o.translations),
    textAr: text(o.hadeeth_ar), introAr: text(o.hadeeth_intro_ar), attributionAr: text(o.attribution_ar), gradeAr: text(o.grade_ar),
    explanationAr: text(o.explanation_ar), hintsAr: strings(o.hints_ar), wordMeaningsAr: parseWordMeanings(o.words_meanings_ar),
  };
  // A hadith with no text in either language is not a hadith.
  if (entry.text === null && entry.textAr === null) bad("hadeeth without text");
  return entry;
}

// ------------------------------------------------------------------- the client

/** A larger answer than this is not a hadith page. */
export const HADEETHENC_MAX_BODY_CHARS = 2_000_000;

export interface HadeethClientOptions {
  http: HadithHttp;
  base?: string;
  timeoutMs?: number;
  /** At least this long between two requests. The publisher states no limit, so the app stays gentle. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How long an answer is remembered in memory. 0 turns the memory off. */
  cacheTtlMs?: number;
  cacheMax?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const LANGS: readonly string[] = ["en", "bn", "ar"];

export function createHadeethClient(opts: HadeethClientOptions): HadeethClient {
  const base = (opts.base ?? HADEETHENC_API_BASE).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const minInterval = opts.minIntervalMs ?? 250;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cacheMax = opts.cacheMax ?? 120;
  const cache = new Map<string, { at: number; value: unknown }>();
  let nextAt = 0;

  async function turn(signal?: AbortSignal): Promise<void> {
    const t = now();
    const start = Math.max(t, nextAt);
    nextAt = start + minInterval;
    if (start > t) await sleep(start - t);
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
  }

  async function fetchParsed<T>(path: string, parse: (json: unknown) => T, signal?: AbortSignal): Promise<T> {
    const url = `${base}${path}`;
    const hit = cache.get(url);
    if (hit && ttl > 0 && now() - hit.at < ttl) return hit.value as T;
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
    await turn(signal);
    let res: HadithHttpResponse;
    try {
      res = await opts.http.get(url, { timeoutMs, signal });
    } catch (e) {
      if (e instanceof HadithError) throw e;
      if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
      throw new HadithError("network", e instanceof Error ? e.message : String(e));
    }
    const value = parse(decode(res));
    if (ttl > 0) {
      cache.delete(url);
      cache.set(url, { at: now(), value });
      while (cache.size > cacheMax) cache.delete(cache.keys().next().value as string);
    }
    return value;
  }

  const lang = (l: string): HadeethLanguage => (LANGS.includes(l) ? (l as HadeethLanguage) : (() => { throw new HadithError("bad-request", "language not offered"); })());
  const id = (s: string): string => (/^\d{1,9}$/.test(s) ? s : (() => { throw new HadithError("bad-request", "not a category or hadith number"); })());
  const int = (n: number | undefined, fallback: number, min: number, max: number): number => (n === undefined ? fallback : Number.isInteger(n) && n >= min && n <= max ? n : (() => { throw new HadithError("bad-request", "number out of range"); })());

  return {
    categories: async (language, signal) =>
      fetchParsed(`/categories/list/?language=${lang(language)}`, (d) => (Array.isArray(d) ? d : bad("categories")).map(parseCategory), signal),

    async hadeeths(language, categoryId, page = {}, signal) {
      const p = int(page.page, 1, 1, 100_000);
      const per = int(page.perPage, 20, 1, 50);
      return fetchParsed(
        `/hadeeths/list/?language=${lang(language)}&category_id=${id(categoryId)}&page=${p}&per_page=${per}`,
        (d) => {
          const o = isObj(d) ? d : bad("hadeeth list");
          const items: HadeethSummary[] = [];
          for (const row of Array.isArray(o.data) ? o.data : bad("hadeeth list data")) {
            if (!isObj(row)) continue;
            const rid = idOf(row.id);
            const title = text(row.title);
            if (rid && title) items.push({ id: rid, title });
          }
          const meta = isObj(o.meta) ? o.meta : {};
          const current = count(meta.current_page) ?? p;
          return { items, page: current, lastPage: Math.max(current, count(meta.last_page) ?? current), total: count(meta.total_items) ?? items.length, perPage: count(meta.per_page) ?? per };
        },
        signal,
      );
    },

    hadeeth: async (language, hadeethId, signal) => fetchParsed(`/hadeeths/one/?language=${lang(language)}&id=${id(hadeethId)}`, (d) => parseEntry(language, d), signal),

    clearCache: () => cache.clear(),
  };
}

/** Turns an answer into its JSON, or throws the error a person can be told about. This API sends the data without an envelope. */
function decode(res: HadithHttpResponse): unknown {
  if (res.status === 404) throw new HadithError("not-found", "not found");
  if (res.status === 429) throw new HadithError("rate-limited", "too many requests", res.retryAfterSeconds);
  if (res.status === 400 || res.status === 422) throw new HadithError("bad-request", "the server did not accept the request");
  if (res.status >= 500) throw new HadithError("server", `the server answered ${res.status}`);
  if (res.status !== 200) throw new HadithError("bad-response", `the server answered ${res.status}`);
  if (res.body.length > HADEETHENC_MAX_BODY_CHARS) return bad("answer too large");
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return bad("not JSON");
  }
}

/** The hadith's page on HadeethEnc.com. The address is built from a checked number only. */
export function hadeethUrl(language: HadeethLanguage, hadeethId: string): string | null {
  return /^\d{1,9}$/.test(hadeethId) ? `${HADEETHENC_SITE}/${language}/browse/hadith/${hadeethId}` : null;
}
