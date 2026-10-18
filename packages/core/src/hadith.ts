/**
 * Live hadith lookup. Nothing here is stored: a hadith is fetched when the person opens it, shown, and forgotten (a short
 * in-memory cache only saves repeated taps in one session). The data comes from the islamic.app API, which says it mirrors
 * the Sunnah.com catalogue; every hadith must therefore be shown with that credit, and as an online source that Tarteel has
 * not reviewed. Pure TypeScript: the network is a port, so this runs the same in tests and in the app.
 *
 * Only plain `text` fields are read. The API's HTML `body` is never used, so nothing from the network is ever rendered as markup.
 */

export const HADITH_API_BASE = "https://api.islamic.app";
export const SUNNAH_SITE = "https://sunnah.com";

/** What every hadith screen must say about where the text came from. */
export const HADITH_CREDIT = { source: "Sunnah.com", via: "islamic.app", url: SUNNAH_SITE } as const;

export type HadithErrorCode = "network" | "timeout" | "rate-limited" | "not-found" | "bad-request" | "bad-response" | "server" | "cancelled";

export class HadithError extends Error {
  readonly code: HadithErrorCode;
  /** From the server's Retry-After on a 429; null otherwise. */
  readonly retryAfterSeconds: number | null;
  constructor(code: HadithErrorCode, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "HadithError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface HadithHttpResponse {
  status: number;
  body: string;
  retryAfterSeconds: number | null;
}

/** The network. Must reject with a `HadithError` coded "timeout", "network" or "cancelled" (anything else is treated as "network"). */
export interface HadithHttp {
  get(url: string, opts: { timeoutMs: number; signal?: AbortSignal | undefined }): Promise<HadithHttpResponse>;
}

// ------------------------------------------------------------------- model

export interface HadithGrade {
  /** Who gave the grade; null when the source does not say. */
  gradedBy: string | null;
  grade: string;
}

export interface HadithText {
  urn: number | null;
  text: string | null;
  grades: HadithGrade[];
}

export interface HadithEntry {
  collection: string;
  bookNumber: string;
  hadithNumber: string;
  chapterId: string | null;
  chapterNumber: string | null;
  chapterTitle: { en: string | null; ar: string | null };
  en: HadithText;
  ar: HadithText;
}

/** A piece of a search snippet; `mark` is true where the search words matched. */
export interface Segment {
  text: string;
  mark: boolean;
}

export interface HadithHit extends HadithEntry {
  snippet: { en: Segment[] | null; ar: Segment[] | null };
}

export interface HadithCollection {
  slug: string;
  type: string;
  nameEn: string;
  nameAr: string | null;
  introEn: string | null;
  hasBooks: boolean;
  hasChapters: boolean;
  totalHadith: number;
  totalAvailable: number;
}

export interface HadithBook {
  collection: string;
  bookNumber: string;
  nameEn: string | null;
  nameAr: string | null;
  hadithStartNumber: number | null;
  hadithEndNumber: number | null;
  hadithCount: number | null;
}

export interface HadithPage<T> {
  total: number;
  offset: number;
  items: T[];
}

export interface HadithClient {
  collections(signal?: AbortSignal): Promise<HadithCollection[]>;
  books(collection: string, signal?: AbortSignal): Promise<HadithBook[]>;
  hadiths(collection: string, bookNumber: string, page?: { limit?: number; offset?: number }, signal?: AbortSignal): Promise<HadithPage<HadithEntry>>;
  hadith(collection: string, bookNumber: string, hadithNumber: string, signal?: AbortSignal): Promise<HadithEntry>;
  search(query: string, opts?: { collection?: string | undefined; limit?: number | undefined; offset?: number | undefined }, signal?: AbortSignal): Promise<HadithPage<HadithHit>>;
  /** Forgets everything remembered in memory. */
  clearCache(): void;
}

// ------------------------------------------------------------------- reading what the server sent

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (what: string): never => {
  throw new HadithError("bad-response", `unexpected answer: ${what}`);
};
const orNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** A number that the API sends as a string or as a number (hadith and chapter numbers); null when it is neither. */
const idOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const needId = (v: unknown, what: string): string => idOrNull(v) ?? bad(what);
const needObj = (v: unknown, what: string): Obj => (isObj(v) ? v : bad(what));
const needArray = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : bad(what));

function parseText(v: unknown): HadithText {
  if (!isObj(v)) return { urn: null, text: null, grades: [] };
  const grades: HadithGrade[] = [];
  if (Array.isArray(v.grades))
    for (const g of v.grades) {
      if (!isObj(g)) continue;
      const grade = orNull(g.grade)?.trim();
      if (grade) grades.push({ gradedBy: orNull(g.graded_by)?.trim() || null, grade });
    }
  return { urn: intOrNull(v.urn), text: orNull(v.text), grades };
}

