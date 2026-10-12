import type { SqlDriver } from "@tarteel/storage";
import { FTS_TOKENCHARS } from "@tarteel/search";

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export class MigrationError extends Error {}

/**
 * Applies pending migrations in order, each inside a transaction.
 * - Never drops or rewrites user data on its own.
 * - Refuses to run if the database is NEWER than this app (downgrade protection).
 * - Refuses to run if an already-applied migration was edited (name mismatch).
 */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[],
  now: () => number = Date.now,
): Promise<{ applied: number[]; current: number }> {
  migrations.forEach((m, i) => {
    if (m.id !== i + 1) throw new MigrationError(`Migrations must be contiguous from 1; got id ${m.id} at position ${i + 1}`);
  });
  await driver.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const rows = await driver.all<{ id: number; name: string }>("SELECT id, name FROM schema_migrations ORDER BY id");
  const latestKnown = migrations.length;
  const latestApplied = rows.length ? (rows[rows.length - 1] as { id: number }).id : 0;
  if (latestApplied > latestKnown)
    throw new MigrationError(`Database schema v${latestApplied} is newer than this app supports (v${latestKnown}). Update the app.`);
  for (const r of rows) {
    const known = migrations[r.id - 1];
    if (!known || known.name !== r.name)
      throw new MigrationError(`Applied migration ${r.id} "${r.name}" does not match this app's migration list.`);
  }
  const applied: number[] = [];
  for (const m of migrations.slice(latestApplied)) {
    await driver.transaction(async () => {
      await driver.exec(m.sql);
      await driver.run("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)", [m.id, m.name, now()]);
    });
    applied.push(m.id);
  }
  return { applied, current: Math.max(latestApplied, latestKnown) };
}

// ---------------------------------------------------------------- CONTENT DB
// Read-mostly database shipped with the app (Quran + bundled translations + FTS).
// Rebuilt by scripts/build-database and replaced on content updates.
// Never holds user data.

const CONTENT_001 = `
CREATE TABLE content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE datasets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('quran','translation')),
  language TEXT NOT NULL,
  language_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ltr','rtl')),
  translator TEXT,
  version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license_name TEXT NOT NULL,
  license_url TEXT,
  copyright TEXT NOT NULL,
  attribution TEXT NOT NULL,
  numbering TEXT NOT NULL,
  checksum TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  validation_status TEXT NOT NULL
);

CREATE TABLE surahs (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 114),
  name_arabic TEXT NOT NULL,
  name_transliteration TEXT NOT NULL,
  name_english TEXT NOT NULL,
  revelation_place TEXT NOT NULL CHECK (revelation_place IN ('makkah','madinah')),
  ayah_count INTEGER NOT NULL
);

CREATE TABLE ayahs (
  id INTEGER PRIMARY KEY,
  surah_id INTEGER NOT NULL REFERENCES surahs(id),
  ayah_number INTEGER NOT NULL,
  text_arabic TEXT NOT NULL,
  text_search TEXT NOT NULL,
  juz INTEGER,
  hizb_quarter INTEGER,
  page INTEGER,
  sajdah TEXT CHECK (sajdah IN ('recommended','obligatory')),
  UNIQUE (surah_id, ayah_number)
);
CREATE INDEX idx_ayahs_juz ON ayahs(juz);
CREATE INDEX idx_ayahs_page ON ayahs(page);
CREATE INDEX idx_ayahs_hizb ON ayahs(hizb_quarter);
CREATE INDEX idx_ayahs_sajdah ON ayahs(sajdah) WHERE sajdah IS NOT NULL;

CREATE TABLE translation_ayahs (
  id INTEGER PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  surah_id INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_search TEXT NOT NULL,
  UNIQUE (dataset_id, surah_id, ayah_number)
);

CREATE VIRTUAL TABLE ayahs_fts USING fts5(
  text_search, content='ayahs', content_rowid='id',
  tokenize="unicode61 remove_diacritics 0 tokenchars '${FTS_TOKENCHARS}'"
);
CREATE VIRTUAL TABLE translations_fts USING fts5(
  text_search, content='translation_ayahs', content_rowid='id',
  tokenize="unicode61 remove_diacritics 0 tokenchars '${FTS_TOKENCHARS}'"
);

CREATE TRIGGER translation_ayahs_ai AFTER INSERT ON translation_ayahs BEGIN
  INSERT INTO translations_fts(rowid, text_search) VALUES (new.id, new.text_search);
END;
CREATE TRIGGER translation_ayahs_ad AFTER DELETE ON translation_ayahs BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, text_search) VALUES ('delete', old.id, old.text_search);
END;
`;

export const CONTENT_MIGRATIONS: readonly Migration[] = [{ id: 1, name: "content_core", sql: CONTENT_001 }];

// ------------------------------------------------------------------- USER DB
// Private, local-only. Migrations here must ALWAYS preserve data.

const USER_001 = `
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surah_id INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (surah_id, ayah_number)
);
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surah_id INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_ayah ON notes(surah_id, ayah_number);

CREATE TABLE reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surah_id INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  read_at INTEGER NOT NULL
);
CREATE INDEX idx_history_read_at ON reading_history(read_at DESC);

CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  installed_at INTEGER NOT NULL
);
`;

export const USER_MIGRATIONS: readonly Migration[] = [{ id: 1, name: "user_core", sql: USER_001 }];
