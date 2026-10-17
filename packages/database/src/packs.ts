import type { FileStore, SqlDriver } from "@tarteel/storage";
import type { Issue } from "@tarteel/quran-data";
import { CONTENT_MIGRATIONS, migrate } from "./migrations.ts";
import { validateKnowledgeDb } from "./knowledge.ts";

/**
 * Optional knowledge packs: one signed SQLite file each (same schema as content.db), downloaded, verified, validated
 * and then switched in atomically. The previous version stays in place until the new one has passed every check, so a
 * failed update never costs the user a working pack. Nothing here touches bookmarks, notes or the Quran data.
 *
 * Pure TypeScript: the network, the files, the hash, the signature check and the SQLite opener are injected (PackPorts).
 */

// ------------------------------------------------------------------ manifest

export interface PackDependency {
  packId: string;
  minVersion: number;
}

export interface PackLicense {
  /** Matches a row of the pack's `license` table. */
  id: string;
  name: string;
  /** Credit line for Settings -> Sources. */
  attribution: string;
}

export interface PackManifest {
  /** Stable id, [a-z0-9-]. */
  packId: string;
  /** Whole number, increases with every published change. */
  packVersion: number;
  /** Number of content migrations the database was built with (CONTENT_MIGRATIONS.length at build time). */
  schemaVersion: number;
  kind: "knowledge";
  /** Languages the pack's claim text is available in. */
  languages: string[];
  requires: PackDependency[];
  /** ISO timestamp. */
  publishedAt: string;
  file: { name: string; size: number; sha256: string };
  /** Every licence the pack's editions use, so attribution can be shown without opening the database. */
  licenses: PackLicense[];
  changelog: string;
  /** Name shown in the Library, per language (`{ en: "...", bn: "..." }`). Optional: the pack id is shown when absent. */
  title?: Record<string, string>;
  /** One or two sentences for the Library, per language. */
  description?: Record<string, string>;
  /** Base64 signature over `canonicalManifestBytes(manifest)`. */
  signature?: string;
}

export const MAX_PACK_BYTES = 256 * 1024 * 1024;
export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 400;

const ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,100}\.db$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function validatePackManifest(raw: unknown): { manifest: PackManifest | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const err = (code: string, message: string): void => void issues.push({ severity: "error", code, message });
  if (!isRecord(raw)) {
    err("manifest-invalid", "the manifest is not an object");
    return { manifest: null, issues };
  }
  if (typeof raw.packId !== "string" || !ID.test(raw.packId)) err("manifest-invalid", `packId must match ${String(ID)}`);
  if (!isPosInt(raw.packVersion)) err("manifest-invalid", "packVersion must be a whole number >= 1");
  if (!isPosInt(raw.schemaVersion)) err("manifest-invalid", "schemaVersion must be a whole number >= 1");
  if (raw.kind !== "knowledge") err("manifest-invalid", 'kind must be "knowledge"');
  if (!Array.isArray(raw.languages) || raw.languages.length === 0 || !raw.languages.every((l) => typeof l === "string" && LANG.test(l)))
    err("manifest-invalid", "languages must be a non-empty list of language codes");
  if (!Array.isArray(raw.requires)) err("manifest-invalid", "requires must be a list (empty if none)");
  else
    raw.requires.forEach((d, i) => {
      if (!isRecord(d) || typeof d.packId !== "string" || !ID.test(d.packId) || !isPosInt(d.minVersion)) err("manifest-invalid", `requires[${i}] needs a packId and a minVersion >= 1`);
      else if (d.packId === raw.packId) err("manifest-invalid", "a pack cannot require itself");
    });
  if (typeof raw.publishedAt !== "string" || Number.isNaN(Date.parse(raw.publishedAt))) err("manifest-invalid", "publishedAt must be an ISO date");
  const f = raw.file;
  if (!isRecord(f)) err("manifest-invalid", "file is required");
  else {
    if (typeof f.name !== "string" || !FILE_NAME.test(f.name)) err("manifest-invalid", "file.name must be a plain .db file name");
    if (!isPosInt(f.size) || f.size > MAX_PACK_BYTES) err("manifest-invalid", `file.size must be between 1 and ${MAX_PACK_BYTES} bytes`);
    if (typeof f.sha256 !== "string" || !SHA256.test(f.sha256)) err("manifest-invalid", "file.sha256 must be a lowercase sha256");
  }
  if (!Array.isArray(raw.licenses) || raw.licenses.length === 0) err("manifest-invalid", "licenses must list every licence the pack uses");
  else
    raw.licenses.forEach((l, i) => {
      if (!isRecord(l) || !isText(l.id) || !isText(l.name) || !isText(l.attribution)) err("manifest-invalid", `licenses[${i}] needs an id, a name and an attribution`);
    });
  if (!isText(raw.changelog)) err("manifest-invalid", "changelog is required");
  for (const [field, max] of [["title", MAX_TITLE], ["description", MAX_DESCRIPTION]] as const) {
    const v = raw[field];
    if (v === undefined) continue;
    if (!isRecord(v) || Object.keys(v).length === 0 || !Object.entries(v).every(([k, t]) => LANG.test(k) && isText(t) && t.length <= max))
      err("manifest-invalid", `${field} must map language codes to text of at most ${max} characters`);
  }
  if (raw.signature !== undefined && (typeof raw.signature !== "string" || !BASE64.test(raw.signature))) err("manifest-invalid", "signature must be base64");
  return { manifest: issues.length === 0 ? (raw as unknown as PackManifest) : null, issues };
}

