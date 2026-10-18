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

// Source-linked knowledge model (docs/architecture/KNOWLEDGE.md). Every historical statement is a `claim` backed by
// `source_passage` rows; every link between entities is an `edge` that is itself a claim. Rules from the product plan
// are enforced here, not only in the UI:
//  - a quotation may be stored only when the edition's licence permits redistribution;
//  - a claim/edge reaches `published` only with a supporting passage or a written editorial basis, and never while
//    its evidence label is `unverified`;
//  - disputed / "no established report found" claims must carry an uncertainty note.
// Entity kinds and edge types are lookup tables so later phases add rows (not table rebuilds).
const CONTENT_002 = `
CREATE TABLE license (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  name TEXT NOT NULL,
  url TEXT,
  redistribution TEXT NOT NULL CHECK (redistribution IN ('yes','no','pending')),
  non_commercial_only INTEGER NOT NULL DEFAULT 0 CHECK (non_commercial_only IN (0,1)),
  share_alike INTEGER NOT NULL DEFAULT 0 CHECK (share_alike IN (0,1)),
  attribution TEXT NOT NULL,
  terms_note TEXT,
  inventory_ref TEXT
);

CREATE TABLE source_work (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  title TEXT NOT NULL,
  title_arabic TEXT,
  author TEXT,
  original_language TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN ('asbab','tafsir','hadith','history','biography','reference','scholarship','other')),
  subject TEXT
);

CREATE TABLE source_edition (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  work_id TEXT NOT NULL REFERENCES source_work(id),
  edition_label TEXT NOT NULL,
  editor TEXT,
  publisher TEXT,
  published TEXT,
  identifier TEXT,
  url TEXT,
  license_id TEXT NOT NULL REFERENCES license(id),
  transcription_status TEXT NOT NULL DEFAULT 'unverified' CHECK (transcription_status IN ('verified','unverified','ocr_unverified')),
  reviewed_on TEXT
);
CREATE INDEX idx_source_edition_work ON source_edition(work_id);

CREATE TABLE source_passage (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  edition_id TEXT NOT NULL REFERENCES source_edition(id),
  volume TEXT,
  page TEXT,
  chapter TEXT,
  section TEXT,
  report_number TEXT,
  hadith_number TEXT,
  quote TEXT,
  quote_language TEXT,
  CHECK (coalesce(volume, page, chapter, section, report_number, hadith_number) IS NOT NULL),
  CHECK ((quote IS NULL) = (quote_language IS NULL))
);
CREATE INDEX idx_source_passage_edition ON source_passage(edition_id);

CREATE TRIGGER source_passage_quote_ins BEFORE INSERT ON source_passage
WHEN NEW.quote IS NOT NULL AND COALESCE((
  SELECT l.redistribution FROM source_edition e JOIN license l ON l.id = e.license_id WHERE e.id = NEW.edition_id
), 'no') <> 'yes'
BEGIN SELECT RAISE(ABORT, 'quote not allowed: the edition licence does not permit redistribution'); END;

CREATE TRIGGER source_passage_quote_upd BEFORE UPDATE OF quote, edition_id ON source_passage
WHEN NEW.quote IS NOT NULL AND COALESCE((
  SELECT l.redistribution FROM source_edition e JOIN license l ON l.id = e.license_id WHERE e.id = NEW.edition_id
), 'no') <> 'yes'
BEGIN SELECT RAISE(ABORT, 'quote not allowed: the edition licence does not permit redistribution'); END;

CREATE TRIGGER license_withdrawn BEFORE UPDATE OF redistribution ON license
WHEN NEW.redistribution <> 'yes' AND EXISTS (
  SELECT 1 FROM source_passage p JOIN source_edition e ON e.id = p.edition_id
  WHERE e.license_id = NEW.id AND p.quote IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'licence cannot stop permitting redistribution while quotations from its editions are stored'); END;

CREATE TABLE claim (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('direct_textual_report','historical_report','scholarly_interpretation','editorial_synthesis','modern_analysis')),
  evidence_label TEXT NOT NULL DEFAULT 'unverified' CHECK (evidence_label IN ('primary_text','source_reported','scholarly_interpretation','disputed','unverified','no_established_report_found')),
  uncertainty_note TEXT,
  editorial_basis TEXT,
  editorial_status TEXT NOT NULL DEFAULT 'draft' CHECK (editorial_status IN ('draft','ingested','needs_source_verification','needs_scholarly_review','needs_license_review','approved','published','needs_correction','retracted')),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  last_reviewed_at TEXT,
  dataset_version INTEGER NOT NULL CHECK (dataset_version >= 1),
  CHECK (evidence_label NOT IN ('disputed','no_established_report_found') OR uncertainty_note IS NOT NULL)
);

CREATE TABLE claim_text (
  claim_id TEXT NOT NULL REFERENCES claim(id),
  lang TEXT NOT NULL CHECK (length(lang) >= 2),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  translation_status TEXT NOT NULL DEFAULT 'original' CHECK (translation_status IN ('original','machine_draft','reviewed')),
  PRIMARY KEY (claim_id, lang)
) WITHOUT ROWID;

CREATE TABLE claim_passage (
  claim_id TEXT NOT NULL REFERENCES claim(id),
  passage_id TEXT NOT NULL REFERENCES source_passage(id),
  relation TEXT NOT NULL CHECK (relation IN ('supports','contradicts')),
  PRIMARY KEY (claim_id, passage_id)
) WITHOUT ROWID;
CREATE INDEX idx_claim_passage_passage ON claim_passage(passage_id);

CREATE TRIGGER claim_publish_ins BEFORE INSERT ON claim
WHEN NEW.editorial_status = 'published'
BEGIN SELECT RAISE(ABORT, 'insert a claim as draft or approved, link its evidence, then publish it'); END;

CREATE TRIGGER claim_publish_upd BEFORE UPDATE OF editorial_status, evidence_label, editorial_basis ON claim
WHEN NEW.editorial_status = 'published' AND (
  NEW.evidence_label = 'unverified'
  OR (NEW.editorial_basis IS NULL AND NOT EXISTS (
    SELECT 1 FROM claim_passage cp WHERE cp.claim_id = NEW.id AND cp.relation = 'supports'
  ))
)
BEGIN SELECT RAISE(ABORT, 'a published claim needs a supporting passage or an editorial basis, and cannot be unverified'); END;

CREATE VIEW v_published_claims_without_support AS
SELECT c.id FROM claim c
WHERE c.editorial_status = 'published' AND c.editorial_basis IS NULL
  AND NOT EXISTS (SELECT 1 FROM claim_passage cp WHERE cp.claim_id = c.id AND cp.relation = 'supports');

CREATE TABLE entity_kind (id TEXT PRIMARY KEY);
INSERT INTO entity_kind (id) VALUES ('surah'), ('ayah'), ('claim'), ('source_work'), ('source_edition'), ('source_passage');

CREATE TABLE edge_type (
  id TEXT PRIMARY KEY,
  from_kind TEXT NOT NULL REFERENCES entity_kind(id),
  to_kind TEXT NOT NULL REFERENCES entity_kind(id),
  description TEXT NOT NULL
);
INSERT INTO edge_type (id, from_kind, to_kind, description) VALUES
  ('REPORT_REFERENCES_AYAH', 'source_passage', 'ayah', 'A source passage (e.g. an occasion-of-revelation report) refers to this ayah'),
  ('TAFSIR_EXPLAINS_AYAH', 'source_passage', 'ayah', 'A tafsir passage explains this ayah'),
  ('CLAIM_CONCERNS_AYAH', 'claim', 'ayah', 'The claim is about this ayah'),
  ('CLAIM_CONCERNS_SURAH', 'claim', 'surah', 'The claim is about this surah');

CREATE TABLE edge (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  type TEXT NOT NULL REFERENCES edge_type(id),
  from_kind TEXT NOT NULL REFERENCES entity_kind(id),
  from_id TEXT NOT NULL CHECK (length(from_id) > 0),
  to_kind TEXT NOT NULL REFERENCES entity_kind(id),
  to_id TEXT NOT NULL CHECK (length(to_id) > 0),
  editorial_status TEXT NOT NULL DEFAULT 'draft' CHECK (editorial_status IN ('draft','ingested','needs_source_verification','needs_scholarly_review','needs_license_review','approved','published','needs_correction','retracted')),
  uncertainty_note TEXT,
  editorial_basis TEXT,
  created_by TEXT NOT NULL,
  dataset_version INTEGER NOT NULL CHECK (dataset_version >= 1),
  UNIQUE (type, from_kind, from_id, to_kind, to_id)
);
CREATE INDEX idx_edge_from ON edge(from_kind, from_id, type);
CREATE INDEX idx_edge_to ON edge(to_kind, to_id, type);

CREATE TABLE edge_passage (
  edge_id TEXT NOT NULL REFERENCES edge(id),
  passage_id TEXT NOT NULL REFERENCES source_passage(id),
  PRIMARY KEY (edge_id, passage_id)
) WITHOUT ROWID;

CREATE TRIGGER edge_kinds_ins BEFORE INSERT ON edge
WHEN NOT EXISTS (SELECT 1 FROM edge_type t WHERE t.id = NEW.type AND t.from_kind = NEW.from_kind AND t.to_kind = NEW.to_kind)
BEGIN SELECT RAISE(ABORT, 'edge endpoints do not match the edge type'); END;

CREATE TRIGGER edge_kinds_upd BEFORE UPDATE OF type, from_kind, to_kind ON edge
WHEN NOT EXISTS (SELECT 1 FROM edge_type t WHERE t.id = NEW.type AND t.from_kind = NEW.from_kind AND t.to_kind = NEW.to_kind)
BEGIN SELECT RAISE(ABORT, 'edge endpoints do not match the edge type'); END;

CREATE TRIGGER edge_publish_ins BEFORE INSERT ON edge
WHEN NEW.editorial_status = 'published'
BEGIN SELECT RAISE(ABORT, 'insert an edge as draft or approved, link its evidence, then publish it'); END;

CREATE TRIGGER edge_publish_upd BEFORE UPDATE OF editorial_status, editorial_basis ON edge
WHEN NEW.editorial_status = 'published' AND NEW.editorial_basis IS NULL AND NOT EXISTS (
  SELECT 1 FROM edge_passage ep WHERE ep.edge_id = NEW.id
)
BEGIN SELECT RAISE(ABORT, 'a published edge needs a supporting passage or an editorial basis'); END;

CREATE VIEW v_published_edges_without_support AS
SELECT e.id FROM edge e
WHERE e.editorial_status = 'published' AND e.editorial_basis IS NULL
  AND NOT EXISTS (SELECT 1 FROM edge_passage ep WHERE ep.edge_id = e.id);

CREATE TABLE surah_profile (
  surah_id INTEGER PRIMARY KEY REFERENCES surahs(id),
  revelation_order INTEGER CHECK (revelation_order BETWEEN 1 AND 114),
  revelation_order_source TEXT,
  CHECK ((revelation_order IS NULL) = (revelation_order_source IS NULL))
);
CREATE UNIQUE INDEX idx_surah_profile_order ON surah_profile(revelation_order) WHERE revelation_order IS NOT NULL;
`;


