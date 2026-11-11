/**
 * Live reading of classical books from the islamic.app Library API (https://docs.islamic.app/api-reference/library-overview,
 * read 2026-10-28). Nothing here is stored: a book is fetched when the person opens it, shown, and forgotten (a short in-memory
 * cache only saves repeat taps in one session). Pure TypeScript: the network is the same `HadithHttp` port the other online
 * sources use, so this runs the same in tests and in the app.
 *
 * What the publisher says, and what the app therefore does:
 * - The library holds works it calls "clearly out of copyright" (authors who died more than 100 years ago), gathered from
 *   usul.ai, turath.io, shamela.ws, waqfeya.net and others. It states no per-book licence. The app shows every book's own
 *   `sources` list wherever the book appears, as the publisher requires, and says that the edition (the editor's notes and
 *   layout) is not something the app has checked.
 * - No key. Soft limits: about 60 requests a minute for the catalogue, about 10 a minute for search. The client spaces
 *   requests, and spaces search much further apart.
 * - Whole-book text comes as one answer (every chapter). The app slices it on the device; a book too large for a phone's memory
 *   is refused with a clear error and its PDF link is offered instead.
 */
import { HadithError } from "./hadith.ts";
import type { HadithHttp, HadithHttpResponse } from "./hadith.ts";

export const ISLAMIC_BOOKS_API = "https://api.islamic.app/v1/library";
export const ISLAMIC_BOOKS_SITE = "https://islamic.app";
export const ISLAMIC_BOOKS_CREDIT = { source: "islamic.app Library", url: ISLAMIC_BOOKS_SITE } as const;

/** Genres the publisher lists (eleven slugs). The live list from `genres()` wins when it can be read. */
export const ISLAMIC_BOOKS_GENRES: readonly string[] = ["tafsir", "aqeedah", "fiqh", "usul-fiqh", "tasawwuf", "seerah", "tarikh", "lughah", "mantiq", "firaq", "general"];

/** A book whose text is larger than this many characters is not opened in the app. */
export const ISLAMIC_BOOKS_MAX_BODY_CHARS = 24_000_000;

// ------------------------------------------------------------------- model

export interface BookSource {
  name: string;
  url: string | null;
}

export interface BookChapter {
  title: string;
  /** 1 = top level. */
  level: number;
  /** Volume label; null for a single-volume book. */
  vol: string | null;
  /** First page of the chapter; null when the source does not anchor it. */
  page: number | null;
  text: string;
}

export interface IslamicBookSummary {
  slug: string;
  titleAr: string;
  titleEn: string | null;
  authorId: string | null;
  authorAr: string | null;
  authorEn: string | null;
  authorDiedHijri: number | null;
  genre: string | null;
  school: string | null;
  writtenHijri: number | null;
  pages: number | null;
  hasPdf: boolean;
  hasText: boolean;
}

export interface IslamicBookDetail extends IslamicBookSummary {
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Shown wherever the book is shown, as the publisher requires. */
  sources: BookSource[];
}

export interface IslamicBookList {
  total: number;
  offset: number;
  books: IslamicBookSummary[];
}

export interface IslamicGenre {
  slug: string;
  label: string;
  count: number | null;
}

export interface IslamicBookText {
  slug: string;
  /** Where the publisher parsed the text from ("turath", "openiti"), when it says. */
  origin: string | null;
  pageCount: number | null;
  /** Editor, publisher and year of the edition, when the publisher gives them. */
  bibliography: { investigator: string | null; publisher: string | null; year: string | null };
  chapters: BookChapter[];
}

export interface IslamicSearchHit {
  bookSlug: string;
  bookTitleAr: string | null;
  bookTitleEn: string | null;
  chapterTitleAr: string | null;
  chapterTitleEn: string | null;
  startPage: number | null;
  genre: string | null;
  score: number | null;
}

export interface IslamicBooksClient {
  genres(signal?: AbortSignal): Promise<IslamicGenre[]>;
  books(opts: { genre?: string | undefined; school?: string | undefined; limit?: number | undefined; offset?: number | undefined }, signal?: AbortSignal): Promise<IslamicBookList>;
  book(slug: string, signal?: AbortSignal): Promise<IslamicBookDetail>;
  /** Every chapter of the book. Large: the caller keeps it only while the book is open. */
  text(slug: string, signal?: AbortSignal): Promise<IslamicBookText>;
  /** Searches chapter titles (the publisher's semantic search). The publisher allows about 10 a minute. */
  search(query: string, opts: { genre?: string | undefined; limit?: number | undefined }, signal?: AbortSignal): Promise<IslamicSearchHit[]>;
  /** The address of the PDF, for a viewer that can open one. No request is made here. */
  pdfUrl(slug: string): string;
  clearCache(): void;
}

