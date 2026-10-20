import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UpstreamConfig } from "./lib.ts";
import { DetachedError, LicenseChangedError, detach, diffAgainstUpstream, readLock, status, sync, verify } from "./lib.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const configs = JSON.parse(readFileSync("upstream.config.json", "utf8")) as Record<string, UpstreamConfig>;
const requested = flag("--name");
const names = requested ? [requested] : Object.keys(configs);
for (const n of names) if (!configs[n]) throw new Error(`Unknown upstream "${n}". Known: ${Object.keys(configs).join(", ")}`);
const name = names[0] as string;
const cfg = configs[name] as UpstreamConfig;
const destRoot = resolve(cfg.destination);

function gitSha(dir: string): string | null {
  if (!existsSync(resolve(dir, ".git"))) return null;
  return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

if (cmd === "verify") {
  let failed = false;
  for (const n of names) {
    const c = configs[n] as UpstreamConfig;
    const problems = verify(resolve(c.destination));
    const detached = readLock(resolve(c.destination))?.detached;
    if (problems.length) {
      failed = true;
      console.error(`✗ ${c.destination}${detached ? "" : " differs from its lock"}:\n` + problems.map((p) => "  - " + p).join("\n"));
    } else console.log(detached ? `✓ ${c.destination} is maintained by Tarteel; upstream licence files and CHANGES.md are in place` : `✓ ${c.destination} matches UPSTREAM.lock.json`);
  }
  if (failed) {
    console.error("Tarteel-maintained Mihrab code may be edited, but its upstream licence files must stay and every change must be noted in CHANGES.md.");
    process.exit(1);
  }
} else if (cmd === "detach") {
  for (const n of names) {
    const c = configs[n] as UpstreamConfig;
    const lock = detach(resolve(c.destination), { reason: flag("--reason") ?? "Tarteel maintains these files itself; no automatic sync from upstream." });
    console.log(`✓ ${c.destination} is Tarteel's own code now (baseline: ${lock.detached?.baselineSha ?? "snapshot"}, since ${lock.detached?.at}). Set "detached": true for it in upstream.config.json.`);
  }
} else if (cmd === "status") {
  for (const n of names) {
    const c = configs[n] as UpstreamConfig;
    const s = status(resolve(c.destination));
    console.log(`${c.destination}: ${s.modified.length} modified, ${s.added.length} added, ${s.deleted.length} deleted since the baseline`);
    for (const [label, list] of [["modified", s.modified], ["added", s.added], ["deleted", s.deleted]] as const) for (const f of list) console.log(`  ${label}: ${f}`);
  }
} else if (cmd === "diff" || cmd === "sync") {
  const from = flag("--from");
  if (!from) throw new Error("--from <path to an upstream checkout> is required");
  const srcRoot = resolve(from);
  if (cmd === "diff") {
    const d = diffAgainstUpstream(cfg, srcRoot, destRoot);
    console.log(JSON.stringify(d, null, 2));
    process.exit(d.added.length || d.removed.length || d.changed.length || d.licenseChanged.length ? 2 : 0);
  }
  try {
    const sha = flag("--sha") ?? gitSha(srcRoot);
    const lock = sync({
      name, cfg, srcRoot, destRoot, sha,
      source: flag("--source") ?? (sha ? `${cfg.repo}@${sha}` : `snapshot:${srcRoot}`),
      acceptLicenseChange: args.includes("--accept-license-change"),
    });
    console.log(`✓ imported ${Object.keys(lock.files).length} files from ${lock.source} (upstream v${lock.upstreamPackageVersion})`);
    console.log("External dependencies the vendored code needs:", JSON.stringify(lock.externalDependencies));
  } catch (e) {
    if (e instanceof LicenseChangedError) {
      console.error("✗ " + e.message);
      process.exit(3);
    }
    if (e instanceof DetachedError) {
      console.error("✗ " + e.message);
      process.exit(4);
    }
    throw e;
  }
} else {
  console.log("usage: upstream.ts verify [--name N] | status [--name N] | diff --from DIR | detach [--name N] [--reason TEXT] | sync --from DIR [--sha SHA] [--accept-license-change] [--name NAME] (sync refuses on detached folders)");
  process.exit(1);
}
