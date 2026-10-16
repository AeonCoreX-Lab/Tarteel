import type { Issue } from "@tarteel/quran-data";
import { canonicalManifestBytes, packStatus, readInstalledManifest, installPack, uninstallPack, sweepPacks, validatePackManifest, verifyInstalledPack } from "./packs.ts";
import type { InstallOptions, InstallResult, InstalledPack, PackIntegrity, PackManifest, PackPorts, PackStatus, UninstallResult } from "./packs.ts";

/**
 * What the Library screen needs, as plain data and plain functions: read the catalogue of available packs, merge it with
 * what is installed, install / repair / remove one pack at a time, and check installed packs at startup. The network is
 * touched ONLY by `refreshCatalog` and `install`, which the person starts. Pure TypeScript on top of `PackPorts`.
 */

// ------------------------------------------------------------------- catalogue

export interface CatalogEntry {
  manifest: PackManifest;
  /** Where the database file is downloaded from (https). */
  url: string;
}

export const MAX_CATALOG_BYTES = 1024 * 1024;

/**
 * Reads `catalog.json` (written by `npm run build:pack -- --base-url ...`): `{ schema: 1, packs: [{ manifest, url }] }`.
 * An entry that is malformed, unsigned or not served over https is dropped with a warning, so one bad entry never hides the
 * rest. When a pack appears twice only the newest version is kept. A catalogue with an unknown `schema` is refused whole.
 */
export function parsePackCatalog(raw: unknown): { entries: CatalogEntry[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const entries = new Map<string, CatalogEntry>();
  const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!rec(raw) || raw.schema !== 1 || !Array.isArray(raw.packs)) {
    issues.push({ severity: "error", code: "catalog-invalid", message: "the catalogue is not in a format this app understands (expected schema 1)" });
    return { entries: [], issues };
  }
  raw.packs.forEach((item, i) => {
    const warn = (message: string): void => void issues.push({ severity: "warning", code: "catalog-entry-ignored", message: `packs[${i}]: ${message}` });
    if (!rec(item)) return warn("not an object");
    const { manifest, issues: problems } = validatePackManifest(item.manifest);
    if (!manifest) return warn(problems.map((p) => p.message).join("; "));
    if (!manifest.signature) return warn("the manifest is not signed");
    if (typeof item.url !== "string" || !item.url.startsWith("https://")) return warn("the download address must start with https://");
    const have = entries.get(manifest.packId);
    if (!have || have.manifest.packVersion < manifest.packVersion) entries.set(manifest.packId, { manifest, url: item.url });
  });
  return { entries: [...entries.values()].sort((a, b) => a.manifest.packId.localeCompare(b.manifest.packId)), issues };
}

export type CatalogResult =
  | { ok: true; entries: CatalogEntry[]; ignored: number }
  | { ok: false; code: "insecure-url" | "download-failed" | "catalog-invalid" | "cancelled"; message: string };

// --------------------------------------------------------------------- library

export interface LibraryRow {
  packId: string;
  /** The newest manifest known: the catalogue's when it offers the pack, otherwise the installed one. Null when neither could be read. */
  manifest: PackManifest | null;
  installed: InstalledPack | null;
  /** The catalogue's entry for this pack, whatever its version: what a repair re-downloads. Null when the catalogue is not loaded or does not list it. */
  listed: CatalogEntry | null;
  /** What can be installed or updated: present when the catalogue offers a version that is newer than the installed one (or none is installed). */
  offer: CatalogEntry | null;
  /** `not-listed`: installed, but the catalogue does not offer it (not loaded yet, or withdrawn). */
  status: PackStatus | "not-listed";
}

export interface StartupReport {
  /** Leftover files from an interrupted install, now deleted. */
  swept: string[];
  /** Installed packs whose file is missing or does not match what was installed. Offer a repair; nothing is downloaded automatically. */
  damaged: { pack: InstalledPack; integrity: Exclude<PackIntegrity, "ok"> }[];
}

export interface PackLibrary {
  /** Cleans up after an interrupted install and checks every installed pack. Offline. */
  startup(): Promise<StartupReport>;
  /** The merged view of installed packs and the last catalogue. Offline. */
  rows(): Promise<LibraryRow[]>;
  /** Downloads and checks the catalogue. The only network call besides `install`. */
  refreshCatalog(signal?: AbortSignal): Promise<CatalogResult>;
  install(entry: CatalogEntry, opts?: InstallOptions): Promise<InstallResult>;
  remove(packId: string): Promise<UninstallResult>;
}

