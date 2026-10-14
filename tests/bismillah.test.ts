// The Bismillah heading shown above surahs 2-114 (except 9) must match what the importer actually removed from the data.
// No Quran text is typed here: the checks compare the dataset with itself and with the Tanzil source it was built from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { opensWithBismillahHeading } from "@tarteel/quran-data";
import type { AyahRecord } from "@tarteel/types";
import { parseVerseLines, stripPrefixedBismillah } from "../scripts/import-tanzil/parse.ts";

const path = (rel: string): string => fileURLToPath(new URL(`../data/${rel}`, import.meta.url));
const SOURCE = path("sources/tanzil/quran-uthmani.txt");
const DATASET = path("quran/tanzil-uthmani/ayahs.json");

test("the heading is for every surah except Al-Fatihah (verse 1 IS the Bismillah) and At-Tawbah (has none)", () => {
  const headed = Array.from({ length: 114 }, (_, i) => i + 1).filter(opensWithBismillahHeading);
  assert.equal(headed.length, 112);
  assert.ok(!headed.includes(1) && !headed.includes(9));
  assert.deepEqual([headed[0], headed[headed.length - 1]], [2, 114]);
});

test("anything that is not a surah number gets no heading", () => {
  for (const n of [0, -1, 115, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(opensWithBismillahHeading(n), false, String(n));
});

test("the heading rule is exactly the set of surahs whose Bismillah the importer strips from Tanzil's text", { skip: !existsSync(SOURCE) }, async () => {
  const { stripped } = stripPrefixedBismillah(parseVerseLines(await readFile(SOURCE, "utf8")));
  const headed = Array.from({ length: 114 }, (_, i) => i + 1).filter(opensWithBismillahHeading);
  assert.deepEqual(stripped, headed);
});

test("the dataset has the Bismillah as 1:1 to draw from, and no surah's first ayah repeats it", { skip: !existsSync(DATASET) }, async () => {
  const rows = JSON.parse(await readFile(DATASET, "utf8")) as AyahRecord[];
  const first = new Map(rows.filter((r) => r.ayah === 1).map((r) => [r.surah, r.text]));
  const bismillah = first.get(1);
  assert.ok(bismillah && bismillah.length > 0, "ayah 1:1 must exist");
  for (let s = 2; s <= 114; s++) {
    assert.ok(!(first.get(s) ?? "").startsWith(bismillah), `${s}:1 must not carry the Bismillah itself, or it would show twice`);
  }
});
