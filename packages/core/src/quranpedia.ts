/**
 * Live reading from Quranpedia.net (الموسوعة القرآنية): the introduction and facts of a surah, classical tafsir for one ayah, and
 * the reasons of revelation (asbab al-nuzul). Nothing is stored: a page is fetched when the person opens it, shown, and forgotten
 * (a short in-memory cache only saves repeated taps in one session).
 *
 * The publisher's terms (API page https://api.quranpedia.net and its usage policy, summarised 2026-10-25): the API is free,
 * read-only and needs no key; apps that ask it live may use it; attribution is optional for such apps (a link is appreciated) and
 * required only when the data is republished as a downloadable dataset; the limit is 120 requests a minute and 10,000 a day for
 * each IP address; the API is not a download service, so crawling it to mirror the corpus is discouraged and the app does not do
 * that: it asks for one page at a time, only when the person opens it. The licence says the classical works are shared heritage
 * and that translations and contemporary works stay with their authors, so the app offers only the classical books named in
 * `QURANPEDIA_BOOKS`, never a list taken from the server.
 *
 * The documentation names the endpoints and the fields but shows no whole answers, so they are read defensively: a wrong shape
 * ends as a plain "unexpected answer", never a crash. Pure TypeScript; the network is the same `HadithHttp` port the other
 * online clients use.
 */

import { HadithError } from "./hadith.ts";
import type { HadithHttp, HadithHttpResponse } from "./hadith.ts";

export const QURANPEDIA_API_BASE = "https://api.quranpedia.net/v1";
export const QURANPEDIA_SITE = "https://quranpedia.net";

/** What every Quranpedia screen should say about where the text came from (optional for the publisher, always shown by the app). */
export const QURANPEDIA_CREDIT = { source: "الموسوعة القرآنية · Quranpedia.net", url: QURANPEDIA_SITE } as const;

export type QuranpediaBookKind = "tafsir" | "asbab";

/**
 * The books the app offers. The numbers are Quranpedia's own book ids, taken from the manifest of its official dump, where each id
 * has this title. The author and the language shown on a screen come from the server's answer for that book, not from this list,
 * so a wrong id would show an unexpected author rather than a wrong claim.
 */
export interface QuranpediaBook {
  id: number;
  kind: QuranpediaBookKind;
  /** The book's own title in Arabic, as the dump names it. */
  arabic: string;
  /** Tarteel's short description. */
  title: { en: string; bn: string };
}

export const QURANPEDIA_BOOKS: readonly QuranpediaBook[] = [
  { id: 2919, kind: "asbab", arabic: "أسباب نزول القرآن", title: { en: "Reasons of revelation: Asbab Nuzul al-Quran, al-Wahidi", bn: "শানে নুযূল: আসবাবু নুযূলিল কুরআন, আল-ওয়াহিদী" } },
  { id: 4, kind: "tafsir", arabic: "جامع البيان في تأويل آي القرآن", title: { en: "Tafsir al-Tabari: Jami' al-Bayan", bn: "তাফসির আত-তাবারী: জামিউল বায়ান" } },
  { id: 136, kind: "tafsir", arabic: "تفسير القرآن العظيم", title: { en: "Tafsir al-Qur'an al-'Azim (Ibn Kathir)", bn: "তাফসিরুল কুরআনিল আজীম (ইবনে কাসীর)" } },
  { id: 2, kind: "tafsir", arabic: "معالم التنزيل", title: { en: "Ma'alim al-Tanzil (al-Baghawi)", bn: "মাআলিমুত তানযীল (আল-বাগাবী)" } },
  { id: 340, kind: "tafsir", arabic: "زاد المسير في علم التفسير", title: { en: "Zad al-Masir (Ibn al-Jawzi)", bn: "যাদুল মাসীর (ইবনুল জাওযী)" } },
  { id: 350, kind: "tafsir", arabic: "المحرر الوجيز فى تفسير الكتاب العزيز", title: { en: "al-Muharrar al-Wajiz (Ibn 'Atiyyah)", bn: "আল-মুহাররার আল-ওয়াজীয (ইবনে আতিয়্যা)" } },
  { id: 352, kind: "tafsir", arabic: "مفاتيح الغيب", title: { en: "Mafatih al-Ghayb (al-Razi)", bn: "মাফাতীহুল গাইব (আর-রাযী)" } },
  { id: 319, kind: "tafsir", arabic: "أنوار التنزيل وأسرار التأويل", title: { en: "Anwar al-Tanzil (al-Baydawi)", bn: "আনওয়ারুত তানযীল (আল-বাইযাভী)" } },
  { id: 345, kind: "tafsir", arabic: "التسهيل لعلوم التنزيل", title: { en: "al-Tashil li-'Ulum al-Tanzil (Ibn Juzayy)", bn: "আত-তাসহীল (ইবনে জুযাই)" } },
  { id: 272, kind: "tafsir", arabic: "تفسير الجلالين", title: { en: "Tafsir al-Jalalayn", bn: "তাফসিরুল জালালাইন" } },
];

export const findQuranpediaBook = (id: number): QuranpediaBook | undefined => QURANPEDIA_BOOKS.find((b) => b.id === id);

// ------------------------------------------------------------------- model

export interface QuranpediaSection {
  /** The server's key, for example `introduction`. */
  key: string;
  /** The server's own heading for it (Arabic). */
  title: string;
  text: string;
}