/** JSON with sorted keys and no whitespace, so the same manifest always signs to the same bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** The bytes the publisher signs: the manifest without its `signature`. */
export function canonicalManifestBytes(manifest: PackManifest): Uint8Array {
  const unsigned: Record<string, unknown> = { ...manifest };
  delete unsigned.signature;
  return new TextEncoder().encode(canonicalJson(unsigned));
}

// --------------------------------------------------------------------- ports

export interface PackHttp {
  get(url: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<{ status: number; bytes: Uint8Array }>;
}

export interface InstalledPack {
  packId: string;
  packVersion: number;
  /** Path of the database inside the "packages" file area. */
  path: string;
  /** sha256 of the installed file, for the integrity check at startup. */
  sha256: string;
  sizeBytes: number;
  installedAt: number;
}

export interface PackRegistry {
  list(): Promise<InstalledPack[]>;
  get(packId: string): Promise<InstalledPack | undefined>;
  /** Insert or replace. This single write is the moment a new version becomes the installed one. */
  upsert(pack: InstalledPack): Promise<void>;
  remove(packId: string): Promise<void>;
}

export interface PackPorts {
  /** Files live in the "packages" area under `knowledge-packs/`. */
  files: FileStore;
  http: PackHttp;
  registry: PackRegistry;
  sha256(bytes: Uint8Array): Promise<string>;
  /** True when `signatureBase64` is the publisher's valid signature of `message`. The publisher's key belongs to the adapter. */
  verifySignature(message: Uint8Array, signatureBase64: string): Promise<boolean>;
  /** Opens the SQLite file at this path of the "packages" area. */
  openDb(relativePath: string): Promise<SqlDriver>;
  /** The content database: pack references to surahs and ayahs are checked against it. */
  quran: SqlDriver;
  /** CONTENT_MIGRATIONS.length of this app. */
  appSchemaVersion: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const AREA = "packages" as const;
const DIR = "knowledge-packs";
export const packDbPath = (packId: string, version: number): string => `${DIR}/${packId}.v${version}.db`;
export const packManifestPath = (dbPath: string): string => dbPath.replace(/\.db$/, ".manifest.json");
const partPath = (packId: string, version: number): string => `${packDbPath(packId, version)}.part`;

// ------------------------------------------------------------------- results

export type PackFailureCode =
  | "manifest-invalid" | "signature-missing" | "signature-invalid" | "insecure-url" | "app-too-old"
  | "missing-dependency" | "not-newer" | "download-failed" | "size-mismatch" | "checksum-mismatch"
  | "schema-error" | "validation-failed" | "commit-failed" | "storage-error" | "cancelled";

export type InstallResult =
  | { ok: true; installed: InstalledPack; replaced: InstalledPack | null }
  | { ok: false; code: PackFailureCode; message: string; issues?: Issue[] };

export interface InstallOptions {
  signal?: AbortSignal;
  /** Re-install the version that is already installed (repair a corrupt or missing file). */
  allowSameVersion?: boolean;
  attempts?: number;
  timeoutMs?: number;
}

class PackError extends Error {
  code: PackFailureCode;
  issues: Issue[] | undefined;
  constructor(code: PackFailureCode, message: string, issues?: Issue[]) {
    super(message);
    this.code = code;
    this.issues = issues;
  }
}

const sleepReal = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const quiet = (p: Promise<unknown>): Promise<void> => p.then(() => undefined, () => undefined);

// ------------------------------------------------------------------- install

/**
 * Downloads, verifies and installs one pack. Never throws for an expected failure: the result says what went wrong and
 * the previously installed version, if any, is untouched. Order: manifest -> signature -> compatibility ->
 * dependencies -> download -> size and hash -> open, migrate, check, validate -> move into place -> registry.
 */
export async function installPack(ports: PackPorts, rawManifest: unknown, url: string, opts: InstallOptions = {}): Promise<InstallResult> {
  const checked = validatePackManifest(rawManifest);
  if (!checked.manifest) return { ok: false, code: "manifest-invalid", message: checked.issues.map((i) => i.message).join("; "), issues: checked.issues };
  const manifest = checked.manifest;
  const part = partPath(manifest.packId, manifest.packVersion);
  let partWritten = false;
  try {
    if (!url.startsWith("https://")) throw new PackError("insecure-url", "packs are downloaded over https only");
    await verifyManifest(ports, manifest);
    if (manifest.schemaVersion > ports.appSchemaVersion)
      throw new PackError("app-too-old", `the pack needs database schema ${manifest.schemaVersion}, this app has ${ports.appSchemaVersion}`);
    const installedList = await ports.registry.list();
    for (const dep of manifest.requires) {
      const have = installedList.find((p) => p.packId === dep.packId);
      if (!have || have.packVersion < dep.minVersion) throw new PackError("missing-dependency", `requires ${dep.packId} version ${dep.minVersion} or newer`);
    }
    const current = installedList.find((p) => p.packId === manifest.packId) ?? null;
    if (current && current.packVersion >= manifest.packVersion && !opts.allowSameVersion)
      throw new PackError("not-newer", `version ${current.packVersion} is already installed`);

    const bytes = await download(ports, url, manifest, opts);
    throwIfCancelled(opts.signal);
    await ports.files.write(AREA, part, bytes);
    partWritten = true;
    await prepareDatabase(ports, manifest, part, opts.signal);
    // A cancel that arrived while the file was being validated is honoured here, before anything becomes visible as installed.
    throwIfCancelled(opts.signal);

    const finalBytes = await ports.files.read(AREA, part);
    const dbPath = packDbPath(manifest.packId, manifest.packVersion);
    const record: InstalledPack = {
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      path: dbPath,
      sha256: await ports.sha256(finalBytes),
      sizeBytes: finalBytes.length,
      installedAt: (ports.now ?? Date.now)(),
    };
    await commit(ports, manifest, part, record);
    partWritten = false;
    if (current && current.path !== dbPath) await removeFiles(ports, current.path);
    return { ok: true, installed: record, replaced: current };
  } catch (e) {
    if (e instanceof PackError) return { ok: false, code: e.code, message: e.message, issues: e.issues };
    if (opts.signal?.aborted) return { ok: false, code: "cancelled", message: "cancelled" };
    return { ok: false, code: "storage-error", message: e instanceof Error ? e.message : String(e) };
  } finally {
    if (partWritten) await quiet(ports.files.remove(AREA, part));
  }
}

async function verifyManifest(ports: PackPorts, manifest: PackManifest): Promise<void> {
  if (!manifest.signature) throw new PackError("signature-missing", "the manifest is not signed");
  let ok = false;
  try {
    ok = await ports.verifySignature(canonicalManifestBytes(manifest), manifest.signature);
  } catch {
    ok = false;
  }
  if (!ok) throw new PackError("signature-invalid", "the manifest signature does not match the publisher's key");
}

async function download(ports: PackPorts, url: string, manifest: PackManifest, opts: InstallOptions): Promise<Uint8Array> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const sleep = ports.sleep ?? sleepReal;
  let last = "no attempt was made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (opts.signal?.aborted) throw new PackError("cancelled", "cancelled");
    try {
      const res = await ports.http.get(url, { timeoutMs, signal: opts.signal });
      if (res.status === 403 || res.status === 404 || res.status === 410) throw new PackError("download-failed", `HTTP ${res.status}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      if (res.bytes.length !== manifest.file.size) throw new PackError("size-mismatch", `downloaded ${res.bytes.length} bytes, the manifest says ${manifest.file.size}`);
      const hash = await ports.sha256(res.bytes);
      if (hash !== manifest.file.sha256) throw new PackError("checksum-mismatch", "the downloaded file does not match the manifest checksum");
      return res.bytes;
    } catch (e) {
      if (e instanceof PackError) throw e;
      if (opts.signal?.aborted) throw new PackError("cancelled", "cancelled");
      last = e instanceof Error ? e.message : String(e);
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw new PackError("download-failed", `the download failed after ${attempts} attempts: ${last}`);
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PackError("cancelled", "cancelled");
}

/**
 * Opens the downloaded file, brings it to this app's schema, and runs the release validation on it.
 *
 * Ownership: this function opens ONE connection to the staged file, is the only user of it, and closes it exactly once, after
 * every query has finished (all queries are awaited one at a time; nothing runs concurrently on it). Cancellation is checked
 * only between phases, never by closing the connection under a running query. A failure to close is never allowed to hide the
 * error that came first; when validation itself succeeded, a close that fails is an error, because the file is not known to be
 * released and nothing may be installed from a file that is still open.
 */
async function prepareDatabase(ports: PackPorts, manifest: PackManifest, part: string, signal?: AbortSignal): Promise<void> {
  let db: SqlDriver;
  try {
    db = await ports.openDb(part);
  } catch (e) {
    throw new PackError("schema-error", `the file cannot be opened as a database: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    throwIfCancelled(signal);
    let built: number | null | undefined;
    try {
      built = (await db.get<{ v: number | null }>("SELECT MAX(id) AS v FROM schema_migrations"))?.v;
    } catch {
      throw new PackError("schema-error", "the file is not a Tarteel content database");
    }
    if (built !== manifest.schemaVersion) throw new PackError("schema-error", `the database is at schema ${String(built)}, the manifest says ${manifest.schemaVersion}`);
    try {
      await migrate(db, CONTENT_MIGRATIONS.slice(0, ports.appSchemaVersion));
    } catch (e) {
      throw new PackError("schema-error", `migration failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    throwIfCancelled(signal);
    const quick = await db.all<{ quick_check: string }>("PRAGMA quick_check");
    if (quick.length !== 1 || quick[0]?.quick_check !== "ok")
      throw new PackError("validation-failed", "the database file is damaged", [{ severity: "error", code: "database-corrupt", message: "PRAGMA quick_check did not return ok" }]);
    throwIfCancelled(signal);
    const issues = await validateKnowledgeDb(db, { release: true, quran: ports.quran });
    const declared = new Set(manifest.licenses.map((l) => l.id));
    for (const l of await db.all<{ id: string }>("SELECT id FROM license"))
      if (!declared.has(l.id)) issues.push({ severity: "error", code: "licence-not-declared", message: `licence ${l.id} is used by the database but not declared in the manifest` });
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length > 0) throw new PackError("validation-failed", errors.map((i) => `[${i.code}] ${i.message}`).join("; "), issues);
  } catch (e) {
    // Validation failed: release the file, but the validation error is the one worth reporting, so a close error is dropped.
    try {
      await db.close();
    } catch {
      /* intentionally ignored */
    }
    throw e;
  }
  // Validation succeeded: a file that cannot be released is an error, nothing may be installed from a file that is still open.
  try {
    await db.close();
  } catch (e) {
    throw new PackError("storage-error", `the validated file could not be released: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Moves the verified file into place and records it. If recording fails, the new files are removed again. */
async function commit(ports: PackPorts, manifest: PackManifest, part: string, record: InstalledPack): Promise<void> {
  const sidecar = packManifestPath(record.path);
  try {
    await ports.files.move(AREA, part, record.path);
    await ports.files.write(AREA, sidecar, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    await ports.registry.upsert(record);
  } catch (e) {
    const old = await ports.registry.get(record.packId).catch(() => undefined);
    // A same-version repair replaced the file it is rolling back to, so only remove what is not the registered file.
    if (!old || old.path !== record.path) await removeFiles(ports, record.path);
    throw new PackError("commit-failed", `could not record the installed pack: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function removeFiles(ports: PackPorts, dbPath: string): Promise<void> {
  await quiet(ports.files.remove(AREA, dbPath));
  await quiet(ports.files.remove(AREA, packManifestPath(dbPath)));
}

// ----------------------------------------------------------------- uninstall

export type UninstallResult = { ok: true } | { ok: false; code: "not-installed" | "required-by"; message: string };

/** Removes a pack. Refuses while another installed pack requires it. User data (bookmarks, notes) is never touched. */
export async function uninstallPack(ports: PackPorts, packId: string): Promise<UninstallResult> {
  const installed = await ports.registry.list();
  const target = installed.find((p) => p.packId === packId);
  if (!target) return { ok: false, code: "not-installed", message: `${packId} is not installed` };
  const dependents: string[] = [];
  for (const other of installed) {
    if (other.packId === packId) continue;
    const m = await readInstalledManifest(ports, other);
    if (m?.requires.some((d) => d.packId === packId)) dependents.push(other.packId);
  }
  if (dependents.length > 0) return { ok: false, code: "required-by", message: `${dependents.join(", ")} requires ${packId}` };
  await ports.registry.remove(packId);
  await removeFiles(ports, target.path);
  return { ok: true };
}

/** The manifest stored next to an installed pack (licences and attribution can be shown from it offline). */
export async function readInstalledManifest(ports: PackPorts, pack: InstalledPack): Promise<PackManifest | null> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await ports.files.read(AREA, packManifestPath(pack.path)))) as unknown;
    return validatePackManifest(parsed).manifest;
  } catch {
    return null;
  }
}

// -------------------------------------------------------- startup and status

export type PackIntegrity = "ok" | "missing" | "corrupt" | "untrusted";

/**
 * Is this installed pack still signed by a key THIS app trusts? Reads the manifest stored next to the pack, checks that it is
 * the manifest of this very pack and version, and verifies its signature again. A key removed from the app (revocation, or the
 * end of a rotation) makes every pack it signed untrusted, and a sidecar that was edited or replaced fails the same way.
 * Cheap (one signature check): safe to run before a pack is opened.
 */
export async function isPackTrusted(ports: PackPorts, pack: InstalledPack): Promise<boolean> {
  const manifest = await readInstalledManifest(ports, pack);
  if (!manifest?.signature || manifest.packId !== pack.packId || manifest.packVersion !== pack.packVersion) return false;
  return ports.verifySignature(canonicalManifestBytes(manifest), manifest.signature).catch(() => false);
}

/**
 * Checks an installed pack: its file exists, it is still signed by a trusted key, and the file is the one that was installed
 * (size and sha256). `missing`, `corrupt` and `untrusted` packs are offered a repair or update (allowSameVersion).
 */
export async function verifyInstalledPack(ports: PackPorts, pack: InstalledPack): Promise<PackIntegrity> {
  if (!(await ports.files.exists(AREA, pack.path))) return "missing";
  if (!(await isPackTrusted(ports, pack))) return "untrusted";
  const bytes = await ports.files.read(AREA, pack.path);
  return bytes.length === pack.sizeBytes && (await ports.sha256(bytes)) === pack.sha256 ? "ok" : "corrupt";
}

/**
 * Deletes what no registry row refers to: `.part` files of interrupted downloads and files left by a crash between the
 * move and the registry write. Returns the names removed.
 */
export async function sweepPacks(ports: PackPorts): Promise<string[]> {
  const keep = new Set<string>();
  for (const p of await ports.registry.list()) {
    keep.add(p.path.slice(DIR.length + 1));
    keep.add(packManifestPath(p.path).slice(DIR.length + 1));
  }
  let entries: { name: string }[];
  try {
    entries = await ports.files.listWithSize(AREA, DIR);
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const e of entries) {
    if (keep.has(e.name)) continue;
    await quiet(ports.files.remove(AREA, `${DIR}/${e.name}`));
    removed.push(e.name);
  }
  return removed.sort();
}

export type PackStatus = "not-installed" | "installed" | "update-available" | "app-too-old" | "missing-dependency";

/** What to show for an available pack: derived from its manifest and what is installed. */
export function packStatus(available: PackManifest, installed: readonly InstalledPack[], appSchemaVersion: number): PackStatus {
  if (available.schemaVersion > appSchemaVersion) return "app-too-old";
  const have = installed.find((p) => p.packId === available.packId);
  if (have && have.packVersion >= available.packVersion) return "installed";
  const unmet = available.requires.some((d) => {
    const dep = installed.find((p) => p.packId === d.packId);
    return !dep || dep.packVersion < d.minVersion;
  });
  if (unmet) return "missing-dependency";
  return have ? "update-available" : "not-installed";
}

// ------------------------------------------------------------------ registry

const KIND = "knowledge-pack";

/** Keeps installed packs in the `downloads` table of user.db, next to nothing that the Quran data depends on. */
export function createSqlPackRegistry(userDb: SqlDriver): PackRegistry {
  type Row = { id: string; version: string; path: string; checksum: string; size_bytes: number; installed_at: number };
  const toPack = (r: Row): InstalledPack => ({
    packId: r.id.slice("pack:".length),
    packVersion: Number(r.version),
    path: r.path,
    sha256: r.checksum,
    sizeBytes: r.size_bytes,
    installedAt: r.installed_at,
  });
  return {
    list: async () => (await userDb.all<Row>("SELECT id, version, path, checksum, size_bytes, installed_at FROM downloads WHERE kind = ? ORDER BY id", [KIND])).map(toPack),
    get: async (packId) => {
      const r = await userDb.get<Row>("SELECT id, version, path, checksum, size_bytes, installed_at FROM downloads WHERE id = ? AND kind = ?", [`pack:${packId}`, KIND]);
      return r ? toPack(r) : undefined;
    },
    upsert: async (p) => {
      await userDb.run(
        `INSERT INTO downloads (id, kind, version, path, checksum, size_bytes, installed_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET version = excluded.version, path = excluded.path, checksum = excluded.checksum,
           size_bytes = excluded.size_bytes, installed_at = excluded.installed_at`,
        [`pack:${p.packId}`, KIND, String(p.packVersion), p.path, p.sha256, p.sizeBytes, p.installedAt],
      );
    },
    remove: async (packId) => void (await userDb.run("DELETE FROM downloads WHERE id = ? AND kind = ?", [`pack:${packId}`, KIND])),
  };
}
