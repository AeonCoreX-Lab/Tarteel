import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateKnowledgeDb, validatePackManifest } from "@tarteel/database";
import type { PackManifest } from "@tarteel/database";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { printIssues } from "../lib/dataset-loader.ts";
import { signManifest } from "../lib/pack-tools.ts";
import { buildPackDatabase, makePackManifest } from "./build.ts";
import { loadPackSource } from "./source.ts";

// Usage: npm run build:pack -- [<pack-id> ...] [--out build/packs] [--quran <content.db>] [--base-url <https://.../>] [--root data/knowledge]
//
// Builds every pack in data/knowledge/ (or the named ones) into --out: `<id>.v<version>.db` + `<id>.v<version>.manifest.json`.
// Each pack is built, then checked with the RELEASE validation against the content database; nothing is written to --out unless
// it passes. With TARTEEL_PACK_SIGNING_KEY (an Ed25519 private key in PEM) the manifest is signed and the pack can be installed;
// without it the manifest is unsigned and the run is only a check. With --base-url a `catalog.json` listing the signed packs is written.
// Passes quietly when data/knowledge/ has no packs yet.
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) {
    console.log(`✗ ${name} needs a value.`);
    process.exit(1);
  }
  return v;
};
const out = flag("--out") ?? "build/packs";
const quranArg = flag("--quran");
const baseUrl = flag("--base-url");
const ROOT = flag("--root") ?? "data/knowledge";
const valueIdx = new Set(["--out", "--quran", "--base-url", "--root"].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
const named = args.filter((a, i) => !a.startsWith("--") && !valueIdx.has(i));
if (baseUrl && !baseUrl.startsWith("https://")) {
  console.log("✗ --base-url must start with https://");
  process.exit(1);
}

const dirs: string[] = [];
if (named.length > 0) for (const id of named) dirs.push(join(ROOT, id));
else if (existsSync(ROOT))
  for (const e of (await readdir(ROOT)).sort()) if (!e.startsWith(".") && (await stat(join(ROOT, e))).isDirectory()) dirs.push(join(ROOT, e));
if (dirs.length === 0) {
  console.log(`No knowledge packs in ${ROOT}/ yet. Nothing to build.`);
  process.exit(0);
}

const quranPath = quranArg ?? ["build/db/quran.db", "apps/mobile/assets/db/quran.db"].find((p) => existsSync(p));
if (quranArg && !existsSync(quranArg)) {
  console.log(`✗ ${quranArg}: not found.`);
  process.exit(1);
}
const quran = quranPath ? openNodeSqlite(quranPath, { readOnly: true }) : undefined;
const key = process.env.TARTEEL_PACK_SIGNING_KEY?.replace(/\\n/g, "\n");
if (!key) console.log("! TARTEEL_PACK_SIGNING_KEY is not set: manifests are NOT signed. This run only checks the packs; the apps will not install them.");
if (!quranPath) console.log("! no content database found: surah and ayah references cannot be checked (pass --quran).");

await mkdir(out, { recursive: true });
let failed = false;
const catalog: { manifest: PackManifest; url: string }[] = [];
for (const dir of dirs) {
  console.log(`\n${dir}`);
  const { source, issues } = await loadPackSource(dir);
  if (!source) {
    printIssues(issues);
    failed = true;
    continue;
  }
  const base = `${source.meta.packId}.v${source.meta.packVersion}`;
  const building = join(out, `${base}.db.building`);
  const built = await buildPackDatabase(source, building).catch((e: unknown) => {
    console.log(`  ✗ [build] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  if (!built) {
    await rm(building, { force: true });
    failed = true;
    continue;
  }
  const db = openNodeSqlite(building, { readOnly: true });
  const found = await validateKnowledgeDb(db, { release: true, quran });
  await db.close();
  const c = built.counts;
  console.log(`  ${c.claims} claims, ${c.edges} edges, ${c.passages} passages, ${c.editions} editions, ${c.licenses} licences; left out: ${built.selection.excluded.claims} claims and ${built.selection.excluded.edges} edges that are not published`);
  if (printIssues(found) > 0) {
    await rm(building, { force: true });
    failed = true;
    continue;
  }
  const dbName = `${base}.db`;
  const bytes = new Uint8Array(await readFile(building));
  let manifest = await makePackManifest(source, bytes, dbName, built.selection.licenses);
  if (key) manifest = signManifest(manifest, key);
  const problems = validatePackManifest(manifest).issues;
  if (printIssues(problems) > 0) {
    await rm(building, { force: true });
    failed = true;
    continue;
  }
  await rename(building, join(out, dbName));
  await writeFile(join(out, `${base}.manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ✓ ${dbName} (${bytes.length} bytes, sha256 ${manifest.file.sha256.slice(0, 12)}…)${key ? ", signed" : ", unsigned"}`);
  if (key && baseUrl) catalog.push({ manifest, url: `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${dbName}` });
}
await quran?.close();

if (catalog.length > 0 && !failed) {
  await writeFile(join(out, "catalog.json"), JSON.stringify({ schema: 1, packs: catalog }, null, 2) + "\n");
  console.log(`\ncatalog.json: ${catalog.length} pack(s)`);
}
process.exit(failed ? 1 : 0);
