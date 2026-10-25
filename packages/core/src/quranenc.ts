/**
 * Live tafsir and translation notes from QuranEnc.com (Rowwad Translation Center / IslamHouse). Nothing is stored: an ayah's
 * tafsir is fetched when the person opens it, shown exactly as the publisher wrote it, and forgotten (a short in-memory cache only
 * saves repeated taps in one session).
 *
 * The publisher's terms (read 2026-10-23): the content may be downloaded and re-published; it may not be changed, added to or cut;
 * the publisher (QuranEnc.com) must be clearly credited; the version is to be stated and the latest version used. So this module
 * never rewrites a text (it only checks that a field is a string), and screens must show `QURANENC_CREDIT` with every text.
 * The terms do not say that an app may keep copies it did not publish itself, so the app keeps none; a pack built from this
 * source follows the "download and re-publish" conditions and is a separate piece of work (see docs/roadmap/HISTORY-PLAN.md).
 *
 * The publisher's API page (https://quranenc.com/en/home/api, read 2026-10-24) has two families of address: `translation/...`
 * (an ayah with `translation` and `footnotes`) and `tafsir/...` (blocks with `from_aya`, `to_aya`, `type`, `text`). Which family an
 * edition lives in is known for the two the app offers; the client still tries the other family when the first has none.
 * The page does not show whole answers, so they are read defensively: with or without a `result` wrapper, as an object or a list of
 * one, numbers as strings. A wrong shape ends as a plain "unexpected answer", never a crash.
 * The edition's version number (the terms ask for it) comes from the publisher's lists: `translations/list` and `tafsirs/list`.
 *
 * Pure TypeScript; the network is the same `HadithHttp` port the other online clients use.
 */

import { HadithError } from "./hadith.ts";
import type { HadithHttp, HadithHttpResponse } from "./hadith.ts";

export const QURANENC_API_BASE = "https://quranenc.com/api/v1";
export const QURANENC_SITE = "https://quranenc.com";

/** What every QuranEnc screen must say about where the text came from. */
export const QURANENC_CREDIT = { source: "QuranEnc.com", publisher: "Rowwad Translation Center, IslamHouse.com", url: QURANENC_SITE } as const;

export type QuranEncKind = "tafsir" | "translation-notes";
export type QuranEncLanguage = "bn" | "en" | "ar";

/** An edition the app offers. The key is the publisher's own; the titles are Tarteel's description of it. */
export type QuranEncApi = "translation" | "tafsir";

export interface QuranEncEdition {
  key: string;
  language: QuranEncLanguage;
  kind: QuranEncKind;
  /** Which family of addresses to try first. */
  api: QuranEncApi;
  title: { en: string; bn: string };
}

/**
 * The editions the app offers. The publisher's lists (`tafsirs/list`, `translations/list`, read 2026-10-24) hold the Saadi tafsir
 * (no Bengali) and 76 translations (none Bengali or Arabic), but the lists are not the whole service: the sura endpoint answers for
 * `bengali_mokhtasar` too (checked by the owner on a phone, 2026-10-25: `translation/sura/bengali_mokhtasar/1` returned the
 * seven ayahs of al-Fatiha in the usual `result` list, with `arabic_text`, `translation` and `footnotes: null`). That edition is the
 * Bengali translation of the concise tafsir (Al-Mukhtasar). Because the list does not mention it, its version number is not known
 * to the app, and the screen says so.
 */
export const QURANENC_EDITIONS: readonly QuranEncEdition[] = [
  { key: "bengali_mokhtasar", api: "translation", language: "bn", kind: "tafsir", title: { en: "Al-Mukhtasar, the concise tafsir (Bengali)", bn: "আল-মুখতাসার, সংক্ষিপ্ত তাফসির (বাংলা)" } },
  { key: "arabic_saadi", api: "tafsir", language: "ar", kind: "tafsir", title: { en: "Tafsir al-Saʿdi (Arabic)", bn: "তাফসির আস-সাদী (আরবি)" } },
  { key: "english_saheeh", api: "translation", language: "en", kind: "translation-notes", title: { en: "Saheeh International translation, with notes (English)", bn: "সহীহ ইন্টারন্যাশনাল অনুবাদ, টীকাসহ (ইংরেজি)" } },
];

/** The editions in the order to offer them for an app language: its own language first, the rest after. */
export function quranEncEditionsFor(uiLanguage: string): QuranEncEdition[] {
  const first: QuranEncLanguage = uiLanguage === "bn" ? "bn" : uiLanguage === "ar" ? "ar" : "en";
  const rank = (e: QuranEncEdition): number => (e.language === first ? 0 : e.language === "bn" ? 1 : e.language === "en" ? 2 : 3);
  return [...QURANENC_EDITIONS].sort((a, b) => rank(a) - rank(b));
}

export const findQuranEncEdition = (key: string): QuranEncEdition | undefined => QURANENC_EDITIONS.find((e) => e.key === key);

// ------------------------------------------------------------------- model

