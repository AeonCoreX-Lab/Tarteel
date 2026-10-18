import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlDriver } from "@tarteel/storage";
import type { Issue } from "@tarteel/quran-data";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { CONTENT_MIGRATIONS, approxCeYear, formatDate, migrate, sortYearFor, validateKnowledgeDb } from "../src/index.ts";
import type { DateWords } from "../src/index.ts";

// ALL names, dates and text below are synthetic placeholders. No real history belongs in tests.

async function fresh(): Promise<SqlDriver> {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open licence', 'yes', 'Synthetic attribution');
    INSERT INTO source_work (id, title, original_language, work_type) VALUES ('work-1', 'Synthetic Work', 'ar', 'history');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-open', 'work-1', 'Open edition', 'lic-open');
    INSERT INTO source_passage (id, edition_id, page) VALUES ('p1', 'ed-open', '10');
  `);
  return db;
}

const entity = (db: SqlDriver, id: string, over: Record<string, unknown> = {}) => {
  const r = { kind: "event", subtype: null, evidence_label: "source_reported", uncertainty_note: null, editorial_basis: null, editorial_status: "draft", date_calendar: "ah", date_start: 2, date_end: null, date_precision: "year", sort_year: 623, ...over };
  return db.run(
    `INSERT INTO entity (id, kind, subtype, evidence_label, uncertainty_note, editorial_basis, editorial_status, date_calendar, date_start, date_end, date_precision, sort_year, created_by, dataset_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tester', 1)`,
    [id, r.kind, r.subtype, r.evidence_label, r.uncertainty_note, r.editorial_basis, r.editorial_status, r.date_calendar, r.date_start, r.date_end, r.date_precision, r.sort_year],
  );
};
const publish = (db: SqlDriver, id: string) => db.run("UPDATE entity SET editorial_status = 'published' WHERE id = ?", [id]);
const codes = (issues: Issue[], severity?: Issue["severity"]) => issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

test("an entity is published only with evidence, a label other than unverified, and never inserted as published", async () => {
  const db = await fresh();
  await assert.rejects(entity(db, "ev-direct", { editorial_status: "published" }), /insert an entity as draft or approved/);
  await entity(db, "ev-1", { editorial_status: "approved" });
  await assert.rejects(publish(db, "ev-1"), /needs a supporting passage or an editorial basis/);
  await db.run("INSERT INTO entity_passage (entity_id, passage_id) VALUES ('ev-1', 'p1')");
  await publish(db, "ev-1");
  await entity(db, "ev-2", { editorial_status: "approved", evidence_label: "unverified", editorial_basis: "Synthetic basis" });
  await assert.rejects(publish(db, "ev-2"), /cannot be unverified/);
  await entity(db, "ev-3", { editorial_status: "approved", editorial_basis: "Synthetic basis" });
  await publish(db, "ev-3");
});

test("dates: precision, calendar, years and the sort year go together, and a place has no date", async () => {
  const db = await fresh();
  await assert.rejects(entity(db, "x1", { date_precision: "unknown" }), /CHECK/, "unknown precision with a year");
  await assert.rejects(entity(db, "x2", { date_start: null, date_calendar: null, sort_year: null, date_precision: "year" }), /CHECK/, "a precision with no year");
  await assert.rejects(entity(db, "x3", { date_calendar: null }), /CHECK/, "a year with no calendar");
  await assert.rejects(entity(db, "x4", { sort_year: null }), /CHECK/, "a year with no sort year");
  await assert.rejects(entity(db, "x5", { date_end: 1 }), /CHECK/, "an end before the start");
  await assert.rejects(entity(db, "x6", { date_precision: "day" }), /CHECK/);
  await assert.rejects(entity(db, "x7", { date_calendar: "julian" }), /CHECK/);
  await assert.rejects(entity(db, "x8", { kind: "place", subtype: "city" }), /CHECK/, "a place with a date");
  await entity(db, "undated", { date_calendar: null, date_start: null, sort_year: null, date_precision: "unknown" });
  await entity(db, "place-1", { kind: "place", subtype: "city", date_calendar: null, date_start: null, sort_year: null, date_precision: "unknown" });
  await entity(db, "span", { date_end: 5 });
});

test("subtypes belong to their kind, and a disputed entity needs a note", async () => {
  const db = await fresh();
  await assert.rejects(entity(db, "s1", { kind: "event", subtype: "city" }), /CHECK/);
  await assert.rejects(entity(db, "s2", { kind: "person", subtype: "battle", date_calendar: null, date_start: null, sort_year: null, date_precision: "unknown" }), /CHECK/);
  await entity(db, "s3", { kind: "person", subtype: "companion" });
  await assert.rejects(entity(db, "s4", { evidence_label: "disputed" }), /CHECK/);
  await entity(db, "s5", { evidence_label: "disputed", uncertainty_note: "Sources differ" });
});

test("new edge types connect the right kinds, and the old ones still work", async () => {
  const db = await fresh();
  await entity(db, "ev-1"); await entity(db, "per-1", { kind: "person" }); await entity(db, "pl-1", { kind: "place", date_calendar: null, date_start: null, sort_year: null, date_precision: "unknown" });
  const edge = (id: string, type: string, fk: string, f: string, tk: string, t: string) =>
    db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, 't', 1)", [id, type, fk, f, tk, t]);
  await edge("a", "EVENT_AT_PLACE", "event", "ev-1", "place", "pl-1");
  await edge("b", "PERSON_IN_EVENT", "person", "per-1", "event", "ev-1");
  await edge("c", "EVENT_CONCERNS_AYAH", "event", "ev-1", "ayah", "1:1");
  await edge("d", "PERSON_MENTIONED_IN_AYAH", "person", "per-1", "ayah", "1:2");
  await assert.rejects(edge("e", "EVENT_AT_PLACE", "person", "per-1", "place", "pl-1"), /do not match the edge type/);
  await assert.rejects(edge("f", "PERSON_IN_EVENT", "event", "ev-1", "event", "ev-1"), /do not match the edge type/);
  await edge("g", "CLAIM_CONCERNS_AYAH", "claim", "c-none", "ayah", "1:1");
});

