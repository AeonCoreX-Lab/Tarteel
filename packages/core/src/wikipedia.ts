/**
 * Live background reading from Wikipedia. Nothing is stored: a search or an article is fetched when the person asks for it,
 * shown, and forgotten (a short in-memory cache only saves repeated taps in one session).
 *
 * Why Wikipedia: it is the one large, free source of history and background (people, places, events, the surahs themselves)
 * whose licence is clear: the text is CC BY-SA 4.0. The licence asks for credit, a link to the licence, and a note of changes;
 * the app credits Wikipedia on every screen that shows its text, links to the article (whose history lists the authors), and
 * shows the text as the API gives it.
 *
 * What Wikipedia is not: Islamic scholarship. It is written by volunteers, and on religious subjects it often reports the views
 * of academic outsiders next to the views of Muslims. The app says so beside every article, offers it only when no installed
 * pack covers the question, and leaves it off until the person turns it on.
 *
 * Pure TypeScript. The network is the same `HadithHttp` port the hadith clients use, so the same fake network drives the tests.
 */

import { HadithError } from "./hadith.ts";
import type { HadithHttp, HadithHttpResponse } from "./hadith.ts";

/** Languages this app asks Wikipedia in: its own languages. Any other app language reads English Wikipedia. */
export type WikiLanguage = "en" | "bn" | "ar";

export const WIKIPEDIA_LICENSE = { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } as const;

export function wikiLanguage(uiLanguage: string): WikiLanguage {
  return uiLanguage === "bn" ? "bn" : uiLanguage === "ar" ? "ar" : "en";
}

const LANGS: readonly string[] = ["en", "bn", "ar"];
export const wikiHost = (language: WikiLanguage): string => `https://${language}.wikipedia.org`;

// ------------------------------------------------------------------- model

export interface WikiHit {
  /** The article's title, which is also its address. */
  title: string;
  /** A short passage around the match, as plain text. */
  snippet: string;
}

/** One part of an article. The first part (before any heading) has `heading` null: it is the introduction. */
export interface WikiSection {
  heading: string | null;
  /** 2 for "== Heading ==", 3 for "=== Heading ===", and so on. 0 for the introduction. */
  level: number;
  text: string;
}

export interface WikiArticle {
  title: string;
  language: WikiLanguage;
  sections: WikiSection[];
  /** The article on wikipedia.org, whose history page names the authors. */
  url: string;
}

export interface WikiClient {
  search(language: WikiLanguage, query: string, limit?: number, signal?: AbortSignal): Promise<WikiHit[]>;
  article(language: WikiLanguage, title: string, signal?: AbortSignal): Promise<WikiArticle>;
  clearCache(): void;
}

// ------------------------------------------------------------------- addresses

/** A title as it appears in a Wikipedia address: spaces become underscores, the rest is percent-encoded. */
export function wikiTitleSlug(title: string): string {
  return encodeURIComponent(title.trim().replace(/ /g, "_"));
}

export function wikiArticleUrl(language: WikiLanguage, title: string): string {
  return `${wikiHost(language)}/wiki/${wikiTitleSlug(title)}`;
}

/** The article's history page: where its authors are listed, as the licence's credit requires. */
export function wikiHistoryUrl(language: WikiLanguage, title: string): string {
  return `${wikiHost(language)}/w/index.php?title=${wikiTitleSlug(title)}&action=history`;
}

// ------------------------------------------------------------------- what to search for

/** Arabic without vowel marks, tatweel and the like, so a name matches however it is written. */
export function stripArabicMarks(s: string): string {
  return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "").replace(/\s+/g, " ").trim();
}

/** What to ask Wikipedia for a surah, in each language. Bengali articles state the Arabic name, so that is what is searched. */
export function wikiSurahQuery(language: WikiLanguage, surah: { nameArabic: string; nameTransliteration: string }): string {
  const arabic = stripArabicMarks(surah.nameArabic).replace(/^سورة\s*/, "");
  if (language === "ar") return `سورة ${arabic}`;
  if (language === "bn") return arabic ? `${arabic} সূরা` : `সূরা ${surah.nameTransliteration}`;
  return `Surah ${surah.nameTransliteration}`;
}

// ------------------------------------------------------------------- reading what the server sent

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (what: string): never => {
  throw new HadithError("bad-response", `unexpected answer: ${what}`);
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The search snippet is a little HTML (`<span class="searchmatch">`). Plain text out: tags removed, entities decoded. */
export function plainSnippet(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,6});/g, (m, e: string) => {
      if (e.startsWith("#x")) return safeCodePoint(parseInt(e.slice(2), 16), m);
      if (e.startsWith("#")) return safeCodePoint(parseInt(e.slice(1), 10), m);
      return ENTITIES[e] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function safeCodePoint(n: number, fallback: string): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : fallback;
}

/** Wikipedia reports some failures as a 200 with an `error` object. */
function checkApiError(o: Obj): void {
  if (!isObj(o.error)) return;
  const code = typeof o.error.code === "string" ? o.error.code : "";
  if (code === "ratelimited" || code === "maxlag") throw new HadithError("rate-limited", "too many requests");
  if (code.startsWith("invalid") || code === "badvalue" || code === "missingparam") throw new HadithError("bad-request", "the server did not accept the request");
  throw new HadithError("server", `the server reported: ${code || "an error"}`);
}

