import type { SqlDriver } from "@tarteel/storage";
import type {
  AyahRef, AyahWithTranslation, Bookmark, HistoryEntry, Note, SearchHit, Surah, TranslationMeta,
} from "@tarteel/types";
import { buildFtsQuery } from "@tarteel/search";

const AYAH_COLS = `a.surah_id AS surahId, a.ayah_number AS ayahNumber, a.text_arabic AS textArabic,
  a.juz AS juz, a.hizb_quarter AS hizbQuarter, a.page AS page, a.sajdah AS sajdah`;

// ------------------------------------------------------------------ Quran

export class QuranRepository {
  private db: SqlDriver;
  constructor(db: SqlDriver) {
    this.db = db;
  }

  getSurahs(): Promise<Surah[]> {
    return this.db.all<Surah>(
      `SELECT id, name_arabic AS nameArabic, name_transliteration AS nameTransliteration,
              name_english AS nameEnglish, revelation_place AS revelationPlace, ayah_count AS ayahCount
       FROM surahs ORDER BY id`,
    );
  }

  async getSurah(id: number): Promise<Surah | undefined> {
    return (await this.getSurahs()).find((s) => s.id === id);
  }

  /** Ayahs of a surah, optionally joined with one translation dataset. */
  getSurahAyahs(surahId: number, translationId: string | null = null): Promise<AyahWithTranslation[]> {
    return this.db.all<AyahWithTranslation>(
      `SELECT ${AYAH_COLS}, t.text AS translation
       FROM ayahs a
       LEFT JOIN translation_ayahs t
         ON t.dataset_id = ? AND t.surah_id = a.surah_id AND t.ayah_number = a.ayah_number
       WHERE a.surah_id = ? ORDER BY a.ayah_number`,
      [translationId, surahId],
    );
  }

  getAyah(ref: AyahRef, translationId: string | null = null): Promise<AyahWithTranslation | undefined> {
    return this.db.get<AyahWithTranslation>(
      `SELECT ${AYAH_COLS}, t.text AS translation
       FROM ayahs a
       LEFT JOIN translation_ayahs t
         ON t.dataset_id = ? AND t.surah_id = a.surah_id AND t.ayah_number = a.ayah_number
       WHERE a.surah_id = ? AND a.ayah_number = ?`,
      [translationId, ref.surahId, ref.ayahNumber],
    );
  }

  getJuzAyahs(juz: number, translationId: string | null = null): Promise<AyahWithTranslation[]> {
    return this.byColumn("a.juz", juz, translationId);
  }
  getPageAyahs(page: number, translationId: string | null = null): Promise<AyahWithTranslation[]> {
    return this.byColumn("a.page", page, translationId);
  }
  private byColumn(col: string, value: number, translationId: string | null) {
    return this.db.all<AyahWithTranslation>(
      `SELECT ${AYAH_COLS}, t.text AS translation FROM ayahs a
       LEFT JOIN translation_ayahs t
         ON t.dataset_id = ? AND t.surah_id = a.surah_id AND t.ayah_number = a.ayah_number
       WHERE ${col} = ? ORDER BY a.id`,
      [translationId, value],
    );
  }

  /** First ayah of each juz (for Juz navigation). Empty if the dataset has no juz metadata. */
  getJuzStarts(): Promise<{ juz: number; surahId: number; ayahNumber: number }[]> {
    return this.db.all(
      `SELECT a.juz AS juz, a.surah_id AS surahId, a.ayah_number AS ayahNumber
       FROM ayahs a JOIN (SELECT juz, MIN(id) AS mid FROM ayahs WHERE juz IS NOT NULL GROUP BY juz) m ON a.id = m.mid
       ORDER BY a.juz`,
    );
  }

  getSajdahAyahs(): Promise<AyahWithTranslation[]> {
    return this.db.all<AyahWithTranslation>(
      `SELECT ${AYAH_COLS}, NULL AS translation FROM ayahs a WHERE a.sajdah IS NOT NULL ORDER BY a.id`,
    );
  }
}

