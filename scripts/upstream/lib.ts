import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";

export interface UpstreamConfig {
  repo: string;
  branch: string;
  license: string;
  licenseFiles: string[];
  destination: string;
  entries: string[];
  /**
   * "closure" (default): entries are TypeScript entry points and everything they import is vendored under `src/`.
   * "files": entries are an explicit list of any files (Kotlin, XML, ...), vendored verbatim under `files/`.
   */
  mode?: "closure" | "files";
}

export interface UpstreamLock {
  name: string;
  mode: "closure" | "files";
  repo: string;
  branch: string;
  /** Commit imported from; null when the source was a snapshot without git metadata. */
  sha: string | null;
  source: string;
  upstreamPackageVersion: string | null;
  license: string;
  importedAt: string;
  entries: string[];
  /** path (relative to upstream root) -> sha256, for every vendored source file */
  files: Record<string, string>;
  /** upstream licence/notice files -> sha256 */
  licenseFiles: Record<string, string>;
  /** non-relative modules the vendored files import -> version range upstream declares */
  externalDependencies: Record<string, string | null>;
}

export class LicenseChangedError extends Error {}

export const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const toPosix = (p: string) => p.split(sep).join("/");
const SRC_DIR = "src";
const FILES_DIR = "files";
const LICENSE_DIR = "UPSTREAM-LICENSES";
const LOCK_FILE = "UPSTREAM.lock.json";

