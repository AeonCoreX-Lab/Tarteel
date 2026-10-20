import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { convert, parseSeeds } from "./convert.ts";
import { syncWikidata } from "./sync.ts";
import { loadPackSource } from "../build-pack/source.ts";

// Everything here is invented: made-up item numbers, names and dates in Wikidata's answer format.

const time = (t: string, precision: number, calendar = "Q1985727") => ({ time: t, precision, calendarmodel: `http://www.wikidata.org/entity/${calendar}` });
const stmt = (value: unknown, extra: Record<string, unknown> = {}) => ({ rank: "normal", mainsnak: { snaktype: "value", datavalue: { value } }, ...extra });
const labels = (en: string, extra: Record<string, string> = {}) => Object.fromEntries(Object.entries({ en, ...extra }).map(([l, v]) => [l, { language: l, value: v }]));

const seeds = (items: unknown[]) => parseSeeds({ items });
const answer = (entities: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ entities, ...extra });

test("parseSeeds: accepts good seeds, refuses every mistake", () => {
  assert.deepEqual(seeds([{ qid: "Q1", kind: "person", subtype: "scholar", note: " why " }, { qid: "Q2", kind: "place" }]), [{ qid: "Q1", kind: "person", subtype: "scholar", note: "why" }, { qid: "Q2", kind: "place" }]);
  assert.throws(() => seeds([{ qid: "Q1", kind: "person" }, { qid: "Q1", kind: "person" }]), /twice/);
  assert.throws(() => seeds([{ qid: "x1", kind: "person" }]), /qid/);
  assert.throws(() => seeds([{ qid: "Q1", kind: "animal" }]), /kind/);
  assert.throws(() => seeds([{ qid: "Q1", kind: "person", subtype: "battle" }]), /subtype/);
  assert.throws(() => parseSeeds({}), /items/);
});

test("a person: names in three languages, birth and death, always a draft", () => {
  const a = answer({ Q10: { id: "Q10", lastrevid: 99, labels: labels("Invented Person", { ar: "شخص", bn: "ব্যক্তি" }), descriptions: labels("an invented person"), claims: { P569: [stmt(time("+0570-00-00T00:00:00Z", 9))], P570: [stmt(time("+0632-06-08T00:00:00Z", 11))] } } });
  const { drafts, problems } = convert(a, seeds([{ qid: "Q10", kind: "person", subtype: "companion" }]), "2026-10-19");
  assert.deepEqual(problems, []);
  const d = drafts[0]!;
  assert.equal(d.id, "wd-q10");
  assert.equal(d.editorialStatus, "draft");
  assert.equal(d.evidenceLabel, "unverified");
  assert.deepEqual(d.supports, []);
  assert.deepEqual(Object.keys(d.text).sort(), ["ar", "bn", "en"]);
  assert.equal(d.text.en?.status, "machine_draft");
  assert.equal(d.text.en?.summary, "an invented person");
  assert.equal(d.text.ar?.summary, undefined);
  assert.deepEqual(d.date, { calendar: "ce", start: 570, end: 632, precision: "year", note: "As stated on Wikidata (Gregorian calendar). Not checked against a source." });
  assert.match(d.editorialBasis, /Wikidata Q10 on 2026-10-19, revision 99 \(CC0\)\. Not reviewed/);
});

test("dates are never more exact than Wikidata says", () => {
  const one = (claims: unknown) => convert(answer({ Q1: { labels: labels("X"), claims } }), seeds([{ qid: "Q1", kind: "event" }]), "d").drafts[0]!;
  assert.deepEqual(one({ P585: [stmt(time("+0620-01-01T00:00:00Z", 8))] }).date?.precision, "decade");
  assert.equal(one({ P585: [stmt(time("+0627-01-01T00:00:00Z", 8))] }).date?.start, 620, "a decade starts on its first year");
  assert.equal(one({ P585: [stmt(time("+0700-00-00T00:00:00Z", 7))] }).date?.precision, "century");
  assert.equal(one({ P585: [stmt(time("-3000-00-00T00:00:00Z", 6))] }).date, undefined, "vaguer than a century: no date");
  assert.equal(one({ P585: [stmt(time("+0622-07-16T00:00:00Z", 11))] }).date?.precision, "year", "a day is written as its year only");
  const circa = one({ P585: [stmt(time("+0622-00-00T00:00:00Z", 9), { qualifiers: { P1480: [{}] } })] });
  assert.equal(circa.date?.precision, "approximate", "a sourcing-circumstances qualifier means uncertain");
});

test("an event with a start and an end; a mixed pair is approximate; an end before the start is dropped", () => {
  const one = (claims: unknown) => convert(answer({ Q1: { labels: labels("X"), claims } }), seeds([{ qid: "Q1", kind: "event" }]), "d").drafts[0]!;
  const span = one({ P580: [stmt(time("+0624-00-00T00:00:00Z", 9))], P582: [stmt(time("+0625-00-00T00:00:00Z", 9))] }).date;
  assert.equal(span?.start, 624);
  assert.equal(span?.end, 625);
  assert.equal(one({ P580: [stmt(time("+0624-00-00T00:00:00Z", 9))], P582: [stmt(time("+0630-00-00T00:00:00Z", 8))] }).date?.precision, "approximate");
  const backwards = one({ P580: [stmt(time("+0630-00-00T00:00:00Z", 9))], P582: [stmt(time("+0624-00-00T00:00:00Z", 9))] });
  assert.equal(backwards.date?.end, undefined);
  assert.match(backwards.editorialBasis, /end date is before the start date/);
});