// ----------------------------------------------------------- Translations

export class TranslationRepository {
  private db: SqlDriver;
  constructor(db: SqlDriver) {
    this.db = db;
  }
  listInstalled(): Promise<TranslationMeta[]> {
    return this.db.all<TranslationMeta>(
      `SELECT id, language, language_name AS languageName, direction, translator, version,
              source_name AS sourceName, source_url AS sourceUrl, license_name AS licenseName,
              copyright, attribution
       FROM datasets WHERE kind = 'translation' ORDER BY language, translator`,
    );
  }
  get(id: string): Promise<TranslationMeta | undefined> {
    return this.db.get<TranslationMeta>(
      `SELECT id, language, language_name AS languageName, direction, translator, version,
              source_name AS sourceName, source_url AS sourceUrl, license_name AS licenseName,
              copyright, attribution
       FROM datasets WHERE kind = 'translation' AND id = ?`,
      [id],
    );
  }
}

// ----------------------------------------------------------------- Search

export class SearchRepository {
  private db: SqlDriver;
  constructor(db: SqlDriver) {
    this.db = db;
  }

  async searchArabic(query: string, limit = 50, offset = 0): Promise<SearchHit[]> {
    const q = buildFtsQuery(query, { arabic: true });
    if (!q) return [];
    return this.db.all<SearchHit>(
      `SELECT a.surah_id AS surahId, a.ayah_number AS ayahNumber,
              highlight(ayahs_fts, 0, '[', ']') AS highlighted
       FROM ayahs_fts JOIN ayahs a ON a.id = ayahs_fts.rowid
       WHERE ayahs_fts MATCH ? ORDER BY a.id LIMIT ? OFFSET ?`,
      [q, limit, offset],
    );
  }

  async searchTranslation(datasetId: string, query: string, limit = 50, offset = 0): Promise<SearchHit[]> {
    const q = buildFtsQuery(query);
    if (!q) return [];
    return this.db.all<SearchHit>(
      `SELECT t.surah_id AS surahId, t.ayah_number AS ayahNumber,
              highlight(translations_fts, 0, '[', ']') AS highlighted
       FROM translations_fts JOIN translation_ayahs t ON t.id = translations_fts.rowid
       WHERE translations_fts MATCH ? AND t.dataset_id = ?
       ORDER BY t.surah_id, t.ayah_number LIMIT ? OFFSET ?`,
      [q, datasetId, limit, offset],
    );
  }
}

// -------------------------------------------------------------- User data

type Clock = () => number;

