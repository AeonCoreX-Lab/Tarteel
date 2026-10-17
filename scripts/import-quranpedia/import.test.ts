import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_ID, EDITION_ID, LICENSE_ID, PACK_ID, convertBook, globalAyah, htmlToText, sameContent } from "./convert.ts";
import type { BookDump, QuranpediaManifest } from "./convert.ts";
import { loadPackSource } from "../build-pack/source.ts";

// Synthetic text only: no real source text in these tests.

const NAME = "asbab-book-2919.json.gz";
const SHA = "a".repeat(64);
const manifest: QuranpediaManifest = { version: "2099-01-01", generated_at: "2099-01-01T00:00:00+00:00", files: [{ name: NAME, dataset: "asbab-book-2919", sha256: SHA, built_at: "2098-12-31T00:00:00+00:00" }] };
const row = (surah: number, ayah: number, text: string, page: number, ayahs: string, part = "1") => ({ surah, ayah, content: [{ text, part, page, ayahs }] });
const dumpOf = (ayahs: BookDump["ayahs"]): BookDump => ({ book: { id: BOOK_ID, name: "synthetic title" }, ayahs });
const convert = (dump: BookDump, over: { sha?: string } = {}) => convertBook({ manifest, sourceName: NAME, sourceSha256: over.sha ?? SHA, dump });

test("htmlToText: line breaks and known wrappers go, words stay, unknown markup stops the import", () => {
  assert.equal(htmlToText("one<br />\r\ntwo <span class=\"book-ayah text-primary\">(x)</span> <strong>y</strong>"), "one\ntwo (x) y");
  assert.equal(htmlToText("  a\r\n\r\n\r\n\r\nb  "), "a\n\nb");
  assert.throws(() => htmlToText("a <em>b</em>"), /unhandled markup/);
  assert.throws(() => htmlToText("a &amp; b"), /unhandled markup/);
});

test("globalAyah follows the Hafs numbering", () => {
  assert.equal(globalAyah(1, 1), 1);
  assert.equal(globalAyah(2, 1), 8);
  assert.equal(globalAyah(114, 6), 6236);
});

test("one passage per distinct page and text, one edge per ayah row, ids stable and sorted", () => {
  const same = "synthetic passage A";
  const { files, report } = convert(dumpOf([
    row(2, 5, same, 7, "12,13"), row(2, 6, same, 7, "12,13"),
    row(2, 9, "synthetic passage B", 7, "16"),
    row(1, 1, "synthetic passage C", 3, "1"),
  ]));
  assert.equal(report.rows, 4);
  assert.equal(report.passages, 3);
  assert.equal(report.edges, 4);
  assert.equal(report.disagreements.length, 0);
  const sources = JSON.parse(files.get("sources.json") ?? "") as { passages: { id: string; page: string; volume: string; quote: string; quoteLanguage: string }[] };
  assert.deepEqual(sources.passages.map((p) => p.id), ["qp2919-v1-p3-1", "qp2919-v1-p7-1", "qp2919-v1-p7-2"]);
  assert.deepEqual(sources.passages.map((p) => p.quote), ["synthetic passage C", "synthetic passage A", "synthetic passage B"]);
  assert.ok(sources.passages.every((p) => p.quoteLanguage === "ar" && p.volume === "1"));
  const edges = JSON.parse(files.get("edges.json") ?? "") as { fromId: string; toId: string; type: string; editorialStatus: string; passages: string[] }[];
  assert.deepEqual(edges.map((e) => `${e.fromId}>${e.toId}`), ["qp2919-v1-p3-1>1:1", "qp2919-v1-p7-1>2:5", "qp2919-v1-p7-1>2:6", "qp2919-v1-p7-2>2:9"]);
  assert.ok(edges.every((e) => e.type === "REPORT_REFERENCES_AYAH" && e.editorialStatus === "published" && e.passages.length === 1));
  assert.equal(files.get("claims.json"), "[]\n"); // the importer never writes a claim
});

test("the same text on another page is another passage", () => {
  const { report } = convert(dumpOf([row(1, 1, "same", 1, "1"), row(1, 2, "same", 2, "2")]));
  assert.equal(report.passages, 2);
});

test("the passage's own ayah list is compared, not used: a different list is reported and the rows win", () => {
  const ok = convert(dumpOf([row(2, 1, "t", 1, "8"), row(2, 2, "t", 1, "8")])); // global numbers 8,9 but the rows say 2:1 and 2:2
  assert.equal(ok.report.disagreements.length, 1);
  assert.equal(ok.report.edges, 2);
  const local = convert(dumpOf([row(1, 1, "u", 1, "1,2"), row(1, 2, "u", 1, "1,2")]));
  assert.equal(local.report.disagreements.length, 0); // local numbers are accepted too
  const global = convert(dumpOf([row(2, 1, "v", 1, "8"), row(2, 2, "v", 1, "8,9")]));
  assert.equal(global.report.disagreements.length, 1);
  const exact = convert(dumpOf([row(2, 1, "w", 1, "8,9"), row(2, 2, "w", 1, "8,9")]));
  assert.equal(exact.report.disagreements.length, 0);
});

