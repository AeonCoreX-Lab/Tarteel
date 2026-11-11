/**
 * Books from the OpenITI corpus (KITAB project), kept on the device when the person asks.
 *
 * Licence (Zenodo record 18613982, read 2026-10-28): Creative Commons Attribution-NonCommercial-ShareAlike 4.0. A copy kept on a
 * person's own device, with credit and the licence stated, is what that licence allows. Tarteel hosts nothing: the app fetches
 * the catalogue from Zenodo and a book's text file from the corpus's own GitHub repository, straight to the person's storage.
 * Everything here is pure TypeScript with the network as the `HadithHttp` port, so it runs the same in tests and in the app.
 *
 * What is known and what is not (the build sandbox cannot reach these hosts, so no real file was read):
 * - A text is named by an OpenITI URI, `0310Tabari.TarikhRusulWaMuluk.Shamela0009169-ara1`: author's death year (AH) and name,
 *   book, version-language. Texts live in the repository `OpenITI/<NNNN>AH` (25-year blocks of the author's death year, the
 *   repository named by the block's last year), under `data/<author>/<author>.<book>/<uri>`; the file may carry an extension
 *   (`.mARkdown`, `.completed`, `.inProgress`) that the metadata's `url` column names. The metadata file's columns are read by
 *   name, so a different column order is fine; when there is no `url` column the app tries the usual file names in turn.
 * - The mARkdown reader below handles the markers the corpus documents (`#` paragraphs, `~~` continuation lines, `### |`
 *   headings, `PageV01P012` page marks, `Ms000012` milestones, `@..@` and `$..$` tags). Page numbers are dropped, not shown,
 *   because the app does not know whether a mark opens or closes its page.
 */
import { HadithError } from "./hadith.ts";
import type { HadithHttp } from "./hadith.ts";
import type { BookChapter } from "./islamicbooks.ts";

