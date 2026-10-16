import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseRevelationOrder } from "./parse.ts";

// Synthetic metadata: 114 <sura> rows in the shape of Tanzil's file, with made-up names.
const xml = (orderOf: (i: number) => number | string): string =>
  `<quran>\n${Array.from({ length: 114 }, (_, k) => `<sura index="${k + 1}" ayas="3" name="n" tname="t" ename="e" type="Meccan" order="${orderOf(k + 1)}" rukus="1" />`).join("\n")}\n</quran>`;

test("revelation order: 114 values that are exactly 1..114", () => {
  const rows = parseRevelationOrder(xml((i) => 115 - i));
  assert.equal(rows.length, 114);
  assert.deepEqual(rows[0], { surah: 1, order: 114 });
  assert.deepEqual(rows[113], { surah: 114, order: 1 });
});

test("revelation order refuses repeats, gaps, non-numbers, a wrong count and a wrong index", () => {
  assert.throws(() => parseRevelationOrder(xml((i) => (i === 2 ? 1 : i))), /exactly 1\.\.114/);
  assert.throws(() => parseRevelationOrder(xml((i) => (i === 114 ? 200 : i))), /exactly 1\.\.114/);
  assert.throws(() => parseRevelationOrder(xml((i) => (i === 5 ? "x" : i))), /not an integer/);
  assert.throws(() => parseRevelationOrder("<quran></quran>"), /expected 114/);
  assert.throws(() => parseRevelationOrder(xml((i) => i).replace('index="3"', 'index="4"')), /not sequential/);
});

const REAL = fileURLToPath(new URL("../../data/sources/tanzil/quran-data.xml", import.meta.url));
test("the committed Tanzil metadata gives a valid revelation order", { skip: !existsSync(REAL) }, async () => {
  const rows = parseRevelationOrder(await readFile(REAL, "utf8"));
  assert.equal(rows.length, 114);
});
