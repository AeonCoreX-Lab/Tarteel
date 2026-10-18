import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackSource } from "./source.ts";

// Synthetic fixture only. Each test copies the example pack and breaks one thing in entities.json or edges.json.
const FIXTURE = fileURLToPath(new URL("../../tests/fixtures/knowledge/example-pack", import.meta.url));
const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

type Json = Record<string, unknown>;
async function loadWith(change: (entities: Json[], edges: Json[]) => void) {
  const root = await mkdtemp(join(tmpdir(), "tarteel-entities-"));
  dirs.push(root);
  const dir = join(root, "example-pack");
  await cp(FIXTURE, dir, { recursive: true });
  const entities = JSON.parse(await readFile(join(dir, "entities.json"), "utf8")) as Json[];
  const edges = JSON.parse(await readFile(join(dir, "edges.json"), "utf8")) as Json[];
  change(entities, edges);
  await writeFile(join(dir, "entities.json"), JSON.stringify(entities));
  await writeFile(join(dir, "edges.json"), JSON.stringify(edges));
  return loadPackSource(dir);
}
const messages = (r: Awaited<ReturnType<typeof loadPackSource>>) => r.issues.map((i) => `${i.code}: ${i.message}`).join("\n");
const byId = (list: Json[], id: string): Json => list.find((x) => x.id === id) as Json;

test("the example entities load, with their dates and texts", async () => {
  const r = await loadWith(() => undefined);
  assert.deepEqual(r.issues, []);
  const s = r.source!;
  assert.equal(s.entities.length, 6);
  const ev = s.entities.find((e) => e.id === "ent-ev-1")!;
  assert.deepEqual(ev.date, { calendar: "ah", start: 2, end: 3, precision: "year", note: "Synthetic dating note." });
  assert.equal(ev.text.en?.name, "Synthetic gathering");
  assert.equal(s.entities.find((e) => e.id === "ent-ev-undated")!.date, undefined);
});

test("a pack without entities.json still loads", async () => {
  const root = await mkdtemp(join(tmpdir(), "tarteel-entities-"));
  dirs.push(root);
  const dir = join(root, "example-pack");
  await cp(FIXTURE, dir, { recursive: true });
  await rm(join(dir, "entities.json"));
  const edges = (JSON.parse(await readFile(join(dir, "edges.json"), "utf8")) as Json[]).filter((e) => !String(e.id).startsWith("e-ent-"));
  await writeFile(join(dir, "edges.json"), JSON.stringify(edges));
  const r = await loadPackSource(dir);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.source?.entities, []);
});

test("bad kinds, subtypes and dates are refused with the file and id named", async () => {
  const r = await loadWith((en) => {
    byId(en, "ent-ev-1").subtype = "city";
    byId(en, "ent-ev-2").date = { calendar: "julian", start: 610, precision: "approximate" };
    byId(en, "ent-per-1").date = { calendar: "ce", start: 660, end: 600, precision: "decade" };
    byId(en, "ent-pl-1").date = { calendar: "ce", start: 600, precision: "year" };
    byId(en, "ent-draft").kind = "building";
    byId(en, "ent-ev-undated").date = { calendar: "ah", start: 2.5, precision: "year" };
  });
  const m = messages(r);
  assert.equal(r.source, null);
  assert.match(m, /ent-ev-1\): subtype "city" is not one of/);
  assert.match(m, /ent-ev-2\) date: "calendar" must be one of ah, ce/);
  assert.match(m, /ent-per-1\) date: end \(600\) is before start \(660\)/);
  assert.match(m, /ent-pl-1\): a place has no date/);
  assert.match(m, /entities.json\[5\]: "kind" must be one of event, person, place/);
  assert.match(m, /ent-ev-undated\) date: "start" must be a whole year/);
});

test("'unknown' is not a precision an author can write: leave the date out instead", async () => {
  const r = await loadWith((en) => { byId(en, "ent-ev-1").date = { calendar: "ah", start: 2, precision: "unknown" }; });
  assert.match(messages(r), /"precision" must be one of year, decade, century, approximate/);
});

test("publishing rules: evidence, label, reviewed name, and a note for a disputed entity", async () => {
  const r = await loadWith((en) => {
    const a = byId(en, "ent-ev-1");
    a.supports = [];
    delete a.editorialBasis;
    byId(en, "ent-per-1").evidenceLabel = "unverified";
    byId(en, "ent-pl-1").text = { en: { name: "Synthetic city", status: "machine_draft" } };
  });
  const m = messages(r);
  assert.match(m, /entity ent-ev-1: a published entity needs a supporting passage or an editorialBasis/);
  assert.match(m, /entity ent-per-1: a published entity cannot be labelled unverified/);
  assert.match(m, /entity ent-pl-1: a published entity needs a name that is original or reviewed/);
});

test("a disputed entity needs an uncertainty note", async () => {
  const r = await loadWith((en) => { delete byId(en, "ent-ev-2").uncertaintyNote; });
  assert.match(messages(r), /ent-ev-2\): a "disputed" entity needs an uncertaintyNote/);
});

test("references: unknown passage, language not in the pack, duplicate id", async () => {
  const r = await loadWith((en) => {
    byId(en, "ent-ev-1").supports = ["p-nope"];
    byId(en, "ent-per-1").text = { fr: { name: "Synthetic", status: "original" } };
    en.push({ ...byId(en, "ent-pl-1") });
  });
  const m = messages(r);
  assert.match(m, /entity ent-ev-1: passage p-nope is not in sources.json/);
  assert.match(m, /entity ent-per-1: text in "fr"/);
  assert.match(m, /entities.json: id ent-pl-1 is used twice/);
});

test("edges to entities: must exist, match the kind, and not be published while the entity is not", async () => {
  const r = await loadWith((en, ed) => {
    ed.push({ id: "e-bad-1", type: "EVENT_AT_PLACE", fromKind: "event", fromId: "ent-ev-1", toKind: "place", toId: "ent-nope", editorialStatus: "draft", createdBy: "t" });
    ed.push({ id: "e-bad-2", type: "EVENT_AT_PLACE", fromKind: "event", fromId: "ent-per-1", toKind: "place", toId: "ent-pl-1", editorialStatus: "draft", createdBy: "t" });
    ed.push({ id: "e-bad-3", type: "EVENT_CONCERNS_AYAH", fromKind: "event", fromId: "ent-draft", toKind: "ayah", toId: "1:1", editorialStatus: "published", createdBy: "t", editorialBasis: "b" });
    void en;
  });
  const m = messages(r);
  assert.match(m, /edge e-bad-1: place ent-nope is not in entities.json/);
  assert.match(m, /edge e-bad-2: event ent-per-1 is not in entities.json \(it is a person\)/);
  assert.match(m, /edge e-bad-3: published, but event ent-draft is draft/);
});

test("an edge type used between the wrong kinds is refused", async () => {
  const r = await loadWith((_en, ed) => { ed.push({ id: "e-bad-4", type: "EVENT_AT_PLACE", fromKind: "person", fromId: "ent-per-1", toKind: "place", toId: "ent-pl-1", editorialStatus: "draft", createdBy: "t" }); });
  assert.match(messages(r), /e-bad-4\): EVENT_AT_PLACE goes from event to place, not person to place/);
});