export const OPENITI_VERSION = "2025.1.9";
export const OPENITI_LICENCE = { name: "CC BY-NC-SA 4.0", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" } as const;
export const OPENITI_CREDIT = { source: "OpenITI corpus (KITAB project)", url: "https://kitab-project.org/data/download", doi: "10.5281/zenodo.17767721" } as const;
/** The primary-version list (one digital text per book, 7 MB), a fixed file of the 2025.1.9 release. */
export const OPENITI_METADATA_URL = "https://zenodo.org/records/18613982/files/OpenITI_metadata_2025-1-9_pri.tsv?download=1";
export const OPENITI_RAW_BASE = "https://raw.githubusercontent.com/OpenITI";

/** A text file or a metadata list larger than this many characters is refused. */
export const OPENITI_MAX_TEXT_CHARS = 40_000_000;
export const OPENITI_MAX_METADATA_CHARS = 60_000_000;

// ------------------------------------------------------------------- URIs

export interface OpenItiUri {
  /** The author's death year, AH. */
  date: number;
  author: string;
  book: string;
  version: string;
  /** The language part, e.g. "ara1". */
  lang: string;
  /** `0310Tabari.TarikhRusulWaMuluk` */
  bookUri: string;
  /** `0310Tabari` */
  authorUri: string;
}

export function parseOpenItiUri(uri: string): OpenItiUri | null {
  const m = /^(\d{4})([A-Za-z0-9]+)\.([A-Za-z0-9]+)\.([A-Za-z0-9]+)-([a-z]{3}\d{0,2})$/.exec(uri.trim());
  if (!m) return null;
  const date = Number(m[1]);
  const author = m[2] as string;
  const book = m[3] as string;
  return { date, author, book, version: m[4] as string, lang: m[5] as string, bookUri: `${m[1]}${author}.${book}`, authorUri: `${m[1]}${author}` };
}

/** The repository holding authors who died in this year: 25-year blocks named by the last year, `0025AH` ... `1450AH`. */
export function openItiRepo(date: number): string | null {
  if (!Number.isInteger(date) || date < 1 || date > 1450) return null;
  return `${String(Math.ceil(date / 25) * 25).padStart(4, "0")}AH`;
}

const GITHUB_BLOB = /^https:\/\/github\.com\/OpenITI\/([A-Za-z0-9]+)\/(?:blob|raw)\/([A-Za-z0-9._-]+)\/(data\/[A-Za-z0-9._\/-]+)$/;

/**
 * The addresses to try for a text, best first. The metadata's own `url` (a GitHub page address) is turned into the raw one;
 * otherwise the usual file names are tried one after another by the downloader.
 */
export function openItiTextUrls(uri: string, metadataUrl: string | null): string[] {
  const p = parseOpenItiUri(uri);
  if (!p) return [];
  const out: string[] = [];
  if (metadataUrl) {
    const m = GITHUB_BLOB.exec(metadataUrl.trim());
    if (m && (m[3] as string).includes(p.bookUri)) out.push(`${OPENITI_RAW_BASE}/${m[1]}/${m[2]}/${m[3]}`);
  }
  const repo = openItiRepo(p.date);
  if (repo) {
    const dir = `${OPENITI_RAW_BASE}/${repo}/master/data/${p.authorUri}/${p.bookUri}/${uri}`;
    for (const ext of ["", ".mARkdown", ".completed", ".inProgress"]) if (!out.includes(dir + ext)) out.push(dir + ext);
  }
  return out;
}

// ------------------------------------------------------------------- the catalogue

export interface OpenItiEntry {
  uri: string;
  titleAr: string;
  titleLat: string;
  authorAr: string;
  authorLat: string;
  /** The author's death year, AH. */
  date: number;
  /** Size in words, when the metadata gives it. */
  words: number | null;
  /** The metadata's own address for the text, when it gives one. */
  url: string | null;
}

/** Splits one delimited text into rows; quotes may hold the delimiter and doubled quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

const norm = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function column(header: string[], names: string[]): number {
  const keys = header.map(norm);
  for (const n of names) {
    const i = keys.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Reads the corpus's metadata list (tab or comma separated; columns are found by name). Only Arabic texts with a well-formed URI
 * are kept; a row whose status says it is not the primary version is dropped when there is a status column.
 */
export function parseOpenItiMetadata(text: string): OpenItiEntry[] {
  if (text.length > OPENITI_MAX_METADATA_CHARS) throw new HadithError("bad-response", "metadata too large");
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows = parseDelimited(text, delimiter);
  const header = rows[0];
  if (!header) throw new HadithError("bad-response", "empty metadata");
  const cUri = column(header, ["versionuri", "uri", "versionid", "id"]);
  if (cUri < 0) throw new HadithError("bad-response", "metadata has no version column");
  const cTitleAr = column(header, ["titlear", "bookar", "titlearabic"]);
  const cTitleLat = column(header, ["titlelat", "titlelatin", "title", "book"]);
  const cAuthorAr = column(header, ["authorar", "authorarabic"]);
  const cAuthorLat = column(header, ["authorlat", "authorlatin", "author"]);
  const cWords = column(header, ["toklength", "wordcount", "words", "length"]);
  const cStatus = column(header, ["status"]);
  const cUrl = column(header, ["url", "textlink", "link"]);
  const out: OpenItiEntry[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as string[];
    const uri = (row[cUri] ?? "").trim();
    const p = parseOpenItiUri(uri);
    if (!p || !p.lang.startsWith("ara") || seen.has(uri)) continue;
    if (cStatus >= 0) {
      const s = (row[cStatus] ?? "").trim().toLowerCase();
      if (s !== "" && s !== "pri" && s !== "primary") continue;
    }
    seen.add(uri);
    const words = cWords >= 0 ? Number((row[cWords] ?? "").replace(/[^0-9]/g, "")) : NaN;
    const url = cUrl >= 0 ? (row[cUrl] ?? "").trim() : "";
    out.push({
      uri,
      titleAr: (cTitleAr >= 0 ? row[cTitleAr] ?? "" : "").trim(),
      titleLat: (cTitleLat >= 0 ? row[cTitleLat] ?? "" : "").trim() || p.book,
      authorAr: (cAuthorAr >= 0 ? row[cAuthorAr] ?? "" : "").trim(),
      authorLat: (cAuthorLat >= 0 ? row[cAuthorLat] ?? "" : "").trim() || p.author,
      date: p.date,
      words: Number.isFinite(words) && words > 0 ? words : null,
      url: url.startsWith("http") ? url : null,
    });
  }
  return out;
}

/** Folds Arabic (marks, tatweel, alef, ya and ta marbuta variants) and Latin (accents, case) so that a search matches either way. */
export function foldForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface CatalogueIndex {
  entries: OpenItiEntry[];
  folded: string[];
}

export function indexCatalogue(entries: OpenItiEntry[]): CatalogueIndex {
  return { entries, folded: entries.map((e) => foldForSearch(`${e.titleAr} ${e.titleLat} ${e.authorAr} ${e.authorLat}`)) };
}

/** Every word of the query must appear; a word in the title ranks above one only in the author's name; earlier authors and shorter titles first. */
export function searchCatalogue(index: CatalogueIndex, query: string, limit = 40): OpenItiEntry[] {
  const words = foldForSearch(query).split(" ").filter((w) => w !== "");
  if (words.length === 0) return [];
  const scored: { e: OpenItiEntry; score: number }[] = [];
  for (let i = 0; i < index.entries.length; i++) {
    const hay = index.folded[i] as string;
    if (!words.every((w) => hay.includes(w))) continue;
    const e = index.entries[i] as OpenItiEntry;
    const title = foldForSearch(`${e.titleAr} ${e.titleLat}`);
    const inTitle = words.filter((w) => title.includes(w)).length;
    const starts = title.startsWith(words[0] as string) ? 1 : 0;
    scored.push({ e, score: inTitle * 4 + starts * 3 - Math.min(e.titleLat.length, 60) / 60 });
  }
  scored.sort((a, b) => b.score - a.score || a.e.date - b.e.date);
  return scored.slice(0, limit).map((s) => s.e);
}

// Storage: the catalogue and the list of kept books are small JSON files on the device.

export function serialiseCatalogue(entries: OpenItiEntry[], at: number): string {
  return JSON.stringify({ v: 1, version: OPENITI_VERSION, at, rows: entries.map((e) => [e.uri, e.titleAr, e.titleLat, e.authorAr, e.authorLat, e.words, e.url]) });
}

export function parseCatalogue(json: string): { at: number; version: string; entries: OpenItiEntry[] } | null {
  try {
    const o = JSON.parse(json) as { v?: number; version?: string; at?: number; rows?: unknown };
    if (o.v !== 1 || !Array.isArray(o.rows) || typeof o.at !== "number") return null;
    const entries: OpenItiEntry[] = [];
    for (const r of o.rows) {
      if (!Array.isArray(r) || typeof r[0] !== "string") continue;
      const p = parseOpenItiUri(r[0]);
      if (!p) continue;
      entries.push({
        uri: r[0],
        titleAr: String(r[1] ?? ""),
        titleLat: String(r[2] ?? ""),
        authorAr: String(r[3] ?? ""),
        authorLat: String(r[4] ?? ""),
        date: p.date,
        words: typeof r[5] === "number" ? r[5] : null,
        url: typeof r[6] === "string" ? r[6] : null,
      });
    }
    return { at: o.at, version: typeof o.version === "string" ? o.version : "", entries };
  } catch {
    return null;
  }
}

export interface OpenItiSaved {
  uri: string;
  titleAr: string;
  titleLat: string;
  authorAr: string;
  authorLat: string;
  date: number;
  savedAt: number;
  chars: number;
  /** Where the copy came from, shown with the credit. */
  from: string;
  /** The corpus release the copy belongs to. */
  version: string;
}

export function parseSavedIndex(json: string | null): OpenItiSaved[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: OpenItiSaved[] = [];
    for (const r of raw as Record<string, unknown>[]) {
      if (typeof r?.uri !== "string" || !parseOpenItiUri(r.uri)) continue;
      out.push({
        uri: r.uri,
        titleAr: String(r.titleAr ?? ""),
        titleLat: String(r.titleLat ?? ""),
        authorAr: String(r.authorAr ?? ""),
        authorLat: String(r.authorLat ?? ""),
        date: typeof r.date === "number" ? r.date : 0,
        savedAt: typeof r.savedAt === "number" ? r.savedAt : 0,
        chars: typeof r.chars === "number" ? r.chars : 0,
        from: String(r.from ?? ""),
        version: String(r.version ?? ""),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** The file name a kept book is stored under; the URI has only letters, digits, dots and a hyphen. */
export const openItiFileName = (uri: string): string => {
  if (!parseOpenItiUri(uri)) throw new Error("not an OpenITI address");
  return `${uri}.txt`;
};

// ------------------------------------------------------------------- downloading

export interface OpenItiFetched {
  text: string;
  from: string;
}

/** An answer that is a web page, not a text (a captive portal, an error page), is not a book. */
export function looksLikeOpenItiText(text: string): boolean {
  const head = text.slice(0, 600).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) return false;
  return text.length > 80 && /(^|\n)(#|~~|###)/.test(text.slice(0, 200_000));
}

/** Fetches one text, trying the candidate addresses in turn: only a 404 moves to the next; anything else is the answer. */
export async function fetchOpenItiText(http: HadithHttp, entry: Pick<OpenItiEntry, "uri" | "url">, opts: { timeoutMs?: number; signal?: AbortSignal | undefined } = {}): Promise<OpenItiFetched> {
  const urls = openItiTextUrls(entry.uri, entry.url);
  if (urls.length === 0) throw new HadithError("bad-request", "not an OpenITI address");
  let lastNotFound = false;
  for (const url of urls) {
    if (opts.signal?.aborted) throw new HadithError("cancelled", "cancelled");
    let res;
    try {
      res = await http.get(url, { timeoutMs: opts.timeoutMs ?? 180_000, signal: opts.signal });
    } catch (e) {
      if (e instanceof HadithError) throw e;
      if (opts.signal?.aborted) throw new HadithError("cancelled", "cancelled");
      throw new HadithError("network", e instanceof Error ? e.message : String(e));
    }
    if (res.status === 404) {
      lastNotFound = true;
      continue;
    }
    if (res.status === 429) throw new HadithError("rate-limited", "too many requests", res.retryAfterSeconds);
    if (res.status >= 500) throw new HadithError("server", `the server answered ${res.status}`);
    if (res.status !== 200) throw new HadithError("bad-response", `the server answered ${res.status}`);
    if (res.body.length > OPENITI_MAX_TEXT_CHARS) throw new HadithError("bad-response", "text too large");
    if (!looksLikeOpenItiText(res.body)) throw new HadithError("bad-response", "not a text file");
    return { text: res.body, from: url };
  }
  throw new HadithError(lastNotFound ? "not-found" : "bad-request", "no copy found");
}

// ------------------------------------------------------------------- reading mARkdown

const PAGE = /PageV[0-9A-Za-z]+P[0-9]+/g;
const MILESTONE = /\bMs[0-9]{3,}\b/g;
const TAG_AT = /@[A-Z]{1,8}[A-Z0-9_@]*/g;
const TAG_DOLLAR = /\$[A-Z]{2,8}\$/g;

function cleanLine(s: string): string {
  return s
    .replace(PAGE, " ")
    .replace(MILESTONE, " ")
    .replace(TAG_AT, " ")
    .replace(TAG_DOLLAR, " ")
    .replace(/%~%/g, "   ")
    .replace(/[ \t ]+/g, " ")
    .trim();
}

const HEADING = /^###\s*(\|+)\s*(?:EDITOR\s*\|)?\s*(.*)$/;

const PART_CHARS = 14_000;

/**
 * Turns an OpenITI mARkdown text into chapters: a heading line starts one, its depth is the number of pipes. A text with fewer
 * than two headings is cut into parts of about 14,000 characters instead, at paragraph ends, so no screen holds a whole book.
 */
export function parseOpenItiText(raw: string): { title: string | null; chapters: BookChapter[] } {
  const lines = raw.split(/\r?\n/);
  let i = 0;
  let title: string | null = null;
  if (lines[0]?.startsWith("######OpenITI#")) {
    for (; i < Math.min(lines.length, 400); i++) {
      const l = lines[i] as string;
      const m = /^#META#\s*(?:010\.BookTITLE|BookTITLE|Title)[^:]*::\s*(.*)$/i.exec(l);
      if (m && title === null && (m[1] ?? "").trim() !== "") title = (m[1] as string).trim();
      if (l.startsWith("#META#Header#End#")) {
        i++;
        break;
      }
    }
    if (i >= 400) i = 0;
  }
  const chapters: { title: string; level: number; paras: string[] }[] = [];
  let cur: { title: string; level: number; paras: string[] } = { title: "", level: 1, paras: [] };
  let headings = 0;
  const flush = (): void => {
    if (cur.paras.length > 0 || cur.title !== "") chapters.push(cur);
  };
  for (; i < lines.length; i++) {
    const line = lines[i] as string;
    const h = HEADING.exec(line);
    if (h) {
      const name = cleanLine(h[2] as string);
      if (name === "" && headings === 0) continue;
      flush();
      headings++;
      cur = { title: name, level: Math.min((h[1] as string).length, 6), paras: [] };
      continue;
    }
    if (line.startsWith("#META#") || line.startsWith("######OpenITI#")) continue;
    if (line.startsWith("~~")) {
      const t = cleanLine(line.slice(2));
      if (t === "") continue;
      const last = cur.paras.length - 1;
      if (last >= 0) cur.paras[last] = `${cur.paras[last]} ${t}`;
      else cur.paras.push(t);
      continue;
    }
    const body = line.startsWith("# ") ? line.slice(2) : line.startsWith("#") ? line.slice(1) : line;
    const t = cleanLine(body);
    if (t === "" || /^[#|$-]+$/.test(t)) continue;
    cur.paras.push(t);
  }
  flush();
  if (headings >= 2)
    return { title, chapters: chapters.map((c) => ({ title: c.title, level: c.level, vol: null, page: null, text: c.paras.join("\n\n") })) };
  // No useful headings: parts of about the same size.
  const all = chapters.flatMap((c) => (c.title !== "" ? [c.title, ...c.paras] : c.paras));
  const parts: BookChapter[] = [];
  let buf: string[] = [];
  let size = 0;
  const cut = (): void => {
    if (buf.length > 0) parts.push({ title: "", level: 1, vol: null, page: null, text: buf.join("\n\n") });
    buf = [];
    size = 0;
  };
  for (const p of all) {
    buf.push(p);
    size += p.length;
    if (size >= PART_CHARS) cut();
  }
  cut();
  return { title, chapters: parts };
}

/** The same reading, with a long chapter cut into blocks that a list can show one at a time. */
export function blocksOf(text: string, maxChars = 2500): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= maxChars) {
      if (para.trim() !== "") out.push(para);
      continue;
    }
    let rest = para;
    while (rest.length > maxChars) {
      let at = rest.lastIndexOf(" ", maxChars);
      if (at < maxChars / 2) at = maxChars;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trimStart();
    }
    if (rest !== "") out.push(rest);
  }
  return out;
}
