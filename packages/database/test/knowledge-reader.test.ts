import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { CONTENT_MIGRATIONS, USER_MIGRATIONS, chooseClaimText, createKnowledgeReader, locatorParts, migrate, createRepositories } from "../src/index.ts";
import type { InstalledPack, PackRegistry } from "../src/index.ts";

// ALL text below is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), "tarteel-reader-"));
  dirs.push(d);
  return d;
};

/** Writes a pack database with the same rows a built pack has. `extra` runs after the base rows (for broken or special cases). */
async function makePack(dir: string, name: string, o: { prefix?: string; extra?: (db: SqlDriver) => Promise<void> } = {}): Promise<string> {
  const p = o.prefix ?? "";
  const path = join(dir, name);
  const db = openNodeSqlite(path);
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open', 'yes', 'Synthetic credit'), ('lic-closed', 'Synthetic closed', 'no', 'Synthetic closed credit');
    INSERT INTO source_work (id, title, title_arabic, author, original_language, work_type) VALUES ('w1', 'Synthetic Work', 'عمل', 'Synthetic Author', 'ar', 'tafsir');
    INSERT INTO source_edition (id, work_id, edition_label, license_id, transcription_status) VALUES ('ed-open', 'w1', 'Open edition', 'lic-open', 'verified'), ('ed-closed', 'w1', 'Closed edition', 'lic-closed', 'unverified');
    INSERT INTO source_passage (id, edition_id, volume, page, quote, quote_language) VALUES ('${p}p-open', 'ed-open', '1', '10', 'synthetic quote', 'en');
    INSERT INTO source_passage (id, edition_id, page, chapter) VALUES ('${p}p-closed', 'ed-closed', '5', 'Synthetic chapter');
    INSERT INTO source_passage (id, edition_id, report_number) VALUES ('${p}p-report', 'ed-closed', '77');
  `);
  const claim = async (id: string, label: string, texts: [string, string, string][], supports: string[], contradicts: string[] = [], note?: string): Promise<void> => {
    await db.run("INSERT INTO claim (id, claim_type, evidence_label, uncertainty_note, editorial_basis, editorial_status, created_by, dataset_version) VALUES (?, 'historical_report', ?, ?, 'basis', 'approved', 't', 1)", [id, label, note ?? null]);
    for (const [lang, text, status] of texts) await db.run("INSERT INTO claim_text (claim_id, lang, text, translation_status) VALUES (?, ?, ?, ?)", [id, lang, text, status]);
    for (const s of supports) await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES (?, ?, 'supports')", [id, s]);
    for (const s of contradicts) await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES (?, ?, 'contradicts')", [id, s]);
    await db.run("UPDATE claim SET editorial_status = 'published' WHERE id = ?", [id]);
  };
  const edge = async (id: string, type: string, fromKind: string, fromId: string, toKind: string, toId: string, passage: string): Promise<void> => {
    await db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_status, editorial_basis, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'basis', 't', 1)", [id, type, fromKind, fromId, toKind, toId]);
    await db.run("INSERT INTO edge_passage (edge_id, passage_id) VALUES (?, ?)", [id, passage]);
    await db.run("UPDATE edge SET editorial_status = 'published' WHERE id = ?", [id]);
  };
  await claim(`${p}c-surah`, "source_reported", [["en", "Synthetic surah claim.", "original"], ["bn", "কৃত্রিম সূরা দাবি।", "reviewed"]], [`${p}p-open`, `${p}p-closed`], [`${p}p-report`]);
  await claim(`${p}c-ayah`, "disputed", [["en", "Synthetic ayah claim.", "original"]], [`${p}p-open`], [], "Synthetic: sources disagree.");
  await claim(`${p}c-other`, "source_reported", [["en", "Synthetic claim about another surah.", "original"]], [`${p}p-open`]);
  await edge(`${p}e-surah`, "CLAIM_CONCERNS_SURAH", "claim", `${p}c-surah`, "surah", "1", `${p}p-open`);
  await edge(`${p}e-ayah`, "CLAIM_CONCERNS_AYAH", "claim", `${p}c-ayah`, "ayah", "1:2", `${p}p-open`);
  await edge(`${p}e-other`, "CLAIM_CONCERNS_SURAH", "claim", `${p}c-other`, "surah", "2", `${p}p-open`);
  await edge(`${p}e-report`, "REPORT_REFERENCES_AYAH", "source_passage", `${p}p-report`, "ayah", "1:1", `${p}p-report`);
  await edge(`${p}e-tafsir`, "TAFSIR_EXPLAINS_AYAH", "source_passage", `${p}p-open`, "ayah", "1:2", `${p}p-open`);
  await o.extra?.(db);
  await db.close();
  return path;
}

function fakeRegistry(packs: InstalledPack[]): PackRegistry & { set(p: InstalledPack[]): void } {
  let current = packs;
  return {
    list: async () => current, get: async (id) => current.find((p) => p.packId === id),
    upsert: async () => {}, remove: async () => {}, set: (p) => void (current = p),
  };
}
const installed = (packId: string, path: string, version = 1): InstalledPack => ({ packId, packVersion: version, path, sha256: "x", sizeBytes: 1, installedAt: 1 });

test("surah history: published claims with their sources, locators, licences and the quote only where the licence allows", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db");
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  const claims = await reader.surah(1, "en");
  assert.deepEqual(claims.map((c) => c.key), ["pack-a:c-surah"]); // the claim about surah 2 is not here
  const c = claims[0]!;
  assert.equal(c.text, "Synthetic surah claim.");
  assert.equal(c.evidenceLabel, "source_reported");
  assert.deepEqual(c.supports.map((s) => s.passageId), ["p-closed", "p-open"]);
  assert.deepEqual(c.contradicts.map((s) => s.passageId), ["p-report"]);
  const open = c.supports.find((s) => s.passageId === "p-open")!;
  assert.equal(open.quote, "synthetic quote");
  assert.equal(open.workTitle, "Synthetic Work");
  assert.equal(open.author, "Synthetic Author");
  assert.deepEqual([open.locator.volume, open.locator.page], ["1", "10"]);
  assert.equal(open.attribution, "Synthetic credit");
  const closed = c.supports.find((s) => s.passageId === "p-closed")!;
  assert.equal(closed.quote, null);
  assert.equal(closed.locator.chapter, "Synthetic chapter");
  assert.equal(closed.transcriptionStatus, "unverified");
  assert.equal(c.contradicts[0]?.locator.reportNumber, "77");
  await reader.close();
});

test("a quotation whose licence does not allow redistribution is never returned, even if a pack contains one", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db", {
    extra: async (db) => {
      await db.exec("DROP TRIGGER source_passage_quote_ins; DROP TRIGGER source_passage_quote_upd;");
      await db.exec("UPDATE source_passage SET quote = 'forbidden quote', quote_language = 'en' WHERE id = 'p-closed'");
    },
  });
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  const all = JSON.stringify(await reader.surah(1, "en"));
  assert.doesNotMatch(all, /forbidden quote/);
  await reader.close();
});

test("only published claims and edges are shown: draft claims and edges, and a published edge to a retracted claim, are not", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db", {
    extra: async (db) => {
      await db.exec(`
        INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version) VALUES ('c-draft', 'historical_report', 'source_reported', 'draft', 't', 1);
        INSERT INTO claim_text (claim_id, lang, text) VALUES ('c-draft', 'en', 'Synthetic draft.');
        INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES ('e-draft', 'CLAIM_CONCERNS_SURAH', 'claim', 'c-draft', 'surah', '1', 't', 1);
        UPDATE claim SET editorial_status = 'retracted' WHERE id = 'c-ayah';
      `);
    },
  });
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["pack-a:c-surah"]);
  assert.deepEqual((await reader.ayah(1, 2, "en")).claims, []); // the claim was retracted although its edge still says published
  await reader.close();
});

test("claim text: asked language, then English, trusted text before machine drafts", () => {
  const row = (lang: string, status: "original" | "machine_draft" | "reviewed") => ({ lang, text: `${lang}-${status}`, translation_status: status });
  assert.equal(chooseClaimText([row("en", "original"), row("bn", "reviewed")], "bn")?.text, "bn-reviewed");
  assert.equal(chooseClaimText([row("en", "original"), row("bn", "reviewed")], "en")?.text, "en-original");
  assert.equal(chooseClaimText([row("en", "original"), row("bn", "machine_draft")], "bn")?.text, "en-original", "a reviewed English text beats a Bengali machine draft");
  assert.equal(chooseClaimText([row("bn", "machine_draft")], "bn")?.text, "bn-machine_draft");
  assert.equal(chooseClaimText([row("ur", "original"), row("en", "original")], "bn")?.text, "en-original");
  assert.equal(chooseClaimText([row("ur", "original")], "bn")?.text, "ur-original");
  assert.equal(chooseClaimText([row("bn", "machine_draft"), row("en", "machine_draft")], "bn")?.text, "bn-machine_draft");
  assert.equal(chooseClaimText([], "en"), undefined);
});

test("the returned claim says which language and status its text has, so the screen can label it", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db");
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  const bn = (await reader.surah(1, "bn"))[0]!;
  assert.deepEqual([bn.textLang, bn.textStatus], ["bn", "reviewed"]);
  const ur = (await reader.surah(1, "ur"))[0]!;
  assert.deepEqual([ur.textLang, ur.textStatus], ["en", "original"]);
  await reader.close();
});

test("ayah context: claims about the ayah, and reports and tafsir that refer to it", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db");
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  const two = await reader.ayah(1, 2, "en");
  assert.deepEqual(two.claims.map((c) => [c.key, c.evidenceLabel, c.uncertaintyNote]), [["pack-a:c-ayah", "disputed", "Synthetic: sources disagree."]]);
  assert.deepEqual(two.reports.map((r) => [r.kind, r.source.passageId]), [["tafsir", "p-open"]]);
  const one = await reader.ayah(1, 1, "en");
  assert.deepEqual(one.claims, []);
  assert.deepEqual(one.reports.map((r) => [r.kind, r.source.locator.reportNumber]), [["report", "77"]]);
  assert.deepEqual(await reader.ayah(1, 3, "en"), { claims: [], reports: [] });
  await reader.close();
});

test("coverage lists the surah's claims and the ayahs that have something, ignoring other surahs", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db");
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  assert.deepEqual(await reader.coverage(1), { surahClaims: 1, ayahs: [1, 2] });
  assert.deepEqual(await reader.coverage(2), { surahClaims: 1, ayahs: [] });
  assert.deepEqual(await reader.coverage(3), { surahClaims: 0, ayahs: [] });
  assert.deepEqual(await reader.coverage(11), { surahClaims: 0, ayahs: [] }, "surah 11 must not match ayahs of surah 1");
  await reader.close();
});

test("several packs are merged in pack order, and the same claim id in two packs stays two claims", async () => {
  const dir = await tmp();
  const a = await makePack(dir, "a.db");
  const b = await makePack(dir, "b.db");
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-b", b), installed("pack-a", a)]), openDb: async (p) => openNodeSqlite(p) });
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["pack-a:c-surah", "pack-b:c-surah"]);
  assert.deepEqual((await reader.coverage(1)).surahClaims, 2);
  await reader.close();
});

test("a removed pack stops being read and its connection is closed; an updated pack is reopened from its new file", async () => {
  const dir = await tmp();
  const a1 = await makePack(dir, "a1.db");
  const a2 = await makePack(dir, "a2.db", { extra: async (db) => void (await db.exec("UPDATE claim_text SET text = 'Synthetic surah claim, newer.' WHERE claim_id = 'c-surah' AND lang = 'en'")) });
  const reg = fakeRegistry([installed("pack-a", a1, 1)]);
  const opened: string[] = [];
  const closed: string[] = [];
  const reader = createKnowledgeReader({
    registry: reg,
    openDb: async (p) => {
      opened.push(p);
      const db = openNodeSqlite(p);
      return { ...db, close: async () => { closed.push(p); await db.close(); } };
    },
  });
  assert.equal((await reader.surah(1, "en"))[0]?.text, "Synthetic surah claim.");
  await reader.surah(1, "en");
  assert.deepEqual(opened, [a1], "the connection is reused");
  reg.set([installed("pack-a", a2, 2)]);
  assert.equal((await reader.surah(1, "en"))[0]?.text, "Synthetic surah claim, newer.");
  assert.deepEqual(closed, [a1]);
  reg.set([]);
  assert.deepEqual(await reader.surah(1, "en"), []);
  assert.deepEqual(closed, [a1, a2]);
  await reader.close();
});

test("a pack that will not open, or whose tables are damaged, is skipped and the other packs still answer", async () => {
  const dir = await tmp();
  const good = await makePack(dir, "good.db");
  const broken = join(dir, "broken.db");
  const bdb = openNodeSqlite(broken); // an empty SQLite file: no tables
  await bdb.exec("CREATE TABLE unrelated (x INTEGER)");
  await bdb.close();
  const reader = createKnowledgeReader({
    registry: fakeRegistry([installed("pack-broken", broken), installed("pack-gone", join(dir, "missing", "x.db")), installed("pack-good", good)]),
    openDb: async (p) => {
      if (p.includes("missing")) throw new Error("cannot open");
      return openNodeSqlite(p);
    },
  });
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["pack-good:c-surah"]);
  assert.deepEqual((await reader.coverage(1)).ayahs, [1, 2]);
  await reader.close();
});

test("with no pack installed the reader returns nothing and touches nothing", async () => {
  const reader = createKnowledgeReader({ registry: fakeRegistry([]), openDb: async () => { throw new Error("must not open"); } });
  assert.deepEqual(await reader.coverage(1), { surahClaims: 0, ayahs: [] });
  assert.deepEqual(await reader.surah(1, "en"), []);
  assert.deepEqual(await reader.ayah(1, 1, "en"), { claims: [], reports: [] });
});

test("getSurahProfile returns the revelation order with its source, and undefined without one", async () => {
  const content = openNodeSqlite();
  await migrate(content, CONTENT_MIGRATIONS);
  await content.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2), (2, 'b', 'Two', 'Second', 'madinah', 3);
    INSERT INTO surah_profile (surah_id, revelation_order, revelation_order_source) VALUES (1, 5, 'Synthetic source');
  `);
  const user = openNodeSqlite();
  await migrate(user, USER_MIGRATIONS);
  const repos = createRepositories(content, user);
  assert.deepEqual(await repos.quran.getSurahProfile(1), { revelationOrder: 5, source: "Synthetic source" });
  assert.equal(await repos.quran.getSurahProfile(2), undefined);
  const old = openNodeSqlite();
  assert.equal(await createRepositories(old, user).quran.getSurahProfile(1), undefined, "a database without the table is not an error");
});