test("the validator finds entity problems, and is silent about a database older than migration 3", async () => {
  const db = await fresh();
  await entity(db, "ev-ok", { editorial_status: "approved" });
  await db.run("INSERT INTO entity_passage (entity_id, passage_id) VALUES ('ev-ok', 'p1')");
  await db.run("INSERT INTO entity_text (entity_id, lang, name) VALUES ('ev-ok', 'en', 'Synthetic event')");
  await publish(db, "ev-ok");
  assert.deepEqual(await validateKnowledgeDb(db, { release: true }), []);

  await db.run("DELETE FROM entity_passage WHERE entity_id = 'ev-ok'");
  assert.ok(codes(await validateKnowledgeDb(db)).includes("published-entity-unsupported"));
  await db.run("INSERT INTO entity_passage (entity_id, passage_id) VALUES ('ev-ok', 'p1')");

  await db.run("UPDATE entity_text SET translation_status = 'machine_draft'");
  const issues = await validateKnowledgeDb(db);
  assert.ok(codes(issues, "error").includes("published-entity-no-reviewed-text"));
  assert.ok(codes(issues, "warning").includes("published-entity-machine-translation"));
  await db.run("UPDATE entity_text SET translation_status = 'original'");

  await entity(db, "ev-draft");
  await db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_status, created_by, dataset_version, editorial_basis) VALUES ('e-pub', 'EVENT_CONCERNS_AYAH', 'event', 'ev-draft', 'ayah', '1:1', 'approved', 't', 1, 'basis')");
  await db.run("UPDATE edge SET editorial_status = 'published' WHERE id = 'e-pub'");
  assert.ok(codes(await validateKnowledgeDb(db)).includes("edge-to-unpublished-entity"));
  await db.run("DELETE FROM edge WHERE id = 'e-pub'");

  // An edge that names an event that is really a person, and one that names nothing.
  await entity(db, "per-1", { kind: "person" });
  await db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES ('e-wrong', 'EVENT_CONCERNS_AYAH', 'event', 'per-1', 'ayah', '1:1', 't', 1), ('e-none', 'EVENT_CONCERNS_AYAH', 'event', 'nothing', 'ayah', '1:1', 't', 1)");
  const missing = (await validateKnowledgeDb(db)).find((i) => i.code === "edge-endpoint-missing");
  assert.match(missing?.message ?? "", /e-none/);
  assert.match(missing?.message ?? "", /e-wrong/);

  // A pack built before migration 3: no entity tables, and the validator does not ask for them.
  const old = openNodeSqlite();
  await migrate(old, CONTENT_MIGRATIONS.slice(0, 2));
  assert.deepEqual(await validateKnowledgeDb(old, { release: true }), []);
});

test("migration 3 on a database that already holds claims leaves them alone", async () => {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS.slice(0, 2));
  await db.exec(`INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version) VALUES ('c1', 'historical_report', 'source_reported', 'draft', 't', 1)`);
  assert.deepEqual((await migrate(db, CONTENT_MIGRATIONS)).applied, [3]);
  assert.equal((await db.all("SELECT id FROM claim")).length, 1);
  assert.equal((await db.all("SELECT id FROM entity")).length, 0);
});

// ------------------------------------------------------------------- dates

const words: DateWords = {
  era: (c) => (c === "ah" ? "AH" : "CE"), circa: "c.", unknown: "Date unknown",
  decade: (y) => `${y}s`, century: (n) => `${n}th century`,
};

test("approxCeYear and sortYearFor", () => {
  assert.equal(approxCeYear("ce", 610), 610);
  assert.equal(approxCeYear("ah", 1), 623, "year 1 began in July 622 and is mostly 623");
  assert.equal(approxCeYear("ah", 11), 632);
  assert.equal(approxCeYear("ah", 100), 719);
  assert.equal(sortYearFor("ah", 2, "year"), 624);
  assert.equal(sortYearFor(null, null, "unknown"), null);
  assert.equal(sortYearFor("ah", 2, "unknown"), null);
});

test("formatDate is as exact as the source and no more", () => {
  const d = (calendar: "ah" | "ce" | null, start: number | null, end: number | null, precision: "year" | "decade" | "century" | "approximate" | "unknown") => ({ calendar, start, end, precision });
  assert.equal(formatDate(d("ah", 1, null, "year"), words), "1 AH");
  assert.equal(formatDate(d("ah", 1, 3, "year"), words), "1–3 AH");
  assert.equal(formatDate(d("ah", 3, 3, "year"), words), "3 AH");
  assert.equal(formatDate(d("ce", 625, null, "decade"), words), "620s CE");
  assert.equal(formatDate(d("ce", 601, null, "century"), words), "7th century CE");
  assert.equal(formatDate(d("ce", 700, null, "century"), words), "7th century CE");
  assert.equal(formatDate(d("ce", 701, null, "century"), words), "8th century CE");
  assert.equal(formatDate(d("ce", 610, null, "approximate"), words), "c. 610 CE");
  assert.equal(formatDate(d("ce", 610, 612, "approximate"), words), "c. 610–612 CE");
  assert.equal(formatDate(d(null, null, null, "unknown"), words), "Date unknown");
  assert.equal(formatDate(d("ah", 5, null, "unknown"), words), "Date unknown", "a precision of unknown wins over a year");
});
