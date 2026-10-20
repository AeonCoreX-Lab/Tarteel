import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { CONTENT_MIGRATIONS, createKnowledgeReader, migrate } from "../src/index.ts";
import type { InstalledPack, PackRegistry } from "../src/index.ts";

// ALL names, dates and text are synthetic placeholders. No real history belongs in tests.

const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), "tarteel-entities-reader-"));
  dirs.push(d);
  return d;
};
function registry(packs: InstalledPack[]): PackRegistry {
  return { list: async () => packs, get: async (id) => packs.find((p) => p.packId === id), upsert: async () => {}, remove: async () => {} };
}
const installed = (packId: string, path: string): InstalledPack => ({ packId, packVersion: 1, path, sha256: "x", sizeBytes: 1, installedAt: 1 });
const reader = (packs: InstalledPack[]) => createKnowledgeReader({ registry: registry(packs), openDb: async (p) => openNodeSqlite(p) });

type Ent = {
  id: string; kind: "event" | "person" | "place"; label?: string; date?: [calendar: "ah" | "ce", start: number, end: number | null, precision: string, sort: number]; status?: string;
  texts: [lang: string, name: string, summary: string | null, status: string][]; supports?: string[];
};

/** A pack with a small web of entities. `schema` 2 builds the older kind of pack, which has no entity tables at all. */
async function makePack(dir: string, name: string, o: { schema?: number; ents?: Ent[] } = {}): Promise<string> {
  const path = join(dir, name);
  const db = openNodeSqlite(path);
  await migrate(db, CONTENT_MIGRATIONS.slice(0, o.schema ?? 3));
  await db.exec(`
    INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open', 'yes', 'Synthetic credit');
    INSERT INTO source_work (id, title, original_language, work_type) VALUES ('w1', 'Synthetic Work', 'ar', 'history');
    INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-open', 'w1', 'Open edition', 'lic-open');
    INSERT INTO source_passage (id, edition_id, page) VALUES ('p1', 'ed-open', '10');
    INSERT INTO claim (id, claim_type, evidence_label, editorial_basis, editorial_status, created_by, dataset_version) VALUES ('c1', 'historical_report', 'source_reported', 'basis', 'approved', 't', 1);
    INSERT INTO claim_text (claim_id, lang, text, translation_status) VALUES ('c1', 'en', 'Synthetic claim about the first event.', 'original');
    UPDATE claim SET editorial_status = 'published' WHERE id = 'c1';
  `);
  const edge = async (id: string, type: string, fk: string, f: string, tk: string, t: string, status = "published"): Promise<void> => {
    await db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_status, editorial_basis, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'basis', 't', 1)", [id, type, fk, f, tk, t]);
    if (status === "published") await db.run("UPDATE edge SET editorial_status = 'published' WHERE id = ?", [id]);
  };
  if ((o.schema ?? 3) >= 3) {
    for (const e of o.ents ?? []) {
      const d = e.date;
      await db.run(
        `INSERT INTO entity (id, kind, evidence_label, uncertainty_note, editorial_basis, editorial_status, date_calendar, date_start, date_end, date_precision, sort_year, created_by, dataset_version)
         VALUES (?, ?, ?, ?, 'basis', 'approved', ?, ?, ?, ?, ?, 't', 1)`,
        [e.id, e.kind, e.label ?? "source_reported", e.label === "disputed" ? "Synthetic: the sources differ." : null, d?.[0] ?? null, d?.[1] ?? null, d?.[2] ?? null, d?.[3] ?? "unknown", d?.[4] ?? null],
      );
      for (const [lang, n, s, st] of e.texts) await db.run("INSERT INTO entity_text (entity_id, lang, name, summary, translation_status) VALUES (?, ?, ?, ?, ?)", [e.id, lang, n, s, st]);
      for (const p of e.supports ?? []) await db.run("INSERT INTO entity_passage (entity_id, passage_id) VALUES (?, ?)", [e.id, p]);
      if (e.status !== "draft") await db.run("UPDATE entity SET editorial_status = 'published' WHERE id = ?", [e.id]);
    }
    await edge("e1", "EVENT_CONCERNS_AYAH", "event", "ev-late", "ayah", "1:2");
    await edge("e2", "EVENT_AT_PLACE", "event", "ev-late", "place", "pl-1");
    await edge("e3", "PERSON_IN_EVENT", "person", "per-1", "event", "ev-late");
    await edge("e4", "CLAIM_CONCERNS_EVENT", "claim", "c1", "event", "ev-late");
    await edge("e5", "EVENT_CONCERNS_SURAH", "event", "ev-early", "surah", "2");
    await edge("e6", "PLACE_MENTIONED_IN_AYAH", "place", "pl-1", "ayah", "2:5");
    await edge("e7", "PERSON_MENTIONED_IN_AYAH", "person", "per-1", "ayah", "1:2");
    await edge("e8", "EVENT_CONCERNS_AYAH", "event", "ev-draft", "ayah", "3:1", "approved"); // not published
    await edge("e9", "EVENT_CONCERNS_AYAH", "event", "ev-undated", "ayah", "1:1");
    await edge("e10", "PERSON_IN_EVENT", "person", "per-draft", "event", "ev-late"); // person is a draft
  } else {
    await edge("e1", "CLAIM_CONCERNS_AYAH", "claim", "c1", "ayah", "1:1");
  }
  await db.close();
  return path;
}