test("locatorParts lists only what is set, in lookup order", () => {
  assert.deepEqual(locatorParts({ volume: "2", page: "40", chapter: null, section: "  ", reportNumber: "7", hadithNumber: null }), [
    { kind: "volume", value: "2" }, { kind: "page", value: "40" }, { kind: "reportNumber", value: "7" },
  ]);
  assert.deepEqual(locatorParts({ volume: null, page: null, chapter: null, section: null, reportNumber: null, hadithNumber: null }), []);
});

test("sourceDetail: the work, edition and licence behind a citation, and the published claims that cite that edition", async () => {
  const dir = await tmp();
  const path = await makePack(dir, "a.db", {
    extra: async (db) => {
      await db.exec(`
        INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version) VALUES ('c-draft', 'historical_report', 'source_reported', 'draft', 't', 1);
        INSERT INTO claim_text (claim_id, lang, text) VALUES ('c-draft', 'en', 'Synthetic draft that must stay hidden.');
        INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES ('c-draft', 'p-open', 'supports');
      `);
    },
  });
  const reader = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", path)]), openDb: async (p) => openNodeSqlite(p) });
  const cite = (await reader.surah(1, "en"))[0]!.supports.find((s) => s.passageId === "p-open")!;
  assert.deepEqual([cite.packId, cite.editionId], ["pack-a", "ed-open"]);
  const d = await reader.sourceDetail(cite.packId, cite.passageId, "en");
  assert.ok(d);
  assert.deepEqual([d.work.title, d.work.titleArabic, d.work.author, d.work.workType], ["Synthetic Work", "عمل", "Synthetic Author", "tafsir"]);
  assert.deepEqual([d.edition.id, d.edition.label, d.edition.transcriptionStatus], ["ed-open", "Open edition", "verified"]);
  assert.deepEqual([d.license.name, d.license.redistribution, d.license.attribution, d.license.nonCommercialOnly], ["Synthetic open", "yes", "Synthetic credit", false]);
  assert.deepEqual(d.citedBy.map((c) => c.key).sort(), ["pack-a:c-ayah", "pack-a:c-other", "pack-a:c-surah"], "published claims only: the draft is not listed");
  assert.deepEqual(d.passages.map((p) => p.passageId), ["p-open"]);
  assert.equal(JSON.stringify(d).includes("must stay hidden"), false);
  assert.equal(await reader.sourceDetail("pack-a", "no-such-passage", "en"), null);
  assert.equal(await reader.sourceDetail("no-such-pack", "p-open", "en"), null);
  await reader.close();
});