/** One ayah as the publisher gives it. Texts are kept as sent, and null where the publisher sent none. */
export interface QuranEncAyah {
  sura: number;
  aya: number;
  /** The ayah in Arabic, as that edition prints it. */
  arabic: string | null;
  /** The tafsir (or, for a translation, the translation). */
  text: string | null;
  /** Numbered notes that go with `text`, when the edition has them. */
  footnotes: string | null;
  /** A tafsir block can cover several ayahs: the first and last of them. Null for a single ayah. */
  range: { from: number; to: number } | null;
}

/** What the publisher's list says about an edition: its version number, as the terms ask the app to state. */
export interface QuranEncVersion {
  version: string | null;
  lastUpdate: string | null;
}

export interface QuranEncClient {
  /** Version numbers by edition key, from the publisher's lists. Empty when neither list could be read. */
  versions(signal?: AbortSignal): Promise<Record<string, QuranEncVersion>>;
  aya(editionKey: string, sura: number, aya: number, signal?: AbortSignal): Promise<QuranEncAyah>;
  /** Every ayah of one surah, in order. */
  sura(editionKey: string, sura: number, signal?: AbortSignal): Promise<QuranEncAyah[]>;
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
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
};

export function parseQuranEncAyah(v: unknown): QuranEncAyah {
  const o = isObj(v) ? v : bad("ayah");
  const sura = num(o.sura) ?? bad("ayah.sura");
  const aya = num(o.aya) ?? bad("ayah.aya");
  const out: QuranEncAyah = { sura, aya, arabic: text(o.arabic_text), text: text(o.translation), footnotes: text(o.footnotes), range: null };
  if (out.text === null && out.footnotes === null) bad("ayah without text");
  return out;
}

interface TafsirBlock {
  id: number;
  sura: number;
  from: number;
  to: number;
  text: string;
}

function parseBlock(v: unknown): TafsirBlock {
  const o = isObj(v) ? v : bad("tafsir block");
  const from = num(o.from_aya) ?? num(o.aya) ?? bad("block.from_aya");
  const to = num(o.to_aya) ?? from;
  return { id: num(o.id) ?? 0, sura: num(o.sura) ?? bad("block.sura"), from, to: Math.max(from, to), text: text(o.text) ?? bad("block without text") };
}

/** The blocks that start at one ayah, as one entry: their texts one after the other, each unchanged. */
function entryOf(blocks: TafsirBlock[]): QuranEncAyah {
  const first = blocks[0] ?? bad("no blocks");
  const to = Math.max(...blocks.map((b) => b.to));
  return { sura: first.sura, aya: first.from, arabic: null, text: blocks.map((b) => b.text).join("\n\n"), footnotes: null, range: to > first.from ? { from: first.from, to } : null };
}

const byPlace = (a: TafsirBlock, b: TafsirBlock): number => a.from - b.from || a.id - b.id;

/** One ayah's tafsir: every block attached to or overlapping it. */
export function parseTafsirAya(r: unknown): QuranEncAyah {
  const rows = Array.isArray(r) ? r : [r];
  const blocks: TafsirBlock[] = [];
  for (const row of rows) {
    try {
      blocks.push(parseBlock(row));
    } catch {
      // One unreadable block does not hide the others.
    }
  }
  if (blocks.length === 0) bad("tafsir without text");
  return entryOf(blocks.sort(byPlace));
}

/** A whole surah's tafsir: one entry for each ayah where a block starts, in order. */
export function parseTafsirSura(r: unknown): QuranEncAyah[] {
  const rows = Array.isArray(r) ? r : bad("surah list");
  const groups = new Map<number, TafsirBlock[]>();
  for (const row of rows) {
    try {
      const b = parseBlock(row);
      groups.set(b.from, [...(groups.get(b.from) ?? []), b]);
    } catch {
      // skipped
    }
  }
  if (groups.size === 0) bad("surah without text");
  return [...groups.values()].map((g) => entryOf(g.sort(byPlace))).sort((a, b) => a.aya - b.aya);
}

export function parseQuranEncVersions(r: unknown): Record<string, QuranEncVersion> {
  // The publisher's lists are an object holding the array: `{translations: [...]}` or `{tafsirs: [...]}`.
  const rows = Array.isArray(r) ? r : isObj(r) && Array.isArray(r.translations) ? r.translations : isObj(r) && Array.isArray(r.tafsirs) ? r.tafsirs : bad("list");
  const out: Record<string, QuranEncVersion> = {};
  for (const row of rows) {
    if (!isObj(row) || typeof row.key !== "string" || !/^[a-z][a-z0-9_]{2,40}$/.test(row.key)) continue;
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" ? String(v) : null);
    out[row.key] = { version: str(row.version), lastUpdate: str(row.last_update) };
  }
  return out;
}

/** The answer's content: inside `result` when the server wraps it, else the answer itself. */
function parseResult(json: unknown): unknown {
  if (isObj(json) && "result" in json) return json.result;
  if (json === null || typeof json !== "object") bad("answer");
  return json;
}

// ------------------------------------------------------------------- the client

/** A larger answer than this is not a surah this app should hold in memory. */
export const QURANENC_MAX_BODY_CHARS = 3_000_000;

