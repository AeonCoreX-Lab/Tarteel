import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HAFS_6236 } from "@tarteel/quran-data";
import type { AyahRecord } from "@tarteel/types";
import { loadAndValidate } from "../lib/dataset-loader.ts";
import { DATASET_DIR, SOURCE_DIR, SOURCE_FILE, buildAll } from "./build.ts";
import { footnoteLabels, parseCsv, parseQuranEncCsv, textMarkers } from "./parse.ts";

// ---- unit tests: synthetic placeholder text, NOT Quran content ----

const INFO = [
  "Translation Info:", "#---------------------------", "# Translation of the meanings of the Noble Qur'an", "# Language: Testish",
  "# Translation ID: tagalog_rwwad", "# Source: https://quranenc.com", "# URL: https://quranenc.com/en/browse/tagalog_rwwad",
  "# Last update: 2025-02-05 01:31:34 (v1.1.4-csv.1)", "# Check for updates: https://quranenc.com/check/tagalog_rwwad/v1.1.4-csv.1",
  "# PLEASE DON'T REMOVE THIS IMPORTANT INFORMATION!", "#---------------------------",
];
const csv = (rows: string[], info: string[] = INFO): string => `"${info.join("\r\n")}",,,,\r\nid,sura,aya,translation,footnotes\r\n${rows.join("\r\n")}\r\n`;

test("csv reader: quoted commas, doubled quotes and line breaks; malformed quoting is an error", () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n"x\ny",,z\n'), [["a", "b,c", 'd "e"'], ["x\ny", "", "z"]]);
  assert.deepEqual(parseCsv("a,b"), [["a", "b"]]);
  assert.throws(() => parseCsv('a,"open'), /never closed/);
  assert.throws(() => parseCsv('a,"b"c'), /after a closing quote/);
  assert.throws(() => parseCsv('a,b"c"'), /inside an unquoted field/);
});

test("QuranEnc csv: info block, columns and rows are read as published", () => {
  const p = parseQuranEncCsv(csv(['1,1,1,"one[1], two","[1] note\nsecond line"', '2,1,2,"three",""']));
  assert.equal(p.info.id, "tagalog_rwwad");
  assert.equal(p.info.version, "1.1.4");
  assert.equal(p.info.updatedAt, "2025-02-05");
  assert.equal(p.info.lines.length, INFO.length);
  assert.deepEqual(p.rows, [{ surah: 1, ayah: 1, text: "one[1], two", footnotes: "[1] note\nsecond line" }, { surah: 1, ayah: 2, text: "three", footnotes: "" }]);
});

test("QuranEnc csv: anything unexpected is refused instead of guessed", () => {
  assert.throws(() => parseQuranEncCsv("id,sura,aya,translation,footnotes\r\n1,1,1,a,\r\n"), /info block/);
  assert.throws(() => parseQuranEncCsv(csv([], INFO.filter((l) => !l.startsWith("# Last update")))), /no "Last update" line/);
  assert.throws(() => parseQuranEncCsv(csv([], INFO.map((l) => l.replace("v1.1.4-csv.1)", "latest)")))), /unrecognised "Last update"/);
  assert.throws(() => parseQuranEncCsv(csv(["1,1,1,a"])), /4 fields, expected 5/);
  assert.throws(() => parseQuranEncCsv(csv(["2,1,1,a,"])), /not sequential/);
  assert.throws(() => parseQuranEncCsv(csv(["1,x,1,a,"])), /positive integers/);
  assert.throws(() => parseQuranEncCsv(csv([]).replace("id,sura,aya,translation,footnotes", "id,sura,aya,text,notes")), /expected columns/);
});

test("importer refuses a file that is not the Tagalog download or does not follow hafs-6236", () => {
  assert.throws(() => buildAll(csv(["1,1,1,a,"], INFO.map((l) => l.replace("tagalog_rwwad", "other_key")))), /wrong file/);
  assert.throws(() => buildAll(csv(["1,1,1,a,", "2,1,2,b,"])), /failed validation/);
});

test("footnote markers in a verse and labels in its footnotes are read the same way", () => {
  assert.deepEqual(textMarkers("a[1] b [word] c[12]"), ["1", "12"]);
  assert.deepEqual(footnoteLabels("[1] x\n[12] y [3] inline is not a label"), ["1", "12"]);
});

// ---- integration: committed dataset == regenerated from the untouched QuranEnc download ----

const ROOT = fileURLToPath(new URL("../../data/", import.meta.url));
const haveSource = existsSync(join(ROOT, SOURCE_DIR, SOURCE_FILE));
const source = (): Promise<string> => readFile(join(ROOT, SOURCE_DIR, SOURCE_FILE), "utf8");

test("committed dataset is exactly what the importer produces from data/sources/quranenc", { skip: !haveSource }, async () => {
  const built = buildAll(await source());
  for (const [rel, expected] of built.files) assert.equal(await readFile(join(ROOT, rel), "utf8"), expected, `${rel} differs from the importer's output (run: npm run import:quranenc)`);
  assert.equal(built.report.ayahs, 6236);
  assert.deepEqual(built.report.markerMismatches, []);
});

test("every verse is the QuranEnc text verbatim, and every footnote it points at is kept", { skip: !haveSource }, async () => {
  const rows = parseQuranEncCsv(await source()).rows;
  const ayahs = JSON.parse(await readFile(join(ROOT, DATASET_DIR, "ayahs.json"), "utf8")) as AyahRecord[];
  const notes = new Map((JSON.parse(await readFile(join(ROOT, DATASET_DIR, "footnotes.json"), "utf8")) as AyahRecord[]).map((n) => [`${n.surah}:${n.ayah}`, n.text]));
  assert.equal(ayahs.length, rows.length);
  rows.forEach((r, i) => {
    const a = ayahs[i] as AyahRecord;
    assert.deepEqual([a.surah, a.ayah, a.text], [r.surah, r.ayah, r.text]);
    assert.equal(notes.get(`${r.surah}:${r.ayah}`) ?? "", r.footnotes, `${r.surah}:${r.ayah} footnotes must be unchanged`);
  });
});

test("the dataset passes the project's own validation and carries QuranEnc's required credit", { skip: !haveSource }, async () => {
  const d = await loadAndValidate(join(ROOT, DATASET_DIR), HAFS_6236, "translation");
  assert.deepEqual(d.issues, []);
  assert.match(d.manifest.attribution, /QuranEnc\.com/);
  assert.ok(d.manifest.attribution.includes(`version ${d.manifest.version}`), "attribution must name the version");
  const info = await readFile(join(ROOT, DATASET_DIR, "QURANENC-INFO.txt"), "utf8");
  assert.match(info, /PLEASE DON'T REMOVE THIS IMPORTANT INFORMATION!/);
});
