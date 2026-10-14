import { test } from "node:test";
import assert from "node:assert/strict";
import { followTarget } from "../src/follow.ts";

const base = { following: true, playing: true, active: { surahId: 2, ayahNumber: 5 }, surahId: 2, lastScrolled: -1 };

test("follows the recited ayah of this surah", () => {
  assert.equal(followTarget(base), 4);
});

test("does not scroll twice to the same ayah", () => {
  assert.equal(followTarget({ ...base, lastScrolled: 4 }), null);
  assert.equal(followTarget({ ...base, active: { surahId: 2, ayahNumber: 6 }, lastScrolled: 4 }), 5);
});

test("stays put when the reader has taken over, when paused, or when it is another surah", () => {
  assert.equal(followTarget({ ...base, following: false }), null);
  assert.equal(followTarget({ ...base, playing: false }), null);
  assert.equal(followTarget({ ...base, surahId: 3 }), null);
  assert.equal(followTarget({ ...base, active: null }), null);
});

test("the Bismillah (ayah 0) has no row to scroll to", () => {
  assert.equal(followTarget({ ...base, active: { surahId: 2, ayahNumber: 0 }, lastScrolled: 7 }), null);
  assert.equal(followTarget({ ...base, active: { surahId: 2, ayahNumber: 0 } }), null);
});
