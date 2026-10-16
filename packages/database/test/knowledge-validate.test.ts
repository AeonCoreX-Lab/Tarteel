import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlDriver } from "@tarteel/storage";
import type { Issue } from "@tarteel/quran-data";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { CONTENT_MIGRATIONS, knowledgeCounts, migrate, validateKnowledgeDb } from "../src/index.ts";

// ALL text below is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

/** A database with the Quran rows (2 surahs, 3 ayahs) and a small, fully valid knowledge graph. */
async function valid(): Promise<SqlDriver> {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count)
      VALUES (1, 'a', 'One', 'First', 'makkah', 2), (2, 'b', 'Two', 'Second', 'madinah', 1);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y'), (3, 2, 1, 'z', 'z');
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open licence', 'yes', 'Synthetic attribution');
    INSERT INTO source_work (id, title, original_language, work_type) VALUES ('work-1', 'Synthetic Work', 'ar', 'tafsir');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-open', 'work-1', 'Open edition', 'lic-open');
    INSERT INTO source_passage (id, edition_id, page, quote, quote_language) VALUES ('p1', 'ed-open', '10', 'synthetic quote', 'en');
    INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version)
      VALUES ('c1', 'historical_report', 'source_reported', 'approved', 't', 1);
    INSERT INTO claim_text (claim_id, lang, text, translation_status) VALUES ('c1', 'en', 'Synthetic claim', 'original'), ('c1', 'bn', 'Synthetic bn', 'reviewed');
    INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES ('c1', 'p1', 'supports');
    UPDATE claim SET editorial_status = 'published' WHERE id = 'c1';
    INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version)
      VALUES ('e1', 'CLAIM_CONCERNS_AYAH', 'claim', 'c1', 'ayah', '1:2', 't', 1), ('e2', 'CLAIM_CONCERNS_SURAH', 'claim', 'c1', 'surah', '2', 't', 1);
    INSERT INTO edge_passage (edge_id, passage_id) VALUES ('e1', 'p1'), ('e2', 'p1');
    UPDATE edge SET editorial_status = 'published';
  `);
  return db;
}

const codes = (issues: Issue[], severity?: Issue["severity"]) => issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

test("a valid knowledge graph has no issues, in either mode", async () => {
  const db = await valid();
  assert.deepEqual(await validateKnowledgeDb(db), []);
  assert.deepEqual(await validateKnowledgeDb(db, { release: true }), []);
  assert.deepEqual(await knowledgeCounts(db), { claims: 1, publishedClaims: 1, edges: 2, publishedEdges: 2, editions: 1, passages: 1 });
});

test("an empty knowledge schema is valid, and an old v1 database is reported as missing the schema", async () => {
  const empty = openNodeSqlite();
  await migrate(empty, CONTENT_MIGRATIONS);
  assert.deepEqual(await validateKnowledgeDb(empty, { release: true }), []);
  const old = openNodeSqlite();
  await migrate(old, CONTENT_MIGRATIONS.slice(0, 1));
  const issues = await validateKnowledgeDb(old);
  assert.deepEqual(codes(issues), ["schema-missing"]);
  assert.match(issues[0]?.message ?? "", /claim/);
  assert.equal((await knowledgeCounts(old)).claims, 0);
});

test("published evidence removed after publication is reported (claim and edge)", async () => {
  const db = await valid();
  await db.run("DELETE FROM claim_passage WHERE claim_id = 'c1'");
  await db.run("DELETE FROM edge_passage WHERE edge_id = 'e1'");
  const issues = await validateKnowledgeDb(db);
  assert.deepEqual(codes(issues, "error").sort(), ["published-claim-unsupported", "published-edge-unsupported"]);
  assert.match(issues.find((i) => i.code === "published-edge-unsupported")?.message ?? "", /e1/);
});

test("defence in depth: a database built without the migration triggers is still caught", async () => {
  const db = await valid();
  await db.exec("DROP TRIGGER claim_publish_upd; DROP TRIGGER license_withdrawn;");
  await db.run("UPDATE claim SET evidence_label = 'unverified' WHERE id = 'c1'");
  await db.run("UPDATE license SET redistribution = 'no' WHERE id = 'lic-open'"); // a quote from it is still stored
  const found = codes(await validateKnowledgeDb(db), "error");
  assert.ok(found.includes("published-claim-unverified"));
  assert.ok(found.includes("quote-without-licence"));
});

test("a published claim needs original or reviewed text; machine drafts only warn", async () => {
  const db = await valid();
  await db.run("UPDATE claim_text SET translation_status = 'machine_draft' WHERE lang = 'bn'");
  let issues = await validateKnowledgeDb(db);
  assert.deepEqual(codes(issues), ["published-machine-translation"]);
  assert.equal(issues[0]?.severity, "warning");
  assert.match(issues[0]?.message ?? "", /c1 \(bn\)/);
  await db.run("UPDATE claim_text SET translation_status = 'machine_draft'");
  issues = await validateKnowledgeDb(db);
  assert.ok(codes(issues, "error").includes("published-claim-no-reviewed-text"));
  await db.run("DELETE FROM claim_text");
  assert.ok(codes(await validateKnowledgeDb(db), "error").includes("published-claim-no-reviewed-text"));
});

test("a pending licence is a warning while working and an error for a release", async () => {
  const db = await valid();
  await db.exec(`
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-pending', 'Synthetic pending licence', 'pending', 'n/a');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-pending', 'work-1', 'Pending edition', 'lic-pending');
  `);
  const work = await validateKnowledgeDb(db);
  assert.deepEqual(codes(work), ["licence-pending"]);
  assert.equal(work[0]?.severity, "warning");
  const rel = await validateKnowledgeDb(db, { release: true });
  assert.deepEqual(codes(rel, "error"), ["licence-pending"]);
});

test("a published edge may not end at a claim that is not published", async () => {
  const db = await valid();
  await db.exec(`
    INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version)
      VALUES ('c-draft', 'historical_report', 'source_reported', 'draft', 't', 1);
    INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_basis, created_by, dataset_version)
      VALUES ('e3', 'CLAIM_CONCERNS_SURAH', 'claim', 'c-draft', 'surah', '1', 'synthetic basis', 't', 1);
    UPDATE edge SET editorial_status = 'published' WHERE id = 'e3';
  `);
  const issues = await validateKnowledgeDb(db);
  assert.deepEqual(codes(issues), ["edge-to-unpublished-claim"]);
  assert.match(issues[0]?.message ?? "", /e3/);
});

test("edges must end at things that exist: claims, passages, surahs and ayahs", async () => {
  const db = await valid();
  await db.exec(`
    INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES
      ('x1', 'CLAIM_CONCERNS_AYAH', 'claim', 'c1', 'ayah', '1:9', 't', 1),
      ('x2', 'CLAIM_CONCERNS_SURAH', 'claim', 'c1', 'surah', '77', 't', 1),
      ('x3', 'CLAIM_CONCERNS_SURAH', 'claim', 'no-such-claim', 'surah', '1', 't', 1),
      ('x4', 'REPORT_REFERENCES_AYAH', 'source_passage', 'no-such-passage', 'ayah', '1:1', 't', 1);
  `);
  const issues = await validateKnowledgeDb(db);
  assert.deepEqual(codes(issues), ["edge-endpoint-missing", "edge-endpoint-missing", "edge-endpoint-missing"]);
  const text = issues.map((i) => i.message).join("\n");
  for (const id of ["x1", "x2", "x3", "x4"]) assert.match(text, new RegExp(id));
});

test("a pack without Quran rows is checked against the content database it is given", async () => {
  const content = await valid();
  const pack = openNodeSqlite();
  await migrate(pack, CONTENT_MIGRATIONS);
  await pack.exec(`
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open licence', 'yes', 'a');
    INSERT INTO source_work (id, title, original_language, work_type) VALUES ('work-1', 'Synthetic Work', 'ar', 'tafsir');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-open', 'work-1', 'Open edition', 'lic-open');
    INSERT INTO source_passage (id, edition_id, page) VALUES ('p1', 'ed-open', '10');
    INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version)
      VALUES ('e1', 'REPORT_REFERENCES_AYAH', 'source_passage', 'p1', 'ayah', '1:2', 't', 1);
  `);
  const alone = await validateKnowledgeDb(pack);
  assert.deepEqual(codes(alone), ["quran-unverifiable"]);
  assert.equal(alone[0]?.severity, "warning");
  assert.deepEqual(codes(await validateKnowledgeDb(pack, { release: true }), "error"), ["quran-unverifiable"]);
  assert.deepEqual(await validateKnowledgeDb(pack, { release: true, quran: content }), []);
  await pack.run("UPDATE edge SET to_id = '1:99' WHERE id = 'e1'");
  assert.deepEqual(codes(await validateKnowledgeDb(pack, { quran: content })), ["edge-endpoint-missing"]);
  // a Quran database that cannot be read is an error, not a silent pass
  const broken = openNodeSqlite();
  assert.deepEqual(codes(await validateKnowledgeDb(pack, { quran: broken })), ["quran-unreadable"]);
});

test("dangling references are found even though foreign keys are off", async () => {
  const db = await valid();
  await db.exec("PRAGMA foreign_keys = OFF;");
  await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES ('c1', 'no-such-passage', 'contradicts')");
  const issues = await validateKnowledgeDb(db);
  assert.deepEqual(codes(issues), ["foreign-key"]);
  assert.match(issues[0]?.message ?? "", /claim_passage/);
});

test("long lists are shortened in the message", async () => {
  const db = await valid();
  await db.exec("DROP TRIGGER claim_publish_ins;");
  for (let i = 0; i < 14; i++)
    await db.run("INSERT INTO claim (id, claim_type, evidence_label, editorial_status, editorial_basis, created_by, dataset_version) VALUES (?, 'historical_report', 'unverified', 'published', 'b', 't', 1)", [`u${String(i).padStart(2, "0")}`]);
  const issue = (await validateKnowledgeDb(db)).find((i) => i.code === "published-claim-unverified");
  assert.match(issue?.message ?? "", /and 4 more/);
});
