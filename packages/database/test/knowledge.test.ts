import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { CONTENT_MIGRATIONS, migrate } from "../src/index.ts";

// ALL text below is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

async function fresh(): Promise<SqlDriver> {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count)
      VALUES (1, 'a', 'One', 'First', 'makkah', 2), (2, 'b', 'Two', 'Second', 'madinah', 3);
    INSERT INTO license (id, name, redistribution, attribution) VALUES
      ('lic-open', 'Synthetic open licence', 'yes', 'Synthetic attribution'),
      ('lic-closed', 'Synthetic closed licence', 'no', 'n/a'),
      ('lic-pending', 'Synthetic pending licence', 'pending', 'n/a');
    INSERT INTO source_work (id, title, original_language, work_type) VALUES ('work-1', 'Synthetic Work', 'ar', 'tafsir');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES
      ('ed-open', 'work-1', 'Open edition', 'lic-open'),
      ('ed-closed', 'work-1', 'Closed edition', 'lic-closed'),
      ('ed-pending', 'work-1', 'Pending edition', 'lic-pending');
    INSERT INTO source_passage (id, edition_id, page) VALUES ('p-open', 'ed-open', '10'), ('p-closed', 'ed-closed', '20');
  `);
  return db;
}

const addClaim = (db: SqlDriver, id: string, over: Record<string, string | number | null> = {}) => {
  const row = { claim_type: "historical_report", evidence_label: "source_reported", uncertainty_note: null, editorial_basis: null, editorial_status: "draft", ...over };
  return db.run(
    "INSERT INTO claim (id, claim_type, evidence_label, uncertainty_note, editorial_basis, editorial_status, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, 'tester', 1)",
    [id, row.claim_type, row.evidence_label, row.uncertainty_note, row.editorial_basis, row.editorial_status],
  );
};
const publish = (db: SqlDriver, id: string) => db.run("UPDATE claim SET editorial_status = 'published' WHERE id = ?", [id]);

test("migration 2 applies on top of an existing v1 content database without touching its data", async () => {
  assert.deepEqual(CONTENT_MIGRATIONS.map((m) => m.id), [1, 2]);
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS.slice(0, 1));
  await db.exec("INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2)");
  assert.deepEqual((await migrate(db, CONTENT_MIGRATIONS)).applied, [2]);
  assert.deepEqual((await migrate(db, CONTENT_MIGRATIONS)).applied, []);
  assert.equal((await db.all("SELECT id FROM surahs")).length, 1);
  assert.equal((await db.all("SELECT * FROM v_published_claims_without_support")).length, 0);
});

test("source passages need a locator; quote and its language go together", async () => {
  const db = await fresh();
  await assert.rejects(db.run("INSERT INTO source_passage (id, edition_id) VALUES ('p-x', 'ed-open')"), /CHECK/);
  await assert.rejects(db.run("INSERT INTO source_passage (id, edition_id, page, quote) VALUES ('p-x', 'ed-open', '1', 'q')"), /CHECK/);
  await db.run("INSERT INTO source_passage (id, edition_id, hadith_number) VALUES ('p-ok', 'ed-open', '12a')");
});

test("a quotation is stored only when the edition's licence permits redistribution", async () => {
  const db = await fresh();
  const ins = (id: string, edition: string) =>
    db.run("INSERT INTO source_passage (id, edition_id, page, quote, quote_language) VALUES (?, ?, '1', 'synthetic quote', 'en')", [id, edition]);
  await ins("q-open", "ed-open");
  await assert.rejects(ins("q-closed", "ed-closed"), /does not permit redistribution/);
  await assert.rejects(ins("q-pending", "ed-pending"), /does not permit redistribution/);
  // a locator-only passage is fine under any licence
  assert.equal((await db.all("SELECT id FROM source_passage WHERE id = 'p-closed'")).length, 1);
  // updating a passage cannot sneak a quote in either
  await assert.rejects(db.run("UPDATE source_passage SET quote = 'x', quote_language = 'en' WHERE id = 'p-closed'"), /does not permit redistribution/);
  await assert.rejects(db.run("UPDATE source_passage SET edition_id = 'ed-closed' WHERE id = 'q-open'"), /does not permit redistribution/);
  // and a licence cannot be withdrawn while quotes from it are stored
  await assert.rejects(db.run("UPDATE license SET redistribution = 'pending' WHERE id = 'lic-open'"), /stop permitting redistribution/);
  await db.run("DELETE FROM source_passage WHERE id = 'q-open'");
  await db.run("UPDATE license SET redistribution = 'pending' WHERE id = 'lic-open'");
});

test("a claim is published only with a supporting passage or an editorial basis, never while unverified", async () => {
  const db = await fresh();
  await assert.rejects(addClaim(db, "c-direct", { editorial_status: "published" }), /then publish it/);

  await addClaim(db, "c1");
  await assert.rejects(publish(db, "c1"), /supporting passage or an editorial basis/);
  await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES ('c1', 'p-open', 'contradicts')");
  await assert.rejects(publish(db, "c1"), /supporting passage or an editorial basis/); // contradicting evidence is not support
  await db.run("UPDATE claim_passage SET relation = 'supports' WHERE claim_id = 'c1'");
  await publish(db, "c1");

  await addClaim(db, "c-unverified", { evidence_label: "unverified", editorial_basis: "synthetic basis" });
  await assert.rejects(publish(db, "c-unverified"), /cannot be unverified/);
  await db.run("UPDATE claim SET evidence_label = 'source_reported' WHERE id = 'c-unverified'");
  await publish(db, "c-unverified"); // the editorial basis alone is enough

  // support removed after publication shows up in the integrity view
  await db.run("DELETE FROM claim_passage WHERE claim_id = 'c1'");
  assert.deepEqual((await db.all("SELECT id FROM v_published_claims_without_support")).map((r) => (r as { id: string }).id), ["c1"]);
  // and the supporting evidence cannot be dropped from an already-published claim by clearing its basis
  await assert.rejects(db.run("UPDATE claim SET editorial_basis = NULL WHERE id = 'c-unverified'"), /supporting passage or an editorial basis/);
});

test("disputed and 'no established report found' claims must explain the uncertainty", async () => {
  const db = await fresh();
  await assert.rejects(addClaim(db, "c-d", { evidence_label: "disputed" }), /CHECK/);
  await assert.rejects(addClaim(db, "c-n", { evidence_label: "no_established_report_found" }), /CHECK/);
  await addClaim(db, "c-d", { evidence_label: "disputed", uncertainty_note: "synthetic note" });
  await assert.rejects(addClaim(db, "c-bad", { claim_type: "guess" }), /CHECK/);
  await assert.rejects(addClaim(db, "c-bad2", { editorial_status: "live" }), /CHECK/);
});

test("claim text is one row per language and cannot be blank", async () => {
  const db = await fresh();
  await addClaim(db, "c1");
  await db.run("INSERT INTO claim_text (claim_id, lang, text) VALUES ('c1', 'en', 'synthetic'), ('c1', 'bn', 'synthetic bn')");
  await assert.rejects(db.run("INSERT INTO claim_text (claim_id, lang, text) VALUES ('c1', 'en', 'again')"), /UNIQUE|constraint/);
  await assert.rejects(db.run("INSERT INTO claim_text (claim_id, lang, text) VALUES ('c1', 'fr', '   ')"), /CHECK/);
  await assert.rejects(db.run("INSERT INTO claim_text (claim_id, lang, text, translation_status) VALUES ('c1', 'fr', 'x', 'auto')"), /CHECK/);
  await assert.rejects(db.run("INSERT INTO claim_text (claim_id, lang, text) VALUES ('missing', 'en', 'x')"), /FOREIGN KEY/);
});

test("edges: endpoints must fit the edge type, and a published edge needs evidence", async () => {
  const db = await fresh();
  const ins = (id: string, type: string, fk: string, fid: string, tk: string, tid: string, basis: string | null = null) =>
    db.run(
      "INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_basis, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, ?, 'tester', 1)",
      [id, type, fk, fid, tk, tid, basis],
    );
  await ins("e1", "REPORT_REFERENCES_AYAH", "source_passage", "p-open", "ayah", "2:1");
  await assert.rejects(ins("e2", "REPORT_REFERENCES_AYAH", "claim", "c1", "ayah", "2:1"), /do not match the edge type/);
  await assert.rejects(ins("e3", "REPORT_REFERENCES_AYAH", "source_passage", "p-open", "surah", "2"), /do not match the edge type/);
  await assert.rejects(ins("e4", "MADE_UP_TYPE", "claim", "c1", "ayah", "2:1"), /do not match the edge type/); // unknown type
  await assert.rejects(ins("e5", "REPORT_REFERENCES_AYAH", "source_passage", "p-open", "ayah", "2:1"), /UNIQUE|constraint/);
  await ins("e6", "CLAIM_CONCERNS_SURAH", "claim", "c1", "surah", "2");

  await assert.rejects(db.run("UPDATE edge SET editorial_status = 'published' WHERE id = 'e1'"), /supporting passage or an editorial basis/);
  await db.run("INSERT INTO edge_passage (edge_id, passage_id) VALUES ('e1', 'p-open')");
  await db.run("UPDATE edge SET editorial_status = 'published' WHERE id = 'e1'");
  await db.run("UPDATE edge SET editorial_basis = 'synthetic basis', editorial_status = 'published' WHERE id = 'e6'");
  assert.equal((await db.all("SELECT * FROM v_published_edges_without_support")).length, 0);
  await db.run("DELETE FROM edge_passage WHERE edge_id = 'e1'");
  assert.deepEqual((await db.all("SELECT id FROM v_published_edges_without_support")).map((r) => (r as { id: string }).id), ["e1"]);
  await assert.rejects(db.run("UPDATE edge SET type = 'CLAIM_CONCERNS_AYAH' WHERE id = 'e6'"), /do not match the edge type/);
});

test("edges can be walked from either end through the indexes", async () => {
  const db = await fresh();
  await db.run(
    "INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES ('e1', 'TAFSIR_EXPLAINS_AYAH', 'source_passage', 'p-open', 'ayah', '2:1', 't', 1)",
  );
  const plan = (sql: string) => db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`);
  assert.match((await plan("SELECT id FROM edge WHERE from_kind = 'source_passage' AND from_id = 'p-open'"))[0]?.detail ?? "", /idx_edge_from|sqlite_autoindex/);
  assert.match((await plan("SELECT id FROM edge WHERE to_kind = 'ayah' AND to_id = '2:1'"))[0]?.detail ?? "", /idx_edge_to|sqlite_autoindex/);
});

