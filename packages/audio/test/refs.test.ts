import { test } from "node:test";
import assert from "node:assert/strict";
import { allAyahRefs, ayahCountOf, expandRange, globalAyahNumber, isValidRef, nextAyah, surahRefs, totalAyahCount } from "../src/refs.ts";

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