export interface QuranpediaSurahInfo {
  sections: QuranpediaSection[];
}

export interface QuranpediaPassage {
  text: string;
  part: string | null;
  page: string | null;
  /** The ayahs this passage speaks about, as the server writes them (for example `2:255-2:257`). */
  ayahs: string | null;
}

export interface QuranpediaBookAnswer {
  /** From the server's answer for this book. */
  bookName: string | null;
  author: string | null;
  language: string | null;
  passages: QuranpediaPassage[];
}

export interface QuranpediaClient {
  surahInfo(surah: number, signal?: AbortSignal): Promise<QuranpediaSurahInfo>;
  /** One book's passages for one ayah. A book with nothing on that ayah is `not-found`. */
  ayahBook(bookId: number, surah: number, ayah: number, signal?: AbortSignal): Promise<QuranpediaBookAnswer>;
  clearCache(): void;
}

// ------------------------------------------------------------------- reading what the server sent

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (what: string): never => {
  throw new HadithError("bad-response", `unexpected answer: ${what}`);
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

/**
 * The server's text with its markup taken off: a line break tag becomes a line break, other tags are removed, and the few common
 * character references are written as the characters they stand for. No word is changed. Null when nothing readable is left.
 */
export function cleanQuranpediaText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
  return s.trim() === "" ? null : s.replace(/^\s*\n+/, "").replace(/\n+\s*$/, "");
}

const label = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null);

/** The order the surah's facts are shown in; any other key the server sends follows. */
export const SURAH_INFO_ORDER: readonly string[] = ["introduction", "revelation", "descent", "surah_type", "topics", "purposes", "grace", "asmaoha", "prophet", "ayahs_count", "words_count"];

export function parseSurahInfo(r: unknown): QuranpediaSurahInfo {
  const o = isObj(r) ? r : bad("surah information");
  const found: QuranpediaSection[] = [];
  for (const [key, v] of Object.entries(o)) {
    if (key === "surah_number" || !/^[a-z0-9_]{2,40}$/.test(key)) continue;
    const entry = isObj(v) ? v : null;
    const raw = entry ? entry.value : v;
    const text = Array.isArray(raw) ? cleanQuranpediaText(raw.filter((x) => typeof x === "string").join("\n")) : cleanQuranpediaText(typeof raw === "number" ? String(raw) : raw);
    if (text === null) continue;
    found.push({ key, title: (entry && label(entry.title)) || key, text });
  }
  if (found.length === 0) bad("surah information without text");
  const rank = (k: string): number => {
    const i = SURAH_INFO_ORDER.indexOf(k);
    return i < 0 ? SURAH_INFO_ORDER.length : i;
  };
  return { sections: found.sort((a, b) => rank(a.key) - rank(b.key)) };
}

export function parseBookAnswer(r: unknown): QuranpediaBookAnswer {
  const o = isObj(r) ? r : bad("book answer");
  const content = Array.isArray(o.content) ? o.content : bad("book answer without content");
  const passages: QuranpediaPassage[] = [];
  for (const row of content) {
    if (!isObj(row)) continue;
    const text = cleanQuranpediaText(row.text);
    if (text === null) continue;
    passages.push({ text, part: label(row.part), page: label(row.page), ayahs: label(row.ayahs) });
  }
  if (passages.length === 0) throw new HadithError("not-found", "nothing in this book for this ayah");
  const book = isObj(o.book) ? o.book : {};
  const author = isObj(book.author) ? (label(book.author.full_name) ?? label(book.author.ar_name)) : null;
  const language = isObj(book.language) ? label(book.language.code) : null;
  return { bookName: label(book.name), author, language, passages };
}

// ------------------------------------------------------------------- the client

/** A larger answer than this is not a page this app should hold in memory. */
export const QURANPEDIA_MAX_BODY_CHARS = 3_000_000;

export interface QuranpediaClientOptions {
  http: HadithHttp;
  base?: string;
  timeoutMs?: number;
  /** At least this long between two requests. The publisher allows 120 a minute; the app stays well under it. */
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
  if (res.body.length > QURANPEDIA_MAX_BODY_CHARS) return bad("answer too large");
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return bad("not JSON");
  }
}

const int = (n: number, max: number, what: string): number => {
  if (!Number.isInteger(n) || n < 1 || n > max) throw new HadithError("bad-request", `${what} out of range`);
  return n;
};

export function createQuranpediaClient(opts: QuranpediaClientOptions): QuranpediaClient {
  const base = (opts.base ?? QURANPEDIA_API_BASE).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const minInterval = opts.minIntervalMs ?? 700;
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

  return {
    surahInfo: async (surah, signal) => fetchParsed(`/surah/information/${int(surah, 114, "surah")}`, (j) => parseSurahInfo(isObj(j) && isObj(j.result) ? j.result : j), signal),

    ayahBook: async (bookId, surah, ayah, signal) => {
      // Only the books the app names are asked for: no id from outside reaches the address.
      const book = findQuranpediaBook(bookId) ?? (() => { throw new HadithError("bad-request", "book not offered"); })();
      return fetchParsed(`/ayah/${int(surah, 114, "surah")}/${int(ayah, 286, "ayah")}/book/${book.id}`, (j) => parseBookAnswer(isObj(j) && isObj(j.result) ? j.result : j), signal);
    },

    clearCache: () => cache.clear(),
  };
}