export interface QuranEncClientOptions {
  http: HadithHttp;
  base?: string;
  timeoutMs?: number;
  /** At least this long between two requests. The publisher states no limit, so the app stays gentle. */
  minIntervalMs?: number;
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
  if (res.body.length > QURANENC_MAX_BODY_CHARS) return bad("answer too large");
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return bad("not JSON");
  }
}

export function createQuranEncClient(opts: QuranEncClientOptions): QuranEncClient {
  const base = (opts.base ?? QURANENC_API_BASE).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const minInterval = opts.minIntervalMs ?? 250;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const ttl = opts.cacheTtlMs ?? 10 * 60_000;
  const cacheMax = opts.cacheMax ?? 30;
  const cache = new Map<string, { at: number; value: unknown }>();
  let nextAt = 0;

  async function turn(signal?: AbortSignal): Promise<void> {
    const t = now();
    const start = Math.max(t, nextAt);
    nextAt = start + minInterval;
    if (start > t) await sleep(start - t);
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
  }

  async function fetchParsed<T>(path: string, parse: (result: unknown) => T, signal?: AbortSignal): Promise<T> {
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
    const value = parse(parseResult(decode(res)));
    if (ttl > 0) {
      cache.delete(url);
      cache.set(url, { at: now(), value });
      while (cache.size > cacheMax) cache.delete(cache.keys().next().value as string);
    }
    return value;
  }

  // Which family of addresses worked for an edition: the next lookup goes straight there.
  const learned = new Map<string, QuranEncApi>();
  const other = (a: QuranEncApi): QuranEncApi => (a === "tafsir" ? "translation" : "tafsir");
  async function viaApi<T>(editionKey: string, run: (api: QuranEncApi) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const first = learned.get(editionKey) ?? findQuranEncEdition(editionKey)?.api ?? "translation";
    try {
      const v = await run(first);
      learned.set(editionKey, first);
      return v;
    } catch (e) {
      // Only "this family has no such edition" is worth a second try; a network problem would fail again.
      if (!(e instanceof HadithError) || !["not-found", "bad-response", "bad-request"].includes(e.code) || signal?.aborted) throw e;
      try {
        const v = await run(other(first));
        learned.set(editionKey, other(first));
        return v;
      } catch {
        throw e;
      }
    }
  }

  const key = (k: string): string => (/^[a-z][a-z0-9_]{2,40}$/.test(k) ? k : (() => { throw new HadithError("bad-request", "edition not valid"); })());
  const int = (n: number, max: number, what: string): number => (Number.isInteger(n) && n >= 1 && n <= max ? n : (() => { throw new HadithError("bad-request", `${what} out of range`); })());

  return {
    aya: async (editionKey, sura, aya, signal) => {
      const k = key(editionKey);
      const su = int(sura, 114, "surah");
      const ay = int(aya, 286, "ayah");
      return viaApi(k, (api) =>
        api === "tafsir"
          ? fetchParsed(`/tafsir/aya/${k}/${su}/${ay}`, parseTafsirAya, signal)
          : // One ayah comes as an object, or as a list of one.
            fetchParsed(`/translation/aya/${k}/${su}/${ay}`, (r) => parseQuranEncAyah(Array.isArray(r) ? r[0] : r), signal), signal);
    },

    sura: async (editionKey, sura, signal) => {
      const k = key(editionKey);
      const su = int(sura, 114, "surah");
      return viaApi(k, (api) =>
        api === "tafsir"
          ? fetchParsed(`/tafsir/sura/${k}/${su}`, parseTafsirSura, signal)
          : fetchParsed(`/translation/sura/${k}/${su}`, (r) => {
              const rows = Array.isArray(r) ? r : bad("surah list");
              const out: QuranEncAyah[] = [];
              for (const row of rows) {
                try {
                  out.push(parseQuranEncAyah(row));
                } catch {
                  // One unreadable row does not hide the others.
                }
              }
              if (out.length === 0) bad("surah without ayahs");
              return out.sort((a, b) => a.aya - b.aya);
            }, signal), signal);
    },

    versions: async (signal) => {
      const out: Record<string, QuranEncVersion> = {};
      let firstError: unknown;
      let any = false;
      for (const path of ["/translations/list", "/tafsirs/list"]) {
        try {
          Object.assign(out, await fetchParsed(path, parseQuranEncVersions, signal));
          any = true;
        } catch (e) {
          if (e instanceof HadithError && e.code === "cancelled") throw e;
          firstError ??= e;
        }
      }
      if (!any && firstError) throw firstError;
      return out;
    },

    clearCache: () => cache.clear(),
  };
}

/** The ayah's page on QuranEnc.com. The address is built from checked values only. */
export function quranEncUrl(language: QuranEncLanguage, editionKey: string, sura: number, aya?: number): string | null {
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(editionKey) || !Number.isInteger(sura) || sura < 1 || sura > 114) return null;
  if (aya !== undefined && (!Number.isInteger(aya) || aya < 1 || aya > 286)) return null;
  return `${QURANENC_SITE}/${language}/browse/${editionKey}/${sura}${aya !== undefined ? `/${aya}` : ""}`;
}