/** The merge behind `rows()`, exported so it can be tested and reused without a library instance. */
export function mergeLibrary(
  catalog: readonly CatalogEntry[] | null,
  installed: readonly { pack: InstalledPack; manifest: PackManifest | null }[],
  appSchemaVersion: number,
): LibraryRow[] {
  const rows = new Map<string, LibraryRow>();
  for (const { pack, manifest } of installed) rows.set(pack.packId, { packId: pack.packId, manifest, installed: pack, listed: null, offer: null, status: "not-listed" });
  const installedPacks = installed.map((i) => i.pack);
  for (const entry of catalog ?? []) {
    const status = packStatus(entry.manifest, installedPacks, appSchemaVersion);
    const have = rows.get(entry.manifest.packId);
    rows.set(entry.manifest.packId, {
      packId: entry.manifest.packId,
      manifest: entry.manifest,
      installed: have?.installed ?? null,
      listed: entry,
      offer: status === "not-installed" || status === "update-available" ? entry : null,
      status,
    });
  }
  return [...rows.values()].sort((a, b) => a.packId.localeCompare(b.packId));
}

export function createPackLibrary(ports: PackPorts, opts: { catalogUrl: string; catalogTimeoutMs?: number }): PackLibrary {
  let catalog: CatalogEntry[] | null = null;
  // Installing, repairing and removing change the same files and the same registry, so they run one at a time.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  const readInstalled = async (): Promise<{ pack: InstalledPack; manifest: PackManifest | null }[]> => {
    const out: { pack: InstalledPack; manifest: PackManifest | null }[] = [];
    for (const pack of await ports.registry.list()) out.push({ pack, manifest: await readInstalledManifest(ports, pack).catch(() => null) });
    return out;
  };

  return {
    startup: () =>
      serial(async () => {
        const swept = await sweepPacks(ports);
        const damaged: StartupReport["damaged"] = [];
        for (const pack of await ports.registry.list()) {
          const integrity = await verifyInstalledPack(ports, pack).catch((): PackIntegrity => "corrupt");
          if (integrity !== "ok") damaged.push({ pack, integrity });
        }
        return { swept, damaged };
      }),

    rows: async () => mergeLibrary(catalog, await readInstalled(), ports.appSchemaVersion),

    async refreshCatalog(signal) {
      if (!opts.catalogUrl.startsWith("https://")) return { ok: false, code: "insecure-url", message: "the catalogue address must start with https://" };
      let res: { status: number; bytes: Uint8Array };
      try {
        res = await ports.http.get(opts.catalogUrl, { timeoutMs: opts.catalogTimeoutMs ?? 15_000, ...(signal ? { signal } : {}) });
      } catch (e) {
        if (signal?.aborted) return { ok: false, code: "cancelled", message: "cancelled" };
        return { ok: false, code: "download-failed", message: e instanceof Error ? e.message : String(e) };
      }
      if (res.status !== 200) return { ok: false, code: "download-failed", message: `the catalogue server answered ${res.status}` };
      if (res.bytes.length > MAX_CATALOG_BYTES) return { ok: false, code: "catalog-invalid", message: "the catalogue is too large" };
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(res.bytes));
      } catch {
        return { ok: false, code: "catalog-invalid", message: "the catalogue is not valid JSON" };
      }
      const parsed = parsePackCatalog(raw);
      if (parsed.issues.some((i) => i.severity === "error")) return { ok: false, code: "catalog-invalid", message: parsed.issues.map((i) => i.message).join("; ") };
      // A pack whose signature does not verify is never offered. installPack checks again before anything is installed.
      const verified: CatalogEntry[] = [];
      for (const entry of parsed.entries) {
        const ok = await ports.verifySignature(canonicalManifestBytes(entry.manifest), entry.manifest.signature ?? "").catch(() => false);
        if (ok) verified.push(entry);
      }
      catalog = verified;
      return { ok: true, entries: verified, ignored: parsed.issues.length + (parsed.entries.length - verified.length) };
    },

    install: (entry, o) => serial(() => installPack(ports, entry.manifest, entry.url, o)),
    remove: (packId) => serial(() => uninstallPack(ports, packId)),
  };
}
