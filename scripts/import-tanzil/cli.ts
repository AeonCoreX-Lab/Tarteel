import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SOURCE_DIR, SOURCE_FILES, buildAll } from "./build.ts";

// Usage: npm run import:tanzil
// Reads the four untouched Tanzil downloads in data/sources/tanzil/ and (re)writes data/quran/tanzil-uthmani/ and
// data/translations/{bn-muhiuddin-khan,en-saheeh-international}/ with manifests and sha256 hashes.
// See docs/data-sources/README.md for where the downloads come from.
const root = "data";
const read = (name: string): Promise<string> => readFile(join(root, SOURCE_DIR, name), "utf8");

const built = buildAll({
  quran: await read(SOURCE_FILES.quran),
  metadata: await read(SOURCE_FILES.metadata),
  bn: await read(SOURCE_FILES.bn),
  en: await read(SOURCE_FILES.en),
});

for (const [rel, content] of built.files) {
  const path = join(root, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  console.log(`wrote ${path}`);
}
console.log(`\n${built.report.ayahs} ayahs. Bismillah prefix removed from ayah 1 of ${built.report.stripped.length} surahs (extra-shadda variant in ${built.report.variants.join(", ")}).`);
console.log("Next: npm run validate:quran && npm run validate:translations && npm run build:db");