test("it refuses what it cannot vouch for", () => {
  assert.throws(() => convert(dumpOf([row(1, 1, "x", 1, "1")]), { sha: "b".repeat(64) }), /sha256/);
  assert.throws(() => convertBook({ manifest, sourceName: "other.json.gz", sourceSha256: SHA, dump: dumpOf([row(1, 1, "x", 1, "1")]) }), /does not list/);
  assert.throws(() => convertBook({ manifest, sourceName: NAME, sourceSha256: SHA, dump: { ...dumpOf([row(1, 1, "x", 1, "1")]), book: { id: 460, name: "other book" } } }), /expected book 2919/);
  assert.throws(() => convert(dumpOf([row(1, 8, "x", 1, "8")])), /not an ayah/);
  assert.throws(() => convert(dumpOf([row(115, 1, "x", 1, "1")])), /not an ayah/);
  assert.throws(() => convert(dumpOf([row(1, 1, "<em>x</em>", 1, "1")])), /unhandled markup/);
  assert.throws(() => convert(dumpOf([row(1, 1, "<br />", 1, "1")])), /empty/);
  assert.throws(() => convert(dumpOf([])), /no ayahs/);
});

test("the generated files carry the credit and the dump version", () => {
  const { files } = convert(dumpOf([row(1, 1, "t", 1, "1")]));
  const lic = JSON.parse(files.get("licenses.json") ?? "") as { id: string; attribution: string; redistribution: string }[];
  assert.equal(lic[0]?.id, LICENSE_ID);
  assert.equal(lic[0]?.redistribution, "yes");
  assert.match(lic[0]?.attribution ?? "", /quranpedia\.net/);
  assert.match(lic[0]?.attribution ?? "", /2099-01-01/);
  assert.match(files.get("PROVENANCE.md") ?? "", /2099-01-01/);
  assert.match(files.get("PROVENANCE.md") ?? "", new RegExp(SHA));
  assert.match(files.get("sources.json") ?? "", new RegExp(EDITION_ID));
});

test("what it writes loads as a pack: the real loader accepts it", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "qp-"));
  try {
    const dir = join(root, PACK_ID);
    await mkdir(dir);
    const { files } = convert(dumpOf([row(2, 5, "t1", 7, "12"), row(2, 6, "t2", 7, "13"), row(1, 1, "t1", 7, "12")]));
    for (const [name, content] of files) await writeFile(join(dir, name), content);
    const { source, issues } = await loadPackSource(dir);
    assert.deepEqual(issues, []);
    assert.equal(source?.passages.length, 2); // t1 is one passage listed under two ayahs, t2 another
    assert.equal(source?.edges.length, 3);
    assert.equal(source?.claims.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the committed pack, when present, still loads", async () => {
  const dir = fileURLToPath(new URL(`../../data/knowledge/${PACK_ID}`, import.meta.url));
  if (!existsSync(dir)) return;
  const { source, issues } = await loadPackSource(dir);
  assert.deepEqual(issues, []);
  assert.equal(source?.claims.length, 0);
  assert.ok((source?.edges.length ?? 0) > 0);
  assert.ok(source?.edges.every((e) => e.type === "REPORT_REFERENCES_AYAH" && e.fromKind === "source_passage"));
});

test("pack version: 1 by default, a later one says so in the changelog, and only passages and links count as content", () => {
  const base = dumpOf([row(1, 1, "t", 1, "1")]);
  const v1 = convert(base);
  assert.equal((JSON.parse(v1.files.get("pack.json") ?? "") as { packVersion: number }).packVersion, 1);
  const v2 = convertBook({ manifest: { ...manifest, version: "2099-02-01" }, sourceName: NAME, sourceSha256: SHA, dump: base, packVersion: 2 });
  const meta = JSON.parse(v2.files.get("pack.json") ?? "") as { packVersion: number; changelog: string };
  assert.equal(meta.packVersion, 2);
  assert.match(meta.changelog, /^Version 2: re-imported/);
  assert.equal(sameContent(v1.files, v2.files), true, "a newer dump with the same passages is the same content");
  const changed = convert(dumpOf([row(1, 1, "t, corrected", 1, "1")]));
  assert.equal(sameContent(v1.files, changed.files), false);
  const moreLinks = convert(dumpOf([row(1, 1, "t", 1, "1"), row(1, 2, "t", 1, "1")]));
  assert.equal(sameContent(v1.files, moreLinks.files), false);
  assert.throws(() => convertBook({ manifest, sourceName: NAME, sourceSha256: SHA, dump: base, packVersion: 0 }), /packVersion/);
});