// ------------------------------------------------------------------- parsing

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (what: string): never => {
  throw new HadithError("bad-response", `unexpected answer: ${what}`);
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNum = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(v) : str(v));

/** Since 2026-06-12 the answer is `{code, status, data}`; the older shape is bare. Both are read. */
export function unwrapIslamicBooks(json: unknown): Obj {
  if (!isObj(json)) return bad("not an object");
  if ("code" in json && "data" in json) {
    const d = json.data;
    if (typeof d === "string") throw new HadithError(d.startsWith("not_found") ? "not-found" : "bad-response", d.slice(0, 120));
    return isObj(d) ? d : bad("no data");
  }
  return json;
}

export function parseBookSummary(v: unknown): IslamicBookSummary | null {
  if (!isObj(v)) return null;
  const slug = str(v.slug);
  const titleAr = str(v.title_ar) ?? str(v.titleAr);
  const titleEn = str(v.title_en);
  if (slug === null || (titleAr === null && titleEn === null)) return null;
  const author = isObj(v.author) ? v.author : {};
  return {
    slug,
    titleAr: titleAr ?? titleEn ?? slug,
    titleEn,
    authorId: str(v.author_id) ?? str(author.id),
    authorAr: str(v.author_name_ar) ?? str(author.name_ar),
    authorEn: str(v.author_name_en) ?? str(author.name_en),
    authorDiedHijri: num(v.author_died_year_hijri) ?? num(author.died_year_hijri),
    genre: str(v.genre),
    school: str(v.school),
    writtenHijri: num(v.written_year_hijri),
    pages: num(v.pages),
    hasPdf: v.has_pdf === true,
    hasText: v.has_text === true,
  };
}

export function parseBookList(json: unknown): IslamicBookList {
  const d = unwrapIslamicBooks(json);
  const raw = d.books;
  if (!Array.isArray(raw)) return bad("no books");
  const books = raw.map(parseBookSummary).filter((b): b is IslamicBookSummary => b !== null);
  return { total: num(d.total) ?? books.length, offset: num(d.offset) ?? 0, books };
}

export function parseBookDetail(json: unknown): IslamicBookDetail {
  const d = unwrapIslamicBooks(json);
  const b = isObj(d.book) ? d.book : d;
  const s = parseBookSummary(b) ?? bad("no book");
  const sources: BookSource[] = [];
  if (Array.isArray(b.sources))
    for (const x of b.sources) {
      if (!isObj(x)) continue;
      const name = str(x.source_name) ?? str(x.name);
      if (name !== null) sources.push({ name, url: str(x.source_url) ?? str(x.url) });
    }
  return { ...s, descriptionAr: str(b.description_ar), descriptionEn: str(b.description_en), sources };
}

export function parseGenres(json: unknown): IslamicGenre[] {
  const d = unwrapIslamicBooks(json);
  if (!Array.isArray(d.genres)) return bad("no genres");
  const out: IslamicGenre[] = [];
  for (const g of d.genres) {
    if (!isObj(g)) continue;
    const slug = str(g.slug);
    if (slug === null) continue;
    out.push({ slug, label: str(g.labelEn) ?? slug, count: num(g.count) });
  }
  return out;
}

export function parseBookText(json: unknown): IslamicBookText {
  const d = unwrapIslamicBooks(json);
  if (!Array.isArray(d.chapters)) return bad("no chapters");
  const chapters: BookChapter[] = [];
  for (const c of d.chapters) {
    if (!isObj(c)) continue;
    const text = typeof c.text === "string" ? c.text : "";
    const title = typeof c.title === "string" ? c.title.trim() : "";
    if (text.trim() === "" && title === "") continue;
    const level = num(c.level);
    chapters.push({ title, level: level !== null && level >= 1 ? Math.floor(level) : 1, vol: strOrNum(c.vol), page: num(c.page), text });
  }
  const bib = isObj(d.bibliography) ? d.bibliography : {};
  return {
    slug: str(d.slug) ?? "",
    origin: str(d.source),
    pageCount: num(d.pageCount),
    bibliography: { investigator: str(bib.investigator), publisher: str(bib.publisher), year: strOrNum(bib.publicationYear) },
    chapters,
  };
}