function parseTitle(v: unknown): { en: string | null; ar: string | null } {
  return isObj(v) ? { en: orNull(v.en), ar: orNull(v.ar) } : { en: null, ar: null };
}

function parseEntry(v: unknown): HadithEntry {
  const o = needObj(v, "hadith");
  return {
    collection: needId(o.collection, "hadith.collection"), bookNumber: needId(o.bookNumber, "hadith.bookNumber"), hadithNumber: needId(o.hadithNumber, "hadith.hadithNumber"),
    chapterId: idOrNull(o.chapterId), chapterNumber: idOrNull(o.chapterNumber), chapterTitle: parseTitle(o.chapterTitle), en: parseText(o.en), ar: parseText(o.ar),
  };
}

const ENTITIES: readonly (readonly [RegExp, string])[] = [[/&nbsp;/g, " "], [/&lt;/g, "<"], [/&gt;/g, ">"], [/&quot;/g, "\""], [/&#39;|&apos;/g, "'"], [/&amp;/g, "&"]];

/**
 * A search snippet as pieces. Only `<mark>` and `</mark>` mean anything; every other tag is dropped, so a snippet can never
 * carry markup into the screen. `&amp;` is decoded last so that "&amp;lt;" stays the text "&lt;".
 */
export function parseSnippet(html: string): Segment[] {
  const out: Segment[] = [];
  let mark = false;
  for (const part of html.split(/(<\/?mark>)/i)) {
    if (/^<mark>$/i.test(part)) mark = true;
    else if (/^<\/mark>$/i.test(part)) mark = false;
    else {
      let text = part.replace(/<[^>]*>/g, "");
      for (const [re, to] of ENTITIES) text = text.replace(re, to);
      if (text !== "") out.push({ text, mark });
    }
  }
  return out;
}

function parseHit(v: unknown): HadithHit {
  const o = needObj(v, "search result");
  const sn = isObj(o.snippet) ? o.snippet : {};
  const seg = (s: unknown): Segment[] | null => (typeof s === "string" && s !== "" ? parseSnippet(s) : null);
  return { ...parseEntry(o), snippet: { en: seg(sn.en), ar: seg(sn.ar) } };
}

function parseCollection(v: unknown): HadithCollection {
  const o = needObj(v, "collection");
  const name = isObj(o.name) ? o.name : {};
  const intro = isObj(o.intro) ? o.intro : {};
  const slug = needId(o.slug, "collection.slug");
  return {
    slug, type: orNull(o.type) ?? "hadith", nameEn: orNull(name.en) ?? slug, nameAr: orNull(name.ar), introEn: orNull(intro.en),
    hasBooks: o.hasBooks === true, hasChapters: o.hasChapters === true, totalHadith: intOrNull(o.totalHadith) ?? 0, totalAvailable: intOrNull(o.totalAvailable) ?? 0,
  };
}

function parseBook(v: unknown): HadithBook {
  const o = needObj(v, "book");
  const name = isObj(o.name) ? o.name : {};
  return {
    collection: needId(o.collection, "book.collection"), bookNumber: needId(o.bookNumber, "book.bookNumber"), nameEn: orNull(name.en), nameAr: orNull(name.ar),
    hadithStartNumber: intOrNull(o.hadithStartNumber), hadithEndNumber: intOrNull(o.hadithEndNumber), hadithCount: intOrNull(o.hadithCount),
  };
}

// ------------------------------------------------------------------- the client

/** A larger answer than this is not a hadith page. */
export const MAX_BODY_CHARS = 2_000_000;
const SLUG = /^[a-z0-9]{1,24}$/;
const NUMBER = /^[A-Za-z0-9._-]{1,16}$/;

export interface HadithClientOptions {
  http: HadithHttp;
  base?: string;
  timeoutMs?: number;
  /** At least this long between two requests (the API allows 600 a minute per IP; this keeps well under it). */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How long an answer is remembered in memory. 0 turns the memory off. */
  cacheTtlMs?: number;
  cacheMax?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createHadithClient(opts: HadithClientOptions): HadithClient {
  const base = (opts.base ?? HADITH_API_BASE).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const minInterval = opts.minIntervalMs ?? 150;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cacheMax = opts.cacheMax ?? 120;
  const cache = new Map<string, { at: number; value: unknown }>();
  let nextAt = 0;

  /** Waits for this request's turn, so requests start at least `minInterval` apart even when several are asked for at once. */
  async function turn(signal?: AbortSignal): Promise<void> {
    const t = now();
    const start = Math.max(t, nextAt);
    nextAt = start + minInterval;
    if (start > t) await sleep(start - t);
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
  }

  async function fetchParsed<T>(path: string, parse: (data: unknown) => T, signal?: AbortSignal): Promise<T> {
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

  const slug = (s: string): string => (SLUG.test(s) ? s : (() => { throw new HadithError("bad-request", "not a collection name"); })());
  const num = (s: string): string => (NUMBER.test(s) ? encodeURIComponent(s) : (() => { throw new HadithError("bad-request", "not a book or hadith number"); })());
  const int = (n: number | undefined, fallback: number, min: number, max: number): number => (n === undefined ? fallback : Number.isInteger(n) && n >= min && n <= max ? n : (() => { throw new HadithError("bad-request", "number out of range"); })());

  return {
    collections: async (signal) => fetchParsed("/v1/hadith/collections", (d) => needArray(d, "collections").map(parseCollection), signal),

    books: async (collection, signal) => fetchParsed(`/v1/hadith/collections/${slug(collection)}/books`, (d) => needArray(d, "books").map(parseBook), signal),

    async hadiths(collection, bookNumber, page = {}, signal) {
      const limit = int(page.limit, 20, 1, 50);
      const offset = int(page.offset, 0, 0, 1_000_000);
      return fetchParsed(
        `/v1/hadith/collections/${slug(collection)}/books/${num(bookNumber)}/hadiths?limit=${limit}&offset=${offset}`,
        (d) => {
          const o = needObj(d, "hadith list");
          return { total: intOrNull(o.total) ?? 0, offset: intOrNull(o.offset) ?? offset, items: needArray(o.hadiths, "hadiths").map(parseEntry) };
        },
        signal,
      );
    },

    hadith: async (collection, bookNumber, hadithNumber, signal) =>
      fetchParsed(`/v1/hadith/collections/${slug(collection)}/books/${num(bookNumber)}/hadiths/${num(hadithNumber)}`, parseEntry, signal),

    async search(query, o = {}, signal) {
      const q = query.trim().replace(/\s+/g, " ");
      if (q.length < 2 || q.length > 200) throw new HadithError("bad-request", "a search needs 2 to 200 characters");
      const limit = int(o.limit, 20, 1, 50);
      const offset = int(o.offset, 0, 0, 1_000_000);
      const filter = o.collection === undefined ? "" : `&collection=${slug(o.collection)}`;
      return fetchParsed(
        `/v1/hadith/search?q=${encodeURIComponent(q)}${filter}&limit=${limit}&offset=${offset}`,
        (d) => {
          const r = needObj(d, "search");
          return { total: intOrNull(r.total) ?? 0, offset: intOrNull(r.offset) ?? offset, items: needArray(r.results, "results").map(parseHit) };
        },
        signal,
      );
    },

    clearCache: () => cache.clear(),
  };
}

/** Turns an answer into its `data`, or throws the error a person can be told about. */
function decode(res: HadithHttpResponse): unknown {
  if (res.status === 404) throw new HadithError("not-found", "not found");
  if (res.status === 429) throw new HadithError("rate-limited", "too many requests", res.retryAfterSeconds);
  if (res.status === 400) throw new HadithError("bad-request", "the server did not accept the request");
  if (res.status >= 500) throw new HadithError("server", `the server answered ${res.status}`);
  if (res.status !== 200) throw new HadithError("bad-response", `the server answered ${res.status}`);
  if (res.body.length > MAX_BODY_CHARS) return bad("answer too large");
  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return bad("not JSON");
  }
  if (!isObj(json) || json.code !== 200 || !("data" in json)) return bad("no data");
  return json.data;
}

// ------------------------------------------------------------------- links and labels

/** Collections whose hadith have the address `https://sunnah.com/<slug>:<number>`. The API's "forty" is Sunnah.com's "nawawi40". */
const SUNNAH_SLUG: Readonly<Record<string, string>> = { bukhari: "bukhari", muslim: "muslim", nasai: "nasai", abudawud: "abudawud", tirmidhi: "tirmidhi", ibnmajah: "ibnmajah", forty: "nawawi40" };

/** The hadith's page on Sunnah.com, or null where this app is not sure of the address (it never guesses a link). */
export function sunnahUrl(collection: string, hadithNumber: string): string | null {
  const slug = SUNNAH_SLUG[collection];
  return slug !== undefined && /^\d{1,5}$/.test(hadithNumber) ? `${SUNNAH_SITE}/${slug}:${hadithNumber}` : null;
}

/** "Sahih (Darussalam)", or just "Sahih" when the source names nobody. */
export function gradeLabel(g: HadithGrade): string {
  return g.gradedBy ? `${g.grade} (${g.gradedBy})` : g.grade;
}