test("surah profile: revelation order always names its source and is unique", async () => {
  const db = await fresh();
  await db.run("INSERT INTO surah_profile (surah_id, revelation_order, revelation_order_source) VALUES (1, 5, 'synthetic dataset')");
  await db.run("INSERT INTO surah_profile (surah_id) VALUES (2)"); // unknown order stays unknown, not zero
  await assert.rejects(db.run("UPDATE surah_profile SET revelation_order = 9 WHERE surah_id = 2"), /CHECK/);
  await assert.rejects(db.run("UPDATE surah_profile SET revelation_order = 5, revelation_order_source = 's' WHERE surah_id = 2"), /UNIQUE|constraint/);
  await assert.rejects(db.run("INSERT INTO surah_profile (surah_id, revelation_order, revelation_order_source) VALUES (3, 1, 's')"), /FOREIGN KEY/);
  await assert.rejects(db.run("UPDATE surah_profile SET revelation_order = 115, revelation_order_source = 's' WHERE surah_id = 2"), /CHECK/);
});

test("foreign keys hold for the source chain", async () => {
  const db = await fresh();
  await assert.rejects(db.run("INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('e', 'nope', 'x', 'lic-open')"), /FOREIGN KEY/);
  await assert.rejects(db.run("INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('e', 'work-1', 'x', 'nope')"), /FOREIGN KEY/);
  await assert.rejects(db.run("INSERT INTO source_passage (id, edition_id, page) VALUES ('p', 'nope', '1')"), /FOREIGN KEY/);
});