test("several different dates: none is chosen; preferred rank wins; deprecated never counts; Julian is named", () => {
  const one = (claims: unknown) => convert(answer({ Q1: { labels: labels("X"), claims } }), seeds([{ qid: "Q1", kind: "person" }]), "d").drafts[0]!;
  const two = one({ P569: [stmt(time("+0570-00-00T00:00:00Z", 9)), stmt(time("+0571-00-00T00:00:00Z", 9))] });
  assert.equal(two.date, undefined);
  assert.match(two.editorialBasis, /P569 lists several different dates/);
  const pref = one({ P569: [stmt(time("+0570-00-00T00:00:00Z", 9)), { ...stmt(time("+0571-00-00T00:00:00Z", 9)), rank: "preferred" }] });
  assert.equal(pref.date?.start, 571);
  const dep = one({ P569: [{ ...stmt(time("+0999-00-00T00:00:00Z", 9)), rank: "deprecated" }] });
  assert.equal(dep.date, undefined);
  const jul = one({ P569: [stmt(time("+0570-00-00T00:00:00Z", 9, "Q1985786"))] });
  assert.match(jul.date!.note, /Julian/);
  const unknown = one({ P569: [{ rank: "normal", mainsnak: { snaktype: "somevalue" } }] });
  assert.equal(unknown.date, undefined);
});

test("a place never gets a date", () => {
  const d = convert(answer({ Q1: { labels: labels("Invented Place"), claims: { P571: [stmt(time("+0100-00-00T00:00:00Z", 9))], P585: [stmt(time("+0100-00-00T00:00:00Z", 9))] } } }), seeds([{ qid: "Q1", kind: "place", subtype: "city" }]), "d").drafts[0]!;
  assert.equal(d.date, undefined);
  assert.equal(d.subtype, "city");
});

test("problems are reported, not hidden: missing item, no usable name, merged item", () => {
  const r = convert(
    answer({ Q1: { id: "Q1", missing: "" }, Q2: { labels: { fr: { language: "fr", value: "seulement" } } }, Q3: { id: "Q9", labels: labels("Merged"), redirects: { from: "Q3", to: "Q9" } } }),
    seeds([{ qid: "Q1", kind: "person" }, { qid: "Q2", kind: "person" }, { qid: "Q3", kind: "person" }]),
    "d",
  );
  assert.equal(r.drafts.length, 1);
  assert.match(r.drafts[0]!.editorialBasis, /merged into Q9/);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join("\n"), /Q1: not found/);
  assert.match(r.problems.join("\n"), /Q2: has no name/);
  assert.equal(convert({}, seeds([{ qid: "Q1", kind: "person" }]), "d").problems.length, 1);
});

test("sync: batches of 50, one request at a time with a pause, stops on an error without partial output", async () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ qid: `Q${i + 1}`, kind: "place" }));
  const urls: string[] = [];
  const pauses: number[] = [];
  const get = async (url: string) => {
    urls.push(url);
    const ids = decodeURIComponent(/ids=([^&]+)/.exec(url)![1]!).split("|");
    return { status: 200, body: JSON.stringify(answer(Object.fromEntries(ids.map((id) => [id, { labels: labels(`Place ${id}`) }])))) };
  };
  const r = await syncWikidata({ seeds: { items }, get, retrieved: "d", sleep: async (ms) => { pauses.push(ms); } });
  assert.equal(r.drafts.length, 120);
  assert.equal(r.requests, 3);
  assert.deepEqual(pauses, [1000, 1000]);
  assert.match(urls[0]!, /maxlag=5/);
  await assert.rejects(syncWikidata({ seeds: { items }, get: async () => ({ status: 503, body: "" }), retrieved: "d" }), /503/);
  await assert.rejects(syncWikidata({ seeds: { items }, get: async () => ({ status: 200, body: "{\"error\":{\"code\":\"maxlag\"}}" }), retrieved: "d" }), /maxlag/);
  await assert.rejects(syncWikidata({ seeds: { items }, get: async () => ({ status: 200, body: "<html>" }), retrieved: "d" }), /not JSON/);
});

const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

test("the candidates load in the real pack loader, and cannot be published as they are", async () => {
  const a = answer({ Q10: { labels: labels("Invented Person"), claims: { P569: [stmt(time("+0570-00-00T00:00:00Z", 9))] } }, Q11: { labels: labels("Invented Place") } });
  const { drafts } = convert(a, seeds([{ qid: "Q10", kind: "person", subtype: "scholar" }, { qid: "Q11", kind: "place", subtype: "city" }]), "2026-10-19");
  const root = await mkdtemp(join(tmpdir(), "tarteel-wd-"));
  dirs.push(root);
  const dir = join(root, "example-pack");
  await cp(fileURLToPath(new URL("../../tests/fixtures/knowledge/example-pack", import.meta.url)), dir, { recursive: true });
  const edges = (JSON.parse(await readFile(join(dir, "edges.json"), "utf8")) as { id: string }[]).filter((e) => !e.id.startsWith("e-ent-"));
  await writeFile(join(dir, "edges.json"), JSON.stringify(edges));
  await writeFile(join(dir, "entities.json"), JSON.stringify(drafts));
  const ok = await loadPackSource(dir);
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.source?.entities.length, 2);
  // A person who flips one to published without a source or a reviewed name is stopped by the build's own rules.
  const forced = drafts.map((d) => ({ ...d, editorialStatus: "published", evidenceLabel: "source_reported" }));
  await writeFile(join(dir, "entities.json"), JSON.stringify(forced));
  const bad = await loadPackSource(dir);
  assert.ok(bad.issues.some((i) => i.code === "source-publish"), bad.issues.map((i) => i.message).join("\n"));
});