const ENTS: Ent[] = [
  { id: "ev-late", kind: "event", date: ["ah", 5, null, "year", 627], texts: [["en", "Synthetic late event", "About the late event.", "original"], ["bn", "কৃত্রিম পরবর্তী ঘটনা", null, "reviewed"]], supports: ["p1"] },
  { id: "ev-early", kind: "event", date: ["ce", 610, null, "approximate", 610], label: "disputed", texts: [["en", "Synthetic early event", null, "original"]] },
  { id: "ev-undated", kind: "event", texts: [["en", "Synthetic undated event", null, "original"]] },
  { id: "ev-draft", kind: "event", status: "draft", texts: [["en", "Synthetic draft event", null, "original"]] },
  { id: "per-1", kind: "person", date: ["ce", 600, 660, "decade", 600], texts: [["en", "Synthetic person", "A made-up person.", "original"]] },
  { id: "per-draft", kind: "person", status: "draft", texts: [["en", "Synthetic draft person", null, "original"]] },
  { id: "pl-1", kind: "place", texts: [["en", "Synthetic city", null, "machine_draft"], ["bn", "কৃত্রিম শহর", null, "machine_draft"]] },
];

test("entityCounts counts published events, people and places only, across packs", async () => {
  const dir = await tmp();
  const a = await makePack(dir, "a.db", { ents: ENTS });
  const b = await makePack(dir, "b.db", { ents: [{ id: "ev-b", kind: "event", texts: [["en", "Synthetic b", null, "original"]] }] });
  assert.deepEqual(await reader([installed("pack-a", a)]).entityCounts(), { event: 3, person: 1, place: 1 });
  assert.deepEqual(await reader([installed("pack-a", a), installed("pack-b", b)]).entityCounts(), { event: 4, person: 1, place: 1 });
  assert.deepEqual(await reader([]).entityCounts(), { event: 0, person: 0, place: 0 });
});

test("entities(): dated first by the ordering year, undated after by name; names follow the asked language", async () => {
  const dir = await tmp();
  const r = reader([installed("pack-a", await makePack(dir, "a.db", { ents: ENTS }))]);
  const events = await r.entities("event", "en");
  assert.deepEqual(events.map((e) => e.id), ["ev-early", "ev-late", "ev-undated"]);
  assert.equal(events[0]!.date.precision, "approximate");
  assert.equal(events[0]!.evidenceLabel, "disputed");
  assert.equal(events[1]!.date.sortYear, 627);
  assert.equal(events[2]!.date.start, null);
  assert.equal(events[2]!.date.precision, "unknown");
  assert.equal(events[1]!.key, "pack-a:ev-late");
  assert.equal((await r.entities("event", "bn"))[1]!.name, "কৃত্রিম পরবর্তী ঘটনা");
  const late = (await r.entities("event", "bn"))[1]!;
  assert.equal(late.summary, "About the late event.", "a summary exists only in English, so that one is used");
  assert.equal(late.summaryLang, "en");
  const person = (await r.entities("person", "en"))[0]!;
  assert.deepEqual([person.date.start, person.date.end, person.date.calendar], [600, 660, "ce"]);
  assert.deepEqual((await r.entities("place", "en")).map((e) => [e.name, e.nameStatus]), [["Synthetic city", "machine_draft"]], "a machine-drafted name is returned and labelled");
});

test("entity(): the detail with sources, claims, related entries and Quran links; drafts and unknown ids give null", async () => {
  const dir = await tmp();
  const r = reader([installed("pack-a", await makePack(dir, "a.db", { ents: ENTS }))]);
  const d = (await r.entity("pack-a", "ev-late", "en"))!;
  assert.equal(d.name, "Synthetic late event");
  assert.deepEqual(d.sources.map((s) => s.passageId), ["p1"]);
  assert.deepEqual(d.claims.map((c) => c.key), ["pack-a:c1"]);
  assert.deepEqual(d.places.map((p) => p.id), ["pl-1"]);
  assert.deepEqual(d.people.map((p) => p.id), ["per-1"], "the person who is only a draft is not listed");
  assert.deepEqual(d.events, []);
  assert.deepEqual(d.quranLinks, [{ surahId: 1, ayahNumber: 2 }]);

  const p = (await r.entity("pack-a", "per-1", "en"))!;
  assert.deepEqual(p.events.map((e) => e.id), ["ev-late"]);
  assert.deepEqual(p.quranLinks, [{ surahId: 1, ayahNumber: 2 }]);
  const place = (await r.entity("pack-a", "pl-1", "en"))!;
  assert.deepEqual(place.events.map((e) => e.id), ["ev-late"]);
  assert.deepEqual(place.quranLinks, [{ surahId: 2, ayahNumber: 5 }]);
  const early = (await r.entity("pack-a", "ev-early", "en"))!;
  assert.deepEqual(early.quranLinks, [{ surahId: 2, ayahNumber: null }]);

  assert.equal(await r.entity("pack-a", "ev-draft", "en"), null);
  assert.equal(await r.entity("pack-a", "nope", "en"), null);
  assert.equal(await r.entity("pack-zzz", "ev-late", "en"), null);
});

