import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SOURCE_DIR, SOURCE_FILE, buildAll } from "./build.ts";

// Usage: npm run import:quranenc
// Reads the untouched QuranEnc CSV in data/sources/quranenc/ and (re)writes data/translations/tl-rowwad/ with its manifest and
// sha256 hashes. See docs/data-sources/README.md for where the download comes from.
const root = "data";
const built = buildAll(await readFile(join(root, SOURCE_DIR, SOURCE_FILE), "utf8"));

for (const [rel, content] of built.files) {
  const path = join(root, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`wrote ${path}`);
}
const r = built.report;
console.log(`\n${r.ayahs} ayahs, ${r.withFootnotes} with footnotes. QuranEnc version ${r.version}, last update ${r.updatedAt}.`);
if (r.markerMismatches.length > 0) console.log(`Note: [n] markers and footnote labels differ in ${r.markerMismatches.length} ayahs (kept as published): ${r.markerMismatches.slice(0, 10).join(", ")}`);
console.log("Next: npm run validate:translations && npm run build:db");
