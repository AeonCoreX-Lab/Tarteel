import { test } from "node:test";
import assert from "node:assert/strict";
import { opensWithBismillahHeading } from "@tarteel/quran-data";
import { allAyahRefs, audioRefOf, ayahCountOf, basmalahRef, expandRange, globalAyahNumber, isBasmalahRef, isValidRef, nextAyah, sameRef, surahRefs, totalAyahCount, withBasmalah } from "../src/refs.ts";

test("counts follow the Hafs 6236 numbering", () => {
  assert.equal(totalAyahCount(), 6236);
  assert.equal(ayahCountOf(1), 7);
  assert.equal(ayahCountOf(2), 286);
  assert.equal(ayahCountOf(114), 6);
  assert.equal(ayahCountOf(0), 0);
  assert.equal(ayahCountOf(115), 0);
  assert.equal(allAyahRefs().length, 6236);
});

test("validates references", () => {
  assert.equal(isValidRef({ surahId: 2, ayahNumber: 286 }), true);
  assert.equal(isValidRef({ surahId: 2, ayahNumber: 287 }), false);
  assert.equal(isValidRef({ surahId: 2, ayahNumber: 0 }), false);
  assert.equal(isValidRef({ surahId: 115, ayahNumber: 1 }), false);
  assert.equal(isValidRef({ surahId: 1.5, ayahNumber: 1 }), false);
});

test("nextAyah crosses surah boundaries and ends at the last ayah", () => {
  assert.deepEqual(nextAyah({ surahId: 1, ayahNumber: 7 }), { surahId: 2, ayahNumber: 1 });
  assert.deepEqual(nextAyah({ surahId: 1, ayahNumber: 3 }), { surahId: 1, ayahNumber: 4 });
  assert.equal(nextAyah({ surahId: 114, ayahNumber: 6 }), null);
  assert.equal(nextAyah({ surahId: 200, ayahNumber: 1 }), null);
});

test("expandRange is ordered, crosses surahs, and guards bad input", () => {
  assert.equal(expandRange({ surahId: 1, ayahNumber: 5 }, { surahId: 2, ayahNumber: 2 }).length, 5); // 1:5 1:6 1:7 2:1 2:2
  assert.deepEqual(expandRange({ surahId: 112, ayahNumber: 1 }, { surahId: 112, ayahNumber: 1 }), [{ surahId: 112, ayahNumber: 1 }]);
  // inverted range plays just the start
  assert.deepEqual(expandRange({ surahId: 3, ayahNumber: 5 }, { surahId: 3, ayahNumber: 2 }), [{ surahId: 3, ayahNumber: 5 }]);
  // invalid end plays just the start; invalid start plays nothing
  assert.equal(expandRange({ surahId: 3, ayahNumber: 5 }, { surahId: 3, ayahNumber: 999 }).length, 1);
  assert.deepEqual(expandRange({ surahId: 3, ayahNumber: 999 }, { surahId: 3, ayahNumber: 1000 }), []);
  assert.equal(surahRefs(2).length, 286);
  assert.deepEqual(surahRefs(0), []);
});

test("globalAyahNumber counts through the whole book", () => {
  assert.equal(globalAyahNumber({ surahId: 1, ayahNumber: 1 }), 1);
  assert.equal(globalAyahNumber({ surahId: 1, ayahNumber: 7 }), 7);
  assert.equal(globalAyahNumber({ surahId: 2, ayahNumber: 1 }), 8);
  assert.equal(globalAyahNumber({ surahId: 114, ayahNumber: 6 }), totalAyahCount());
  assert.equal(globalAyahNumber({ surahId: 1, ayahNumber: 8 }), null);
  assert.equal(globalAyahNumber({ surahId: 115, ayahNumber: 1 }), null);
});

const rr = (s: number, a: number) => ({ surahId: s, ayahNumber: a });
const keys = (refs: readonly { surahId: number; ayahNumber: number }[]) => refs.map((x) => `${x.surahId}:${x.ayahNumber}`);

test("the Bismillah is recited for exactly the surahs the reader shows it as a heading for", () => {
  for (let s = 1; s <= 114; s++) assert.equal(isBasmalahRef(basmalahRef(s)), opensWithBismillahHeading(s), `surah ${s}`);
  assert.equal(isBasmalahRef(rr(2, 1)), false, "an ayah is not a Bismillah");
  assert.equal(isBasmalahRef(null), false);
});

test("a Bismillah plays the recording of 1:1; every other ayah plays its own", () => {
  assert.deepEqual(audioRefOf(basmalahRef(112)), rr(1, 1));
  assert.deepEqual(audioRefOf(rr(112, 1)), rr(112, 1));
  assert.deepEqual(audioRefOf(basmalahRef(9)), rr(9, 0), "At-Tawbah has none, so nothing is remapped");
  assert.equal(isValidRef(basmalahRef(112)), false, "ayah 0 is not an ayah of the surah");
});

test("withBasmalah puts it in front of a surah's first ayah, once per entry into the surah", () => {
  assert.deepEqual(keys(withBasmalah([rr(112, 1), rr(112, 2)])), ["112:0", "112:1", "112:2"]);
  assert.deepEqual(keys(withBasmalah([rr(112, 3), rr(112, 4)])), ["112:3", "112:4"], "mid-surah: none");
  assert.deepEqual(keys(withBasmalah([rr(1, 7), rr(2, 1), rr(2, 2)])), ["1:7", "2:0", "2:1", "2:2"]);
  assert.deepEqual(keys(withBasmalah([rr(1, 1), rr(1, 2)])), ["1:1", "1:2"], "al-Fatihah: ayah 1 IS the Bismillah");
  assert.deepEqual(keys(withBasmalah([rr(8, 75), rr(9, 1), rr(9, 2)])), ["8:75", "9:1", "9:2"], "At-Tawbah has none");
  assert.deepEqual(keys(withBasmalah([rr(112, 1), rr(112, 1), rr(112, 2)])), ["112:0", "112:1", "112:1", "112:2"], "a repeated ayah 1 does not repeat it");
  assert.deepEqual(keys(withBasmalah([rr(112, 1), rr(112, 2), rr(112, 1), rr(112, 2)])), ["112:0", "112:1", "112:2", "112:0", "112:1", "112:2"], "a repeated pass starts with it again");
  assert.deepEqual(keys(withBasmalah([rr(112, 1)], false)), ["112:1"], "disabled for a recording that already holds it");
  assert.deepEqual(withBasmalah([]), []);
});

test("withBasmalah does not reuse the input array or mutate it", () => {
  const input = [rr(112, 1)];
  const out = withBasmalah(input);
  assert.equal(input.length, 1);
  assert.equal(sameRef(out[1], input[0]), true);
});