test("entitiesFor: by ayah, and by surah (the surah itself or any of its ayahs); unpublished links are ignored", async () => {
  const dir = await tmp();
  const r = reader([installed("pack-a", await makePack(dir, "a.db", { ents: ENTS }))]);
  assert.deepEqual((await r.entitiesFor({ surahId: 1, ayahNumber: 2 }, "en")).map((e) => e.id), ["ev-late", "per-1"]);
  assert.deepEqual((await r.entitiesFor({ surahId: 1 }, "en")).map((e) => e.id), ["ev-late", "ev-undated", "per-1"]);
  assert.deepEqual((await r.entitiesFor({ surahId: 2 }, "en")).map((e) => e.id), ["ev-early", "pl-1"]);
  assert.deepEqual(await r.entitiesFor({ surahId: 3 }, "en"), [], "only a draft event is linked to surah 3");
  assert.deepEqual(await r.entitiesFor({ surahId: 1, ayahNumber: 9 }, "en"), []);
});

test("coverage and browse include events, people and places", async () => {
  const dir = await tmp();
  const r = reader([installed("pack-a", await makePack(dir, "a.db", { ents: ENTS }))]);
  assert.deepEqual(await r.coverage(1), { surahClaims: 0, surahEntities: 0, ayahs: [1, 2] });
  assert.deepEqual(await r.coverage(2), { surahClaims: 0, surahEntities: 1, ayahs: [5] });
  assert.deepEqual(await r.coverage(3), { surahClaims: 0, surahEntities: 0, ayahs: [] });
  assert.deepEqual(await r.browse(), [
    { surahId: 1, surahClaims: 0, surahEntities: 0, ayahs: 2 },
    { surahId: 2, surahClaims: 0, surahEntities: 1, ayahs: 1 },
  ]);
});

test("search finds entities by name or summary, and ranks them between claims and passages", async () => {
  const dir = await tmp();
  const r = reader([installed("pack-a", await makePack(dir, "a.db", { ents: ENTS }))]);
  const byName = await r.search("late event", "en");
  assert.deepEqual(byName.hits.map((h) => [h.kind, h.entity?.id]), [["entity", "ev-late"]]);
  assert.equal(byName.hits[0]!.entity?.kind, "event");
  assert.equal(byName.hits[0]!.evidenceLabel, "source_reported");
  const bySummary = await r.search("made-up person", "en");
  assert.deepEqual(bySummary.hits.map((h) => h.entity?.id), ["per-1"]);
  assert.match(bySummary.hits[0]!.snippet, /made-up person/);
  assert.deepEqual((await r.search("synthetic draft", "en")).hits, [], "a draft is never found");
  const mixed = await r.search("synthetic", "en");
  assert.ok(mixed.hits.some((h) => h.kind === "claim"));
  assert.ok(mixed.hits.filter((h) => h.kind === "entity").length >= 5);
  const kinds = mixed.hits.map((h) => h.kind);
  assert.ok(kinds.lastIndexOf("claim") < kinds.indexOf("entity"), "claims come before entities");
});

test("a pack built before migration 3 is still read, and adds no entities", async () => {
  const dir = await tmp();
  const old = await makePack(dir, "old.db", { schema: 2 });
  const fresh = await makePack(dir, "new.db", { ents: ENTS });
  const r = reader([installed("pack-new", fresh), installed("pack-old", old)]);
  assert.deepEqual(await r.entityCounts(), { event: 3, person: 1, place: 1 });
  assert.equal((await r.entities("event", "en")).length, 3);
  assert.equal(await r.entity("pack-old", "ev-late", "en"), null);
  assert.deepEqual((await r.coverage(1)).ayahs, [1, 2], "the old pack's claim about ayah 1 and the new pack's entities");
  assert.ok((await r.search("first event", "en")).hits.some((h) => h.packId === "pack-old" && h.kind === "claim"), "the old pack's claim is still searchable");
  assert.ok((await r.browse()).length >= 1);
  assert.deepEqual((await reader([installed("pack-old", old)]).entityCounts()), { event: 0, person: 0, place: 0 });
});
