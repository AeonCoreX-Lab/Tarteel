import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HAFS_6236 } from "@tarteel/quran-data";
import { CONTENT_MIGRATIONS, importQuran, importTranslation, migrate } from "@tarteel/database";
import type { AyahMetaRecord, AyahRecord, SurahRecord } from "@tarteel/types";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { listDatasetDirs, loadAndValidate, printIssues } from "../lib/dataset-loader.ts";

// Builds the read-only content database bundled into the app.
// Usage: npm run build:db [-- --out apps/mobile/assets/db]
const outDir = process.argv.includes("--out") ? (process.argv[process.argv.indexOf("--out") + 1] as string) : "apps/mobile/assets/db";
const dbPath = join(outDir, "quran.db");

// --empty: a schema-only content database with NO Quran text, for development builds that exercise the rest of the app
// (prayer times, alerts, ...). The app shows "Quran data not installed". Release workflows never pass this flag.
const empty = process.argv.includes("--empty");

await mkdir(dirname(dbPath), { recursive: true });
await rm(dbPath, { force: true });
const db = openNodeSqlite(dbPath);
await migrate(db, CONTENT_MIGRATIONS, () => 0); // fixed timestamp => reproducible output
const versions: string[] = [];

if (empty) {
  versions.push("empty");
  console.log("! building a content-less database (no Quran data). Not for release.");
} else {
  const quranDirs = await listDatasetDirs("data/quran");
  if (quranDirs.length !== 1) throw new Error(`Expected exactly one Quran dataset in data/quran, found ${quranDirs.length}`);
  const q = await loadAndValidate(quranDirs[0] as string, HAFS_6236, "quran");
  if (printIssues(q.issues) > 0) throw new Error("Quran dataset failed validation: refusing to build.");
  const surahs = JSON.parse(await readFile(join(q.dir, "surahs.json"), "utf8")) as SurahRecord[];
  let ayahMeta: AyahMetaRecord[] | undefined;
  try { ayahMeta = JSON.parse(await readFile(join(q.dir, "ayah_meta.json"), "utf8")) as AyahMetaRecord[]; } catch { /* optional */ }
  await importQuran(db, { manifest: q.manifest, checksum: q.checksum, ayahs: q.ayahs as AyahRecord[], surahs, ayahMeta }, HAFS_6236);
  versions.push(`${q.manifest.id}@${q.manifest.version}:${q.checksum}`);
}

for (const dir of empty ? [] : await listDatasetDirs("data/translations")) {
  const t = await loadAndValidate(dir, HAFS_6236, "translation");
  if (printIssues(t.issues) > 0) throw new Error(`Translation ${dir} failed validation: refusing to build.`);
  await importTranslation(db, { manifest: t.manifest, checksum: t.checksum, ayahs: t.ayahs as AyahRecord[] }, HAFS_6236);
  versions.push(`${t.manifest.id}@${t.manifest.version}:${t.checksum}`);
  console.log(`+ translation ${t.manifest.id}`);
}
const contentVersion = createHash("sha256").update(versions.sort().join("\n")).digest("hex").slice(0, 16);
await db.run("INSERT OR REPLACE INTO content_meta (key, value) VALUES ('content_version', ?)", [contentVersion]);
await db.run("INSERT OR REPLACE INTO content_meta (key, value) VALUES ('schema_version', ?)", [String(CONTENT_MIGRATIONS.length)]);
await db.exec("INSERT INTO ayahs_fts(ayahs_fts) VALUES('optimize'); INSERT INTO translations_fts(translations_fts) VALUES('optimize'); VACUUM;");
await db.close();

const dbHash = createHash("sha256").update(await readFile(dbPath)).digest("hex");
await writeFile(join(outDir, "content-version.json"), JSON.stringify({ contentVersion, schemaVersion: CONTENT_MIGRATIONS.length, sha256: dbHash, empty, datasets: versions.sort() }, null, 2) + "\n");
console.log(`Built ${dbPath} (content ${contentVersion}, sha256 ${dbHash.slice(0, 12)}…)`);
