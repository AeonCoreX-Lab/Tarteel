import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HAFS_6236 } from "@tarteel/quran-data";
import type { AyahMetaRecord, AyahRecord } from "@tarteel/types";
import { loadAndValidate } from "../lib/dataset-loader.ts";
import { SOURCE_DIR, SOURCE_FILES, buildAll } from "./build.ts";
import { buildAyahMeta, commentBlock, isoFromTanzilDate, parseMarkers, parseSurahs, parseVerseLines, stripPrefixedBismillah } from "./parse.ts";

// ---- unit tests: synthetic placeholder text, NOT Quran content ----

test("verse lines: comments and blanks are skipped, anything else is an error", () => {
  assert.deepEqual(parseVerseLines("# c\n\n1|1|a b\r\n1|2|c|d\n"), [{ surah: 1, ayah: 1, text: "a b" }, { surah: 1, ayah: 2, text: "c|d" }]);
  assert.throws(() => parseVerseLines("1|1|a\nnot a verse\n"), /expected "surah\|ayah\|text"/);
  assert.equal(commentBlock("1|1|a\n# x \n# y\n"), "# x \n# y\n");
  assert.equal(isoFromTanzilDate("April 30, 2011"), "2011-04-30");
  assert.throws(() => isoFromTanzilDate("30/04/2011"));
});

const rec = (surah: number, ayah: number, text: string): AyahRecord => ({ surah, ayah, text });

test("bismillah strip: exact prefix and the known extra-shadda variant are removed, only from ayah 1", () => {
  const r = stripPrefixedBismillah([
    rec(1, 1, "BISM"), rec(1, 2, "one"), rec(2, 1, "BISM alpha"), rec(2, 2, "BISM kept: not a first ayah"),
    rec(9, 1, "gamma"), rec(95, 1, "B\u0651ISM delta"),
  ]);
  assert.deepEqual(r.ayahs.map((a) => a.text), ["BISM", "one", "alpha", "BISM kept: not a first ayah", "gamma", "delta"]);
  assert.deepEqual(r.stripped, [2, 95]);
  assert.deepEqual(r.variants, [95]);
});

test("bismillah strip refuses to guess", () => {
  assert.throws(() => stripPrefixedBismillah([rec(1, 1, "BISM"), rec(3, 1, "no prefix here")]), /refusing to guess/);
  assert.throws(() => stripPrefixedBismillah([rec(1, 1, "BISM"), rec(9, 1, "BISM leaked")]), /9:1 unexpectedly/);
  assert.throws(() => stripPrefixedBismillah([rec(1, 1, "BISM"), rec(4, 1, "BISM ")]), /empty|refusing/);
  assert.throws(() => stripPrefixedBismillah([rec(2, 1, "x")]), /missing/);
});

test("metadata markers: juz / quarter / page / sajdah are assigned by start position", () => {
  const xml = `<quran><suras><sura index="1" ayas="2" name="a" tname="b" ename="c" type="Meccan"/></suras></quran>`;
  assert.throws(() => parseSurahs(xml), /expected 114/);
  const mk = (tag: string, n: number, at: (i: number) => [number, number]): string =>
    `<${tag}s>` + Array.from({ length: n }, (_v, i) => { const [s, a] = at(i); return `<${tag} index="${i + 1}" sura="${s}" aya="${a}" />`; }).join("") + `</${tag}s>`;
  // 30 juz / 240 quarters / 604 pages, all but the first starting in "surah 2" at ayahs 10, 20, ...: synthetic positions
  const xml2 = mk("juz", 30, (i) => (i === 0 ? [1, 1] : [2, 10 + i])) + mk("quarter", 240, (i) => (i === 0 ? [1, 1] : [2, 10 + (i % 200)] ).slice(0) as [number, number]);
  assert.throws(() => parseMarkers(xml2)); // not strictly increasing: rejected
  const ok = mk("juz", 30, (i) => (i === 0 ? [1, 1] : [2, 1 + i])) + mk("quarter", 240, (i) => (i === 0 ? [1, 1] : [2 + Math.floor(i / 100), 1 + (i % 100)])) +
    mk("page", 604, (i) => (i === 0 ? [1, 1] : [2 + Math.floor(i / 300), 1 + (i % 300)])) + `<sajdas><sajda index="1" sura="2" aya="3" type="obligatory" /></sajdas>`;
  const m = parseMarkers(ok);
  const meta: AyahMetaRecord[] = buildAyahMeta([rec(1, 1, "x"), rec(2, 1, "x"), rec(2, 2, "x"), rec(2, 3, "x")], m);
  assert.deepEqual(meta.map((x) => [x.juz, x.sajdah ?? null]), [[1, null], [1, null], [2, null], [3, "obligatory"]]);
  assert.throws(() => buildAyahMeta([rec(1, 1, "x")], m), /does not match any ayah/);
});

// ---- integration: committed datasets == regenerated from the untouched Tanzil downloads ----

const ROOT = fileURLToPath(new URL("../../data/", import.meta.url));
const haveSources = existsSync(join(ROOT, SOURCE_DIR, SOURCE_FILES.quran));
const src = (name: string): Promise<string> => readFile(join(ROOT, SOURCE_DIR, name), "utf8");

test("committed datasets are exactly what the importer produces from data/sources/tanzil", { skip: !haveSources }, async () => {
  const built = buildAll({ quran: await src(SOURCE_FILES.quran), metadata: await src(SOURCE_FILES.metadata), bn: await src(SOURCE_FILES.bn), en: await src(SOURCE_FILES.en) });
  for (const [rel, expected] of built.files) assert.equal(await readFile(join(ROOT, rel), "utf8"), expected, `${rel} differs from the importer's output (run: npm run import:tanzil)`);
  assert.equal(built.report.ayahs, 6236);
  assert.equal(built.report.stripped.length, 112);
  assert.deepEqual(built.report.variants, [95, 97]);
});

test("Quran text is the Tanzil text, verse for verse, minus only the prepended Bismillah", { skip: !haveSources }, async () => {
  const source = parseVerseLines(await src(SOURCE_FILES.quran));
  const dataset = JSON.parse(await readFile(join(ROOT, "quran/tanzil-uthmani/ayahs.json"), "utf8")) as AyahRecord[];
  const bism = (source.find((a) => a.surah === 1 && a.ayah === 1) as AyahRecord).text;
  assert.equal(dataset.length, 6236);
  source.forEach((s, i) => {
    const d = dataset[i] as AyahRecord;
    assert.deepEqual([d.surah, d.ayah], [s.surah, s.ayah]);
    if (s.ayah !== 1 || s.surah === 1 || s.surah === 9) assert.equal(d.text, s.text, `${s.surah}:${s.ayah} must be unchanged`);
    else assert.ok(s.text.endsWith(" " + d.text) && s.text.length - d.text.length - 1 >= bism.length, `${s.surah}:1 must be the source with only its prefix removed`);
  });
});

test("every committed dataset passes the project's own validation (hashes, numbering, manifest)", { skip: !haveSources }, async () => {
  for (const [dir, kind] of [["quran/tanzil-uthmani", "quran"], ["translations/bn-muhiuddin-khan", "translation"], ["translations/en-saheeh-international", "translation"]] as const) {
    const d = await loadAndValidate(join(ROOT, dir), HAFS_6236, kind);
    assert.deepEqual(d.issues, [], dir);
  }
});
