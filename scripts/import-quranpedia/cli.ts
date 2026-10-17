import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { PACK_ID, convertBook, sameContent } from "./convert.ts";
import type { BookDump, QuranpediaManifest } from "./convert.ts";

// Usage: npm run import:quranpedia [-- --in data/knowledge/_incoming/quranpedia] [--out data/knowledge]
// Reads the untouched Quranpedia download (manifest.json + asbab-book-2919.json.gz), checks the file against the manifest's
// sha256, and (re)writes data/knowledge/asbab-wahidi/. Then: npm run build:pack -- asbab-wahidi (see data/knowledge/README.md).
const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  const v = i >= 0 ? args[i + 1] : undefined;
  if (i >= 0 && (v === undefined || v.startsWith("--"))) {
    console.log(`✗ ${name} needs a value.`);
    process.exit(1);
  }
  return v ?? fallback;
};
const inDir = opt("--in", "data/knowledge/_incoming/quranpedia");
const outRoot = opt("--out", "data/knowledge");
const SOURCE = "asbab-book-2919.json.gz";

try {
  const manifest = JSON.parse(await readFile(join(inDir, "manifest.json"), "utf8")) as QuranpediaManifest;
  const bytes = await readFile(join(inDir, SOURCE));
  const dump = JSON.parse(gunzipSync(bytes).toString("utf8")) as BookDump;
  const input = { manifest, sourceName: SOURCE, sourceSha256: createHash("sha256").update(bytes).digest("hex"), dump };
  const dir = join(outRoot, PACK_ID);

  // The pack version only goes up when the passages or links really changed; an identical import leaves the pack alone, so a
  // released version is never silently different from what is in git.
  const previous = await readFile(join(dir, "pack.json"), "utf8").then((t) => JSON.parse(t) as { packVersion?: number }, () => null);
  let converted = convertBook({ ...input, packVersion: previous?.packVersion ?? 1 });
  if (previous?.packVersion !== undefined) {
    const old = new Map<string, string>();
    for (const name of ["sources.json", "edges.json"]) old.set(name, await readFile(join(dir, name), "utf8").catch(() => ""));
    if (sameContent(old, converted.files)) {
      console.log(`Unchanged: ${converted.report.passages} passages and ${converted.report.edges} links are the same as pack version ${previous.packVersion}. Nothing written.`);
      process.exit(0);
    }
    converted = convertBook({ ...input, packVersion: previous.packVersion + 1 });
  }
  const { files, report } = converted;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [name, content] of files) {
    await writeFile(join(dir, name), content);
    console.log(`wrote ${join(dir, name)}`);
  }
  console.log(`\n${report.rows} rows -> ${report.passages} passages, ${report.edges} ayah links, ${report.surahs} surahs (dump ${report.dumpVersion}).`);
  for (const w of report.disagreements) console.log(`! ${w.code}: ${w.message}`);
  console.log("Next: add the INVENTORY row if missing, then npm run build:pack -- " + PACK_ID + " --quran <content.db>");
} catch (e) {
  console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
