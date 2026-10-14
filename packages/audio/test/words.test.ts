import { test } from "node:test";
import assert from "node:assert/strict";
import { activeSpanAt } from "../src/timing.ts";
import { countedTokenIndices, isAnnotationToken, timingsFitText, tokenRangeForSpan } from "../src/words.ts";

// Synthetic text only: Latin placeholders for words, and a real annotation sign (U+06D6) for the pause marks.
const PAUSE = "ۖ";

test("annotation tokens are recognised, words are not", () => {
  assert.equal(isAnnotationToken(PAUSE), true);
  assert.equal(isAnnotationToken("ۖۚ"), true);
  assert.equal(isAnnotationToken("word"), false);
  assert.equal(isAnnotationToken("wordۖ"), false);
});

test("counted indices skip pause tokens and empty tokens", () => {
  assert.deepEqual(countedTokenIndices(["a", PAUSE, "b", "", "c", PAUSE]), [0, 2, 4]);
  assert.deepEqual(countedTokenIndices([]), []);
});

test("a word number lands on the right token past a pause mark", () => {
  const tokens = ["a", "b", PAUSE, "c", "d"];
  assert.deepEqual(tokenRangeForSpan(tokens, { first: 2, end: 3 }), { from: 3, to: 3 }); // not the pause token
  assert.deepEqual(tokenRangeForSpan(tokens, { first: 0, end: 1 }), { from: 0, to: 0 });
});

test("a multi-word span lights the whole run, pause marks between included", () => {
  const tokens = ["a", "b", PAUSE, "c", "d"];
  assert.deepEqual(tokenRangeForSpan(tokens, { first: 1, end: 3 }), { from: 1, to: 3 });
});

test("a span that does not fit the text lights nothing", () => {
  const tokens = ["a", PAUSE, "b"];
  assert.equal(tokenRangeForSpan(tokens, { first: 2, end: 3 }), null); // only two words
  assert.equal(tokenRangeForSpan(tokens, { first: 1, end: 4 }), null);
  assert.equal(tokenRangeForSpan(tokens, { first: 0, end: 0 }), null);
  assert.equal(tokenRangeForSpan(tokens, { first: -1, end: 1 }), null);
  assert.equal(tokenRangeForSpan(tokens, null), null);
});

test("activeSpanAt returns the run a segment covers, or null in a gap", () => {
  const segs = [
    [0, 1, 0, 500],
    [1, 3, 500, 1200],
    [3, 3, 1300, 1600], // degenerate: word 3 alone
  ] as const;
  assert.deepEqual(activeSpanAt(segs, 100), { first: 0, end: 1 });
  assert.deepEqual(activeSpanAt(segs, 500), { first: 1, end: 3 });
  assert.equal(activeSpanAt(segs, 1250), null);
  assert.deepEqual(activeSpanAt(segs, 1300), { first: 3, end: 4 });
  assert.equal(activeSpanAt(segs, 1600), null);
  assert.equal(activeSpanAt(null, 0), null);
});

test("timingsFitText refuses a table that counts more words than the text has", () => {
  const tokens = ["a", PAUSE, "b", "c"];
  assert.equal(timingsFitText(tokens, [[0, 1, 0, 1], [2, 3, 1, 2]]), true);
  assert.equal(timingsFitText(tokens, [[0, 1, 0, 1], [3, 4, 1, 2]]), false);
});
