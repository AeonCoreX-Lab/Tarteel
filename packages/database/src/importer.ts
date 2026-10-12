import type { SqlDriver, SqlValue } from "@tarteel/storage";
import type { AyahMetaRecord, AyahRecord, DatasetManifest, SurahRecord } from "@tarteel/types";
import { normalizeArabicForSearch, normalizeTranslationForSearch } from "@tarteel/search";
import { validateAyahs, validateManifest } from "@tarteel/quran-data";
import type { NumberingConvention } from "@tarteel/quran-data";

export class ImportError extends Error {}

export interface QuranImport {
  manifest: DatasetManifest;
  /** Combined checksum of the dataset files (computed by the caller). */
  checksum: string;
  ayahs: AyahRecord[];
  surahs: SurahRecord[];
  ayahMeta?: AyahMetaRecord[];
}

export interface TranslationImport {
  manifest: DatasetManifest;
  checksum: string;
  ayahs: AyahRecord[];
}

function assertValid(manifest: DatasetManifest, ayahs: unknown, convention: NumberingConvention, kind: string): void {
  const problems = [
    ...validateManifest(manifest, manifest?.id ?? "manifest"),
    ...validateAyahs(ayahs, convention, manifest?.id).issues,
  ].filter((i) => i.severity === "error");
  if (problems.length) throw new ImportError(`${kind} failed validation:\n` + problems.slice(0, 10).map((p) => ` - ${p.code}: ${p.message}`).join("\n"));
  if (manifest.numberingConvention !== convention.id)
    throw new ImportError(`${manifest.id}: numbering "${manifest.numberingConvention}" != expected "${convention.id}"`);
}

async function insertDataset(db: SqlDriver, m: DatasetManifest, checksum: string): Promise<void> {
  await db.run(
    `INSERT OR REPLACE INTO datasets
     (id, kind, language, language_name, direction, translator, version, source_name, source_url,
      license_name, license_url, copyright, attribution, numbering, checksum, imported_at, validation_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [m.id, m.kind, m.language, m.languageName, m.direction, m.translator ?? null, m.version, m.source.name, m.source.url,
     m.license.name, m.license.url ?? null, m.copyright, m.attribution, m.numberingConvention, checksum, m.importedAt, "validated"],
  );
}

/** Multi-row INSERT in chunks (SQLite's default variable limit is 999). */
async function bulkInsert(db: SqlDriver, table: string, cols: string[], rows: SqlValue[][], chunk = 100): Promise<void> {
  const one = `(${cols.map(() => "?").join(",")})`;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await db.run(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${part.map(() => one).join(",")}`, part.flat());
  }
}

export async function importQuran(db: SqlDriver, data: QuranImport, convention: NumberingConvention): Promise<void> {
  const { manifest, ayahs, surahs, ayahMeta = [] } = data;
  if (manifest.kind !== "quran") throw new ImportError("manifest.kind must be 'quran'");
  assertValid(manifest, ayahs, convention, "Quran dataset");
  if (surahs.length !== convention.ayahCounts.length) throw new ImportError(`surahs.json must list ${convention.ayahCounts.length} surahs`);
  surahs.forEach((s, i) => {
    if (s.id !== i + 1 || !s.name_ar || !s.name_translit || !s.name_en) throw new ImportError(`surahs.json entry ${i + 1} is invalid`);
  });
  const meta = new Map(ayahMeta.map((m) => [`${m.surah}:${m.ayah}`, m]));

  await db.transaction(async () => {
    await db.exec("DELETE FROM ayahs; DELETE FROM surahs; DELETE FROM datasets WHERE kind = 'quran';");
    await insertDataset(db, manifest, data.checksum);
    await bulkInsert(db, "surahs",
      ["id", "name_arabic", "name_transliteration", "name_english", "revelation_place", "ayah_count"],
      surahs.map((s) => [s.id, s.name_ar, s.name_translit, s.name_en, s.revelation, convention.ayahCounts[s.id - 1] as number]));
    await bulkInsert(db, "ayahs",
      ["id", "surah_id", "ayah_number", "text_arabic", "text_search", "juz", "hizb_quarter", "page", "sajdah"],
      ayahs.map((a, i) => {
        const m = meta.get(`${a.surah}:${a.ayah}`);
        return [i + 1, a.surah, a.ayah, a.text, normalizeArabicForSearch(a.text),
          m?.juz ?? null, m?.hizb_quarter ?? null, m?.page ?? null, m?.sajdah ?? null];
      }), 80);
    await db.exec("INSERT INTO ayahs_fts(ayahs_fts) VALUES('rebuild')");
    await db.run("INSERT OR REPLACE INTO content_meta (key, value) VALUES ('quran_dataset', ?)", [`${manifest.id}@${manifest.version}`]);
  });
}

export async function importTranslation(db: SqlDriver, data: TranslationImport, convention: NumberingConvention): Promise<void> {
  const { manifest, ayahs } = data;
  if (manifest.kind !== "translation") throw new ImportError("manifest.kind must be 'translation'");
  if (!manifest.redistributionPermitted) throw new ImportError(`${manifest.id}: redistribution not permitted`);
  assertValid(manifest, ayahs, convention, "Translation dataset");
  await db.transaction(async () => {
    await uninstallTranslationInner(db, manifest.id);
    await insertDataset(db, manifest, data.checksum);
    await bulkInsert(db, "translation_ayahs",
      ["dataset_id", "surah_id", "ayah_number", "text", "text_search"],
      ayahs.map((a) => [manifest.id, a.surah, a.ayah, a.text, normalizeTranslationForSearch(a.text)]), 120);
  });
}

async function uninstallTranslationInner(db: SqlDriver, id: string): Promise<void> {
  await db.run("DELETE FROM translation_ayahs WHERE dataset_id = ?", [id]); // trigger keeps FTS in sync
  await db.run("DELETE FROM datasets WHERE id = ? AND kind = 'translation'", [id]);
}

export function uninstallTranslation(db: SqlDriver, id: string): Promise<void> {
  return db.transaction(() => uninstallTranslationInner(db, id));
}
