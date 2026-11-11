import { HadithError, OPENITI_METADATA_URL, OPENITI_VERSION, fetchOpenItiText, indexCatalogue, openItiFileName, parseCatalogue, parseOpenItiMetadata, parseSavedIndex, serialiseCatalogue } from "@tarteel/core";
import type { CatalogueIndex, OpenItiEntry, OpenItiSaved } from "@tarteel/core";
import { createExpoFileStore } from "../audio/fileStore";
import { createFetchHadithHttp } from "../hadith/runtime";

/**
 * What the Books screen keeps on the device, and only because the person asked:
 *  - the OpenITI catalogue (a list of titles and authors, fetched when they open "OpenITI" and tap Download list),
 *  - each OpenITI book they chose to keep, as the text file the corpus publishes,
 *  - a small index of the kept books.
 * All of it lives in the app's private storage (not in Android backups). islamic.app books are never written here.
 */
const AREA = "books" as const;
const CATALOGUE = "openiti/catalogue.json";
const SAVED = "openiti/saved.json";
const textPath = (uri: string): string => `openiti/texts/${openItiFileName(uri)}`;

const files = createExpoFileStore();
const enc = new TextEncoder();
const dec = new TextDecoder();

async function readText(rel: string): Promise<string | null> {
  try {
    if (!(await files.exists(AREA, rel))) return null;
    return dec.decode(await files.read(AREA, rel));
  } catch {
    return null;
  }
}

/** Writes through a .part file, so a killed app never leaves a truncated file under the real name. */
async function writeText(rel: string, text: string): Promise<void> {
  await files.write(AREA, `${rel}.part`, enc.encode(text));
  await files.move(AREA, `${rel}.part`, rel);
}

let indexed: CatalogueIndex | null = null;

/** The catalogue kept on the device, or null when it has not been downloaded (or is from another corpus release). */
export async function loadCatalogue(): Promise<{ index: CatalogueIndex; at: number } | null> {
  const raw = await readText(CATALOGUE);
  if (!raw) return null;
  const parsed = parseCatalogue(raw);
  if (!parsed || parsed.entries.length === 0) return null;
  indexed = indexCatalogue(parsed.entries);
  return { index: indexed, at: parsed.at };
}

/** Downloads the corpus's list of texts (one file, a few megabytes) and keeps the Arabic ones. */
export async function downloadCatalogue(signal?: AbortSignal): Promise<{ index: CatalogueIndex; at: number }> {
  const http = createFetchHadithHttp();
  const res = await http.get(OPENITI_METADATA_URL, { timeoutMs: 180_000, signal });
  if (res.status === 429) throw new HadithError("rate-limited", "too many requests", res.retryAfterSeconds);
  if (res.status >= 500) throw new HadithError("server", `the server answered ${res.status}`);
  if (res.status !== 200) throw new HadithError("bad-response", `the server answered ${res.status}`);
  const entries: OpenItiEntry[] = parseOpenItiMetadata(res.body);
  if (entries.length < 50) throw new HadithError("bad-response", "the list looks wrong");
  const at = Date.now();
  await writeText(CATALOGUE, serialiseCatalogue(entries, at));
  indexed = indexCatalogue(entries);
  return { index: indexed, at };
}

/** Removes the catalogue (the kept books stay). */
export async function removeCatalogue(): Promise<void> {
  indexed = null;
  await files.remove(AREA, CATALOGUE);
}

export async function listSaved(): Promise<OpenItiSaved[]> {
  return parseSavedIndex(await readText(SAVED)).sort((a, b) => b.savedAt - a.savedAt);
}

async function writeSaved(list: OpenItiSaved[]): Promise<void> {
  await writeText(SAVED, JSON.stringify(list));
}

/** Downloads one book and keeps it. Returns the new index. The book is added only after its file is in place. */
export async function saveBook(entry: OpenItiEntry, signal?: AbortSignal): Promise<OpenItiSaved[]> {
  const fetched = await fetchOpenItiText(createFetchHadithHttp(), entry, { signal });
  await writeText(textPath(entry.uri), fetched.text);
  const rest = (await listSaved()).filter((s) => s.uri !== entry.uri);
  const next: OpenItiSaved[] = [
    { uri: entry.uri, titleAr: entry.titleAr, titleLat: entry.titleLat, authorAr: entry.authorAr, authorLat: entry.authorLat, date: entry.date, savedAt: Date.now(), chars: fetched.text.length, from: fetched.from, version: OPENITI_VERSION },
    ...rest,
  ];
  await writeSaved(next);
  return next;
}

/** Deletes a kept book's file and its entry. */
export async function removeSaved(uri: string): Promise<OpenItiSaved[]> {
  await files.remove(AREA, textPath(uri));
  const next = (await listSaved()).filter((s) => s.uri !== uri);
  await writeSaved(next);
  return next;
}

/** The text of a kept book, or null if the file is gone. */
export async function readSavedText(uri: string): Promise<string | null> {
  return await readText(textPath(uri));
}

/** Bytes used by the kept books and the catalogue. */
export async function booksBytes(): Promise<number> {
  let total = 0;
  for (const rel of await files.list(AREA)) total += await files.size(AREA, rel);
  return total;
}