test("trust: a pack that fails the check is never opened, and is checked again when it is reinstalled or repaired", async () => {
  const dir = await tmp();
  const a = await makePack(dir, "a.db");
  const b = await makePack(dir, "b.db");
  const reg = fakeRegistry([installed("pack-a", a), installed("pack-b", b)]);
  const asked: string[] = [];
  const untrusted = new Set(["pack-b"]);
  const opened: string[] = [];
  const reader = createKnowledgeReader({
    registry: reg,
    openDb: async (p) => (opened.push(p), openNodeSqlite(p)),
    trust: async (pack) => (asked.push(pack.packId), !untrusted.has(pack.packId)),
  });
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["pack-a:c-surah"]);
  await reader.surah(1, "en");
  assert.deepEqual(asked, ["pack-a", "pack-b"], "each pack is checked once, not on every question");
  assert.deepEqual(opened, [a], "the untrusted pack was never opened");
  assert.equal(await reader.sourceDetail("pack-b", "p-open", "en"), null);
  assert.deepEqual((await reader.coverage(1)).surahClaims, 1);

  // the publisher repairs pack-b (same file, new install record): it is checked again and now accepted
  untrusted.clear();
  reg.set([installed("pack-a", a), { ...installed("pack-b", b), installedAt: 2 }]);
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["pack-a:c-surah", "pack-b:c-surah"]);
  // a trust check that throws counts as "not trusted"
  const strict = createKnowledgeReader({ registry: fakeRegistry([installed("pack-a", a)]), openDb: async (p) => openNodeSqlite(p), trust: async () => { throw new Error("boom"); } });
  assert.deepEqual(await strict.surah(1, "en"), []);
  await reader.close();
  await strict.close();
});