export function parseSearch(json: unknown): WikiHit[] {
  const o = isObj(json) ? json : bad("search");
  checkApiError(o);
  const q = isObj(o.query) ? o.query : null;
  // No match at all is a normal answer: the API then leaves `query.search` empty or omits `query`.
  if (!q) return [];
  const rows = Array.isArray(q.search) ? q.search : bad("search list");
  const out: WikiHit[] = [];
  for (const r of rows) {
    if (!isObj(r) || typeof r.title !== "string" || r.title.trim() === "") continue;
    out.push({ title: r.title, snippet: typeof r.snippet === "string" ? plainSnippet(r.snippet) : "" });
  }
  return out;
}

const HEADING = /^(={2,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/;

/**
 * Splits a plain-text extract (headings marked `== Heading ==`) into sections. Empty sections are left out, because a heading
 * with nothing under it, such as an emptied "References", tells the reader nothing. No text is changed.
 */
export function splitSections(extract: string): WikiSection[] {
  const sections: WikiSection[] = [];
  let heading: string | null = null;
  let level = 0;
  let lines: string[] = [];
  const flush = (): void => {
    const text = lines.join("\n").trim();
    if (text !== "") sections.push({ heading, level, text });
  };
  for (const line of extract.replace(/\r\n?/g, "\n").split("\n")) {
    const m = HEADING.exec(line);
    if (m && m[1] && m[2]) {
      flush();
      heading = m[2];
      level = m[1].length;
      lines = [];
    } else lines.push(line);
  }
  flush();
  return sections;
}

export function parseArticle(language: WikiLanguage, json: unknown): WikiArticle {
  const o = isObj(json) ? json : bad("article");
  checkApiError(o);
  const q = isObj(o.query) ? o.query : bad("article query");
  const pages = Array.isArray(q.pages) ? q.pages : bad("article pages");
  const page = pages.find(isObj);
  if (!page) throw new HadithError("not-found", "not found");
  if (page.missing === true || page.invalid === true) throw new HadithError("not-found", "not found");
  const title = typeof page.title === "string" && page.title.trim() !== "" ? page.title : bad("article title");
  const extract = typeof page.extract === "string" ? page.extract : "";
  const sections = splitSections(extract);
  if (sections.length === 0) throw new HadithError("not-found", "the article has no text");
  return { title, language, sections, url: wikiArticleUrl(language, title) };
}

// ------------------------------------------------------------------- the client

/** A larger answer than this is not an article this app should hold in memory. */
export const WIKIPEDIA_MAX_BODY_CHARS = 3_000_000;

export interface WikiClientOptions {
  http: HadithHttp;
  timeoutMs?: number;
  /** At least this long between two requests: the app stays gentle with a shared, free service. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How long an answer is remembered in memory. 0 turns the memory off. */
  cacheTtlMs?: number;
  cacheMax?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function decode(res: HadithHttpResponse): unknown {
  if (res.status === 404) throw new HadithError("not-found", "not found");
  if (res.status === 429) throw new HadithError("rate-limited", "too many requests", res.retryAfterSeconds);
  if (res.status === 400 || res.status === 422) throw new HadithError("bad-request", "the server did not accept the request");
  if (res.status >= 500) throw new HadithError("server", `the server answered ${res.status}`);
  if (res.status !== 200) throw new HadithError("bad-response", `the server answered ${res.status}`);
  if (res.body.length > WIKIPEDIA_MAX_BODY_CHARS) return bad("answer too large");
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return bad("not JSON");
  }
}

export function createWikiClient(opts: WikiClientOptions): WikiClient {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const minInterval = opts.minIntervalMs ?? 250;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cacheMax = opts.cacheMax ?? 40;
  const cache = new Map<string, { at: number; value: unknown }>();
  let nextAt = 0;

  async function turn(signal?: AbortSignal): Promise<void> {
    const t = now();
    const start = Math.max(t, nextAt);
    nextAt = start + minInterval;
    if (start > t) await sleep(start - t);
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
  }

  async function fetchParsed<T>(url: string, parse: (json: unknown) => T, signal?: AbortSignal): Promise<T> {
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

  const lang = (l: string): WikiLanguage => {
    if (!LANGS.includes(l)) throw new HadithError("bad-request", "language not offered");
    return l as WikiLanguage;
  };
  const checkText = (s: string, what: string, max: number): string => {
    const v = s.trim();
    // eslint-disable-next-line no-control-regex
    if (v === "" || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new HadithError("bad-request", `${what} is not valid`);
    return v;
  };

  return {
    async search(language, query, limit = 5, signal) {
      const l = lang(language);
      const q = checkText(query, "search", 200);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new HadithError("bad-request", "number out of range");
      const url = `${wikiHost(l)}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=0&srlimit=${limit}&format=json&formatversion=2`;
      return fetchParsed(url, parseSearch, signal);
    },

    async article(language, title, signal) {
      const l = lang(language);
      const t = checkText(title, "title", 255);
      const url = `${wikiHost(l)}/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(t)}&format=json&formatversion=2`;
      return fetchParsed(url, (d) => parseArticle(l, d), signal);
    },

    clearCache: () => cache.clear(),
  };
}