export class BookmarkRepository {
  private db: SqlDriver;
  private now: Clock;
  constructor(db: SqlDriver, now: Clock = Date.now) {
    this.db = db;
    this.now = now;
  }
  async add(ref: AyahRef, note: string | null = null): Promise<void> {
    await this.db.run(
      `INSERT INTO bookmarks (surah_id, ayah_number, note, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (surah_id, ayah_number) DO UPDATE SET note = COALESCE(excluded.note, note)`,
      [ref.surahId, ref.ayahNumber, note, this.now()],
    );
  }
  async remove(ref: AyahRef): Promise<boolean> {
    const r = await this.db.run("DELETE FROM bookmarks WHERE surah_id = ? AND ayah_number = ?", [ref.surahId, ref.ayahNumber]);
    return r.changes > 0;
  }
  async isBookmarked(ref: AyahRef): Promise<boolean> {
    return !!(await this.db.get("SELECT 1 AS x FROM bookmarks WHERE surah_id = ? AND ayah_number = ?", [ref.surahId, ref.ayahNumber]));
  }
  list(limit = 100, offset = 0): Promise<Bookmark[]> {
    return this.db.all<Bookmark>(
      `SELECT id, surah_id AS surahId, ayah_number AS ayahNumber, note, created_at AS createdAt
       FROM bookmarks ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }
  /** Bookmarked ayah numbers within one surah, for cheap rendering in the reader. */
  async listForSurah(surahId: number): Promise<Set<number>> {
    const rows = await this.db.all<{ n: number }>("SELECT ayah_number AS n FROM bookmarks WHERE surah_id = ?", [surahId]);
    return new Set(rows.map((r) => r.n));
  }
}

export class NoteRepository {
  private db: SqlDriver;
  private now: Clock;
  constructor(db: SqlDriver, now: Clock = Date.now) {
    this.db = db;
    this.now = now;
  }
  async create(ref: AyahRef, body: string): Promise<number> {
    const t = this.now();
    const r = await this.db.run(
      "INSERT INTO notes (surah_id, ayah_number, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [ref.surahId, ref.ayahNumber, body, t, t],
    );
    return r.lastInsertRowId;
  }
  async update(id: number, body: string): Promise<boolean> {
    return (await this.db.run("UPDATE notes SET body = ?, updated_at = ? WHERE id = ?", [body, this.now(), id])).changes > 0;
  }
  async delete(id: number): Promise<boolean> {
    return (await this.db.run("DELETE FROM notes WHERE id = ?", [id])).changes > 0;
  }
  listForAyah(ref: AyahRef): Promise<Note[]> {
    return this.db.all<Note>(
      `SELECT id, surah_id AS surahId, ayah_number AS ayahNumber, body, created_at AS createdAt, updated_at AS updatedAt
       FROM notes WHERE surah_id = ? AND ayah_number = ? ORDER BY created_at`,
      [ref.surahId, ref.ayahNumber],
    );
  }
  listAll(limit = 100, offset = 0): Promise<Note[]> {
    return this.db.all<Note>(
      `SELECT id, surah_id AS surahId, ayah_number AS ayahNumber, body, created_at AS createdAt, updated_at AS updatedAt
       FROM notes ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }
}

export class HistoryRepository {
  private db: SqlDriver;
  private now: Clock;
  constructor(db: SqlDriver, now: Clock = Date.now) {
    this.db = db;
    this.now = now;
  }
  /** Records a read; skips duplicates of the same ayah within dedupeMs. */
  async record(ref: AyahRef, dedupeMs = 30_000): Promise<boolean> {
    const t = this.now();
    const last = await this.db.get<{ surah_id: number; ayah_number: number; read_at: number }>(
      "SELECT surah_id, ayah_number, read_at FROM reading_history ORDER BY id DESC LIMIT 1",
    );
    if (last && last.surah_id === ref.surahId && last.ayah_number === ref.ayahNumber && t - last.read_at < dedupeMs) return false;
    await this.db.run("INSERT INTO reading_history (surah_id, ayah_number, read_at) VALUES (?, ?, ?)", [ref.surahId, ref.ayahNumber, t]);
    return true;
  }
  list(limit = 100, offset = 0): Promise<HistoryEntry[]> {
    return this.db.all<HistoryEntry>(
      `SELECT id, surah_id AS surahId, ayah_number AS ayahNumber, read_at AS readAt
       FROM reading_history ORDER BY id DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }
  /** Keep only the most recent N entries. */
  async prune(keepLatest: number): Promise<number> {
    return (await this.db.run(
      "DELETE FROM reading_history WHERE id NOT IN (SELECT id FROM reading_history ORDER BY id DESC LIMIT ?)",
      [keepLatest],
    )).changes;
  }
  async clear(): Promise<void> {
    await this.db.run("DELETE FROM reading_history");
  }
}

export interface Repositories {
  quran: QuranRepository;
  translations: TranslationRepository;
  search: SearchRepository;
  bookmarks: BookmarkRepository;
  notes: NoteRepository;
  history: HistoryRepository;
}

export function createRepositories(content: SqlDriver, user: SqlDriver, now: Clock = Date.now): Repositories {
  return {
    quran: new QuranRepository(content),
    translations: new TranslationRepository(content),
    search: new SearchRepository(content),
    bookmarks: new BookmarkRepository(user, now),
    notes: new NoteRepository(user, now),
    history: new HistoryRepository(user, now),
  };
}