export function parseIslamicBooksSearch(json: unknown): IslamicSearchHit[] {
  const d = unwrapIslamicBooks(json);
  const raw = d.results;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return bad("no results");
  const out: IslamicSearchHit[] = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const bookSlug = str(r.book_slug);
    if (bookSlug === null) continue;
    out.push({
      bookSlug,
      bookTitleAr: str(r.book_title_ar),
      bookTitleEn: str(r.book_title_en),
      chapterTitleAr: str(r.chapter_title_ar),
      chapterTitleEn: str(r.chapter_title_en),
      startPage: num(r.start_page),
      genre: str(r.genre),
      score: num(r.score),
    });
  }
  return out;
}

// ------------------------------------------------------------------- the client

export interface IslamicBooksClientOptions {
  http: HadithHttp;
  base?: string;
  timeoutMs?: number;
  /** At least this long between two requests. The publisher advises about 60 a minute for the catalogue. */
  minIntervalMs?: number;
  /** At least this long between two searches. The publisher allows about 10 a minute. */
  searchIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
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
  if (res.body.length > ISLAMIC_BOOKS_MAX_BODY_CHARS) return bad("answer too large");
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return bad("not JSON");
  }
}

/** The publisher's slug alphabet: lowercase letters, digits and - . : ' (nothing that could change the path). */
export const isBookSlug = (s: string): boolean => /^[a-z0-9][a-z0-9.:'-]{0,150}$/.test(s) && !s.includes("..");

const slugOf = (s: string): string => {
  if (!isBookSlug(s)) throw new HadithError("bad-request", "not a book address");
  return encodeURIComponent(s);
};

export function createIslamicBooksClient(opts: IslamicBooksClientOptions): IslamicBooksClient {
  const base = (opts.base ?? ISLAMIC_BOOKS_API).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const minInterval = opts.minIntervalMs ?? 1000;
  const searchInterval = opts.searchIntervalMs ?? 6500;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cacheMax = opts.cacheMax ?? 4;
  const cache = new Map<string, { at: number; value: unknown }>();
  let nextAt = 0;
  let nextSearchAt = 0;

  async function turn(search: boolean, signal?: AbortSignal): Promise<void> {
    const t = now();
    let start = Math.max(t, nextAt);
    if (search) start = Math.max(start, nextSearchAt);
    nextAt = start + minInterval;
    if (search) nextSearchAt = start + searchInterval;
    if (start > t) await sleep(start - t);
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
  }

  async function fetchParsed<T>(path: string, parse: (json: unknown) => T, signal?: AbortSignal, search = false): Promise<T> {
    const url = `${base}${path}`;
    const hit = cache.get(url);
    if (hit && ttl > 0 && now() - hit.at < ttl) return hit.value as T;
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
    await turn(search, signal);
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

  const q = (params: Record<string, string | number | undefined>): string => {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return parts.length === 0 ? "" : `?${parts.join("&")}`;
  };

  return {
    genres: (signal) => fetchParsed("/genres", parseGenres, signal),

    books: async (o, signal) => {
      const limit = Math.min(Math.max(Math.floor(o.limit ?? 30), 1), 100);
      const offset = Math.max(Math.floor(o.offset ?? 0), 0);
      if (o.genre !== undefined && !/^[a-z-]{1,24}$/.test(o.genre)) throw new HadithError("bad-request", "not a genre");
      if (o.school !== undefined && !/^[a-z]{1,12}$/.test(o.school)) throw new HadithError("bad-request", "not a school");
      return fetchParsed(`/books${q({ genre: o.genre, school: o.school, limit, offset })}`, parseBookList, signal);
    },

    book: async (slug, signal) => fetchParsed(`/books/${slugOf(slug)}`, parseBookDetail, signal),

    text: async (slug, signal) => fetchParsed(`/books/${slugOf(slug)}/text`, parseBookText, signal),

    search: async (query, o, signal) => {
      const text = query.trim().slice(0, 500);
      if (text.length < 2) return [];
      if (o.genre !== undefined && !/^[a-z-]{1,24}$/.test(o.genre)) throw new HadithError("bad-request", "not a genre");
      const limit = Math.min(Math.max(Math.floor(o.limit ?? 12), 1), 50);
      return fetchParsed(`/search${q({ q: text, genre: o.genre, limit })}`, parseIslamicBooksSearch, signal, true);
    },

    pdfUrl: (slug) => `${base}/books/${slugOf(slug)}/file?format=pdf`,

    clearCache: () => cache.clear(),
  };
}