/** Where a vendored upstream file lives inside the destination folder. */
function vendoredPath(destRoot: string, mode: "closure" | "files", f: string): string {
  return mode === "files" ? join(destRoot, FILES_DIR, f) : join(destRoot, SRC_DIR, f.replace(/^src\//, ""));
}

function resolveFiles(root: string, entries: string[]): { files: string[]; external: Record<string, string[]> } {
  for (const f of entries) if (!existsSync(join(root, f))) throw new Error(`Upstream file not found: ${f}`);
  return { files: [...new Set(entries)].sort(), external: {} };
}

function resolveFor(cfg: UpstreamConfig, root: string) {
  return cfg.mode === "files" ? resolveFiles(root, cfg.entries) : resolveClosure(root, cfg.entries);
}

// ------------------------------------------------------------- import closure

const CANDIDATES = ["", ".ts", ".tsx", ".d.ts", ".json", "/index.ts", "/index.tsx"];
const SPECIFIER = /(?:\bfrom|\brequire\(|\bimport\()\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function resolveRelative(root: string, fromFile: string, spec: string): string | null {
  const base = posix.join(posix.dirname(fromFile), spec);
  for (const c of CANDIDATES) {
    const rel = base + c;
    const abs = join(root, rel);
    if (existsSync(abs) && statSync(abs).isFile()) return rel;
  }
  return null;
}

/**
 * Transitive closure of relative imports (type-only imports included, so the vendored
 * tree typechecks). Returns vendored files plus the bare-module specifiers they use.
 */
export function resolveClosure(root: string, entries: string[]): { files: string[]; external: Record<string, string[]> } {
  const seen = new Set<string>();
  const external = new Map<string, Set<string>>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    if (!existsSync(join(root, file))) throw new Error(`Upstream file not found: ${file}`);
    seen.add(file);
    if (file.endsWith(".json")) continue;
    const src = readFileSync(join(root, file), "utf8");
    for (const m of src.matchAll(SPECIFIER)) {
      const spec = (m[1] ?? m[2]) as string;
      if (spec.startsWith(".")) {
        const r = resolveRelative(root, file, spec);
        if (!r) throw new Error(`Unresolved import "${spec}" in ${file}`);
        queue.push(r);
      } else {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : (spec.split("/")[0] as string);
        if (!external.has(pkg)) external.set(pkg, new Set());
        external.get(pkg)?.add(file);
      }
    }
  }
  return {
    files: [...seen].sort(),
    external: Object.fromEntries([...external].sort().map(([k, v]) => [k, [...v].sort()])),
  };
}

// --------------------------------------------------------------------- sync

export interface SyncOptions {
  name: string;
  cfg: UpstreamConfig;
  srcRoot: string;
  destRoot: string;
  sha: string | null;
  source: string;
  now?: () => string;
  acceptLicenseChange?: boolean;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readLock(destRoot: string): UpstreamLock | null {
  return readJson<UpstreamLock>(join(destRoot, LOCK_FILE));
}

function hashLicenseFiles(srcRoot: string, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) if (existsSync(join(srcRoot, n))) out[n] = sha256(readFileSync(join(srcRoot, n)));
  return out;
}

export function sync(opts: SyncOptions): UpstreamLock {
  const { name, cfg, srcRoot, destRoot } = opts;
  const mode = cfg.mode ?? "closure";
  const { files, external } = resolveFor(cfg, srcRoot);
  const licenseFiles = hashLicenseFiles(srcRoot, cfg.licenseFiles);
  if (!licenseFiles["LICENSE"]) throw new Error("Upstream has no LICENSE file: refusing to import.");

  const prev = readLock(destRoot);
  if (prev && !opts.acceptLicenseChange) {
    const changed = Object.keys({ ...prev.licenseFiles, ...licenseFiles }).filter((k) => prev.licenseFiles[k] !== licenseFiles[k]);
    if (changed.length)
      throw new LicenseChangedError(
        `Upstream licence files changed (${changed.join(", ")}). Read them, confirm the terms still allow this use, ` +
          `then re-run with --accept-license-change.`,
      );
  }

  rmSync(join(destRoot, SRC_DIR), { recursive: true, force: true });
  rmSync(join(destRoot, FILES_DIR), { recursive: true, force: true });
  rmSync(join(destRoot, LICENSE_DIR), { recursive: true, force: true });
  const hashes: Record<string, string> = {};
  for (const f of files) {
    const to = vendoredPath(destRoot, mode, f);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(srcRoot, f), to);
    hashes[f] = sha256(readFileSync(to));
  }
  for (const n of Object.keys(licenseFiles)) {
    mkdirSync(join(destRoot, LICENSE_DIR), { recursive: true });
    cpSync(join(srcRoot, n), join(destRoot, LICENSE_DIR, n));
  }

  const upPkg = readJson<{ version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(join(srcRoot, "package.json"));
  const declared = { ...(upPkg?.devDependencies ?? {}), ...(upPkg?.dependencies ?? {}) };
  const lock: UpstreamLock = {
    name,
    mode,
    repo: cfg.repo,
    branch: cfg.branch,
    sha: opts.sha,
    source: opts.source,
    upstreamPackageVersion: upPkg?.version ?? null,
    license: cfg.license,
    importedAt: (opts.now ?? (() => new Date().toISOString()))(),
    entries: [...cfg.entries],
    files: hashes,
    licenseFiles,
    externalDependencies: Object.fromEntries(Object.keys(external).map((k) => [k, declared[k] ?? null])),
  };
  mkdirSync(destRoot, { recursive: true });
  writeFileSync(join(destRoot, LOCK_FILE), JSON.stringify(lock, null, 2) + "\n");
  return lock;
}

// ------------------------------------------------------------------- verify

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Returns a list of problems; empty = the vendored tree is byte-for-byte what the lock says. */
export function verify(destRoot: string): string[] {
  const lock = readLock(destRoot);
  if (!lock) return [`${LOCK_FILE} missing or unreadable in ${destRoot}`];
  const problems: string[] = [];
  const expected = new Set<string>();
  const mode = lock.mode ?? "closure";
  for (const [f, h] of Object.entries(lock.files)) {
    const p = vendoredPath(destRoot, mode, f);
    expected.add(toPosix(relative(destRoot, p)));
    if (!existsSync(p)) problems.push(`missing: ${f}`);
    else if (sha256(readFileSync(p)) !== h) problems.push(`modified: ${f} (vendored files must stay pristine)`);
  }
  for (const [f, h] of Object.entries(lock.licenseFiles)) {
    const p = join(destRoot, LICENSE_DIR, f);
    expected.add(toPosix(relative(destRoot, p)));
    if (!existsSync(p)) problems.push(`missing licence file: ${f}`);
    else if (sha256(readFileSync(p)) !== h) problems.push(`modified licence file: ${f}`);
  }
  for (const p of [...listFiles(join(destRoot, SRC_DIR)), ...listFiles(join(destRoot, FILES_DIR)), ...listFiles(join(destRoot, LICENSE_DIR))]) {
    const rel = toPosix(relative(destRoot, p));
    if (!expected.has(rel)) problems.push(`unexpected file: ${rel}`);
  }
  return problems;
}

// --------------------------------------------------------------------- diff

export interface UpstreamDiff {
  added: string[];
  removed: string[];
  changed: { file: string; linesAdded: number; linesRemoved: number }[];
  licenseChanged: string[];
  externalChanged: Record<string, { from: string | null; to: string | null }>;
}

function lineDelta(a: string, b: string): { linesAdded: number; linesRemoved: number } {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split("\n")) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  let add = 0;
  let rem = 0;
  for (const [l, n] of cb) add += Math.max(0, n - (ca.get(l) ?? 0));
  for (const [l, n] of ca) rem += Math.max(0, n - (cb.get(l) ?? 0));
  return { linesAdded: add, linesRemoved: rem };
}

/** What a sync from srcRoot would change, without writing anything. */
export function diffAgainstUpstream(cfg: UpstreamConfig, srcRoot: string, destRoot: string): UpstreamDiff {
  const lock = readLock(destRoot);
  if (!lock) throw new Error("No lock file: nothing to diff against. Run sync first.");
  const mode = lock.mode ?? "closure";
  const { files, external } = resolveFor(cfg, srcRoot);
  const added = files.filter((f) => !(f in lock.files));
  const removed = Object.keys(lock.files).filter((f) => !files.includes(f));
  const changed: UpstreamDiff["changed"] = [];
  for (const f of files) {
    if (!(f in lock.files)) continue;
    const next = readFileSync(join(srcRoot, f));
    if (sha256(next) === lock.files[f]) continue;
    const old = readFileSync(vendoredPath(destRoot, mode, f), "utf8");
    changed.push({ file: f, ...lineDelta(old, next.toString("utf8")) });
  }
  const lic = hashLicenseFiles(srcRoot, cfg.licenseFiles);
  const licenseChanged = Object.keys({ ...lock.licenseFiles, ...lic }).filter((k) => lock.licenseFiles[k] !== lic[k]);
  const upPkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(join(srcRoot, "package.json"));
  const declared = { ...(upPkg?.devDependencies ?? {}), ...(upPkg?.dependencies ?? {}) };
  const externalChanged: UpstreamDiff["externalChanged"] = {};
  for (const k of new Set([...Object.keys(lock.externalDependencies), ...Object.keys(external)])) {
    const from = lock.externalDependencies[k] ?? null;
    const to = k in external ? (declared[k] ?? null) : null;
    if (from !== to) externalChanged[k] = { from, to };
  }
  return { added, removed, changed, licenseChanged, externalChanged };
}

export const paths = { SRC_DIR, FILES_DIR, LICENSE_DIR, LOCK_FILE };
