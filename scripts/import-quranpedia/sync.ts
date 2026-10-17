import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { QuranpediaManifest } from "./convert.ts";

// Keeps data/knowledge/_incoming/quranpedia/ equal to Quranpedia's current official dump, for the three files the importer
// needs. Quranpedia's usage policy says: do not scrape the API, download the versioned dumps. So this fetches exactly three small
// files (manifest.json, LICENSE.md, the book) and only fetches the book when the manifest says its checksum changed.
// It never converts or publishes anything: the workflow turns a change into a pull request for a person to review.

export const DUMP_BASE = "https://quranpedia.net/dumps";
export const BOOK_FILE = "asbab-book-2919.json.gz";

export type Fetcher = (url: string) => Promise<{ status: number; bytes: Uint8Array }>;
export interface SyncResult {
  changed: boolean;
  bookChanged: boolean;
  licenseChanged: boolean;
  fromVersion: string | null;
  toVersion: string;
}

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const same = (a: Uint8Array | null, b: Uint8Array): boolean => a !== null && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const readOrNull = (p: string): Promise<Buffer | null> => readFile(p).catch(() => null);

async function get(fetch: Fetcher, url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
  if (res.bytes.length === 0) throw new Error(`${url}: empty answer`);
  return res.bytes;
}

function parseManifest(bytes: Uint8Array, where: string): QuranpediaManifest {
  let m: unknown;
  try {
    m = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${where}: not valid JSON`);
  }
  const o = m as Partial<QuranpediaManifest> | null;
  if (!o || typeof o.version !== "string" || typeof o.generated_at !== "string" || !Array.isArray(o.files)) throw new Error(`${where}: not a Quranpedia manifest (version, generated_at, files)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.version)) throw new Error(`${where}: version "${o.version.slice(0, 40)}" is not a date (YYYY-MM-DD)`);
  return o as QuranpediaManifest;
}

/**
 * Brings `dir` up to date. Nothing is written unless everything fetched checks out: the book must match the sha256 in the
 * manifest it came with, and the remote manifest must not be older than the one we hold.
 */
export async function syncQuranpedia(args: { dir: string; fetch: Fetcher; base?: string }): Promise<SyncResult> {
  const base = args.base ?? DUMP_BASE;
  const localManifestBytes = await readOrNull(join(args.dir, "manifest.json"));
  const local = localManifestBytes ? parseManifest(localManifestBytes, "local manifest.json") : null;

  const remoteManifestBytes = await get(args.fetch, `${base}/manifest.json`);
  const remote = parseManifest(remoteManifestBytes, `${base}/manifest.json`);
  const entry = remote.files.find((f) => f.name === BOOK_FILE);
  if (!entry || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`remote manifest does not list ${BOOK_FILE} with a sha256`);
  if (local && remote.version < local.version) throw new Error(`remote dump ${remote.version} is older than the one held (${local.version}); refusing to go back`);

  const remoteLicense = await get(args.fetch, `${base}/LICENSE.md`);
  const licenseChanged = !same(await readOrNull(join(args.dir, "LICENSE.md")), remoteLicense);
  const haveBook = await readOrNull(join(args.dir, BOOK_FILE));
  const bookChanged = !haveBook || sha256(haveBook) !== entry.sha256;

  if (!bookChanged && !licenseChanged) return { changed: false, bookChanged, licenseChanged, fromVersion: local?.version ?? null, toVersion: remote.version };

  const book = bookChanged ? await get(args.fetch, `${base}/${BOOK_FILE}`) : null;
  if (book && sha256(book) !== entry.sha256) throw new Error(`${BOOK_FILE}: downloaded file has sha256 ${sha256(book)}, the manifest says ${entry.sha256}; nothing was written`);

  await mkdir(args.dir, { recursive: true });
  if (book) await writeFile(join(args.dir, BOOK_FILE), book);
  await writeFile(join(args.dir, "LICENSE.md"), remoteLicense);
  await writeFile(join(args.dir, "manifest.json"), remoteManifestBytes);
  return { changed: true, bookChanged, licenseChanged, fromVersion: local?.version ?? null, toVersion: remote.version };
}