/**
 * Content migration 3: events, people and places, with careful dates.
 *
 * One table, `entity`, holds all three kinds (`kind`). Every entity follows the same rules as a claim: it is published only
 * with a supporting passage or an editorial basis, it cannot be published while its evidence label is "unverified", and
 * it needs name text that a person wrote or reviewed. Dates are never more exact than the source: `date_precision` says how
 * exact, `date_calendar` says which calendar the years are in, and `sort_year` is an APPROXIMATE Gregorian year used only to
 * put things in order (see knowledge-dates.ts). For a person, `date_start` is the birth and `date_end` the death. A place has no date.
 * There are no virtual tables here: packs must stay free of them (see KNOWLEDGE.md, "the close crash").
 */
const CONTENT_003 = `
CREATE TABLE entity (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('event','person','place')),
  subtype TEXT,
  evidence_label TEXT NOT NULL DEFAULT 'unverified' CHECK (evidence_label IN ('primary_text','source_reported','scholarly_interpretation','disputed','unverified','no_established_report_found')),
  uncertainty_note TEXT,
  editorial_basis TEXT,
  editorial_status TEXT NOT NULL DEFAULT 'draft' CHECK (editorial_status IN ('draft','ingested','needs_source_verification','needs_scholarly_review','needs_license_review','approved','published','needs_correction','retracted')),
  date_calendar TEXT CHECK (date_calendar IN ('ah','ce')),
  date_start INTEGER CHECK (date_start BETWEEN -5000 AND 3000),
  date_end INTEGER CHECK (date_end BETWEEN -5000 AND 3000),
  date_precision TEXT NOT NULL DEFAULT 'unknown' CHECK (date_precision IN ('year','decade','century','approximate','unknown')),
  sort_year INTEGER CHECK (sort_year BETWEEN -5000 AND 3000),
  dating_note TEXT,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  last_reviewed_at TEXT,
  dataset_version INTEGER NOT NULL CHECK (dataset_version >= 1),
  CHECK (subtype IS NULL
    OR (kind = 'event' AND subtype IN ('revelation','migration','battle','treaty','birth','death','gathering','other'))
    OR (kind = 'person' AND subtype IN ('prophet','companion','family','scholar','ruler','other'))
    OR (kind = 'place' AND subtype IN ('city','region','mountain','building','water','other'))),
  CHECK (evidence_label NOT IN ('disputed','no_established_report_found') OR uncertainty_note IS NOT NULL),
  CHECK ((date_precision = 'unknown') = (date_start IS NULL)),
  CHECK ((date_start IS NULL) = (date_calendar IS NULL) AND (date_start IS NULL) = (sort_year IS NULL)),
  CHECK (date_end IS NULL OR (date_start IS NOT NULL AND date_end >= date_start)),
  CHECK (kind <> 'place' OR date_start IS NULL)
);
CREATE INDEX idx_entity_kind ON entity(kind, sort_year);

CREATE TABLE entity_text (
  entity_id TEXT NOT NULL REFERENCES entity(id),
  lang TEXT NOT NULL CHECK (length(lang) >= 2),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  summary TEXT CHECK (summary IS NULL OR length(trim(summary)) > 0),
  translation_status TEXT NOT NULL DEFAULT 'original' CHECK (translation_status IN ('original','machine_draft','reviewed')),
  PRIMARY KEY (entity_id, lang)
) WITHOUT ROWID;

CREATE TABLE entity_passage (
  entity_id TEXT NOT NULL REFERENCES entity(id),
  passage_id TEXT NOT NULL REFERENCES source_passage(id),
  PRIMARY KEY (entity_id, passage_id)
) WITHOUT ROWID;
CREATE INDEX idx_entity_passage_passage ON entity_passage(passage_id);

CREATE TRIGGER entity_publish_ins BEFORE INSERT ON entity
WHEN NEW.editorial_status = 'published'
BEGIN SELECT RAISE(ABORT, 'insert an entity as draft or approved, link its evidence, then publish it'); END;

CREATE TRIGGER entity_publish_upd BEFORE UPDATE OF editorial_status, evidence_label, editorial_basis ON entity
WHEN NEW.editorial_status = 'published' AND (
  NEW.evidence_label = 'unverified'
  OR (NEW.editorial_basis IS NULL AND NOT EXISTS (SELECT 1 FROM entity_passage ep WHERE ep.entity_id = NEW.id))
)
BEGIN SELECT RAISE(ABORT, 'a published entity needs a supporting passage or an editorial basis, and cannot be unverified'); END;

CREATE VIEW v_published_entities_without_support AS
SELECT e.id FROM entity e
WHERE e.editorial_status = 'published' AND e.editorial_basis IS NULL
  AND NOT EXISTS (SELECT 1 FROM entity_passage ep WHERE ep.entity_id = e.id);

INSERT INTO entity_kind (id) VALUES ('event'), ('person'), ('place');

INSERT INTO edge_type (id, from_kind, to_kind, description) VALUES
  ('EVENT_CONCERNS_AYAH', 'event', 'ayah', 'The event is connected to this ayah'),
  ('EVENT_CONCERNS_SURAH', 'event', 'surah', 'The event is connected to this surah'),
  ('PERSON_MENTIONED_IN_AYAH', 'person', 'ayah', 'The person is mentioned in this ayah'),
  ('PLACE_MENTIONED_IN_AYAH', 'place', 'ayah', 'The place is mentioned in this ayah'),
  ('EVENT_AT_PLACE', 'event', 'place', 'The event took place here'),
  ('PERSON_IN_EVENT', 'person', 'event', 'The person took part in, or is named in connection with, the event'),
  ('CLAIM_CONCERNS_EVENT', 'claim', 'event', 'The claim is about this event'),
  ('CLAIM_CONCERNS_PERSON', 'claim', 'person', 'The claim is about this person'),
  ('CLAIM_CONCERNS_PLACE', 'claim', 'place', 'The claim is about this place');
`;

export const CONTENT_MIGRATIONS: readonly Migration[] = [
  { id: 1, name: "content_core", sql: CONTENT_001 },
  { id: 2, name: "content_knowledge", sql: CONTENT_002 },
  { id: 3, name: "content_entities", sql: CONTENT_003 },
];

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
