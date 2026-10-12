import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFtsQuery, normalizeArabicForSearch, normalizeTranslationForSearch } from "../src/index.ts";

test("arabic normalisation strips marks and unifies letters (generic word, not Quran)", () => {
  // kataba with fatha marks: ك + fatha + ت + fatha + ب + fatha
  assert.equal(normalizeArabicForSearch("\u0643\u064E\u062A\u064E\u0628\u064E"), "\u0643\u062A\u0628");
  // alef variants unify
  assert.equal(normalizeArabicForSearch("\u0623\u0625\u0622\u0671"), "\u0627\u0627\u0627\u0627");
  // tatweel removed, alef maksura -> ya
  assert.equal(normalizeArabicForSearch("\u0643\u0640\u062A\u0649"), "\u0643\u062A\u064A");
});

test("fts query is quoted, prefix on last token, null when empty", () => {
  assert.equal(buildFtsQuery("light of"), '"light" "of"*');
  assert.equal(buildFtsQuery("  "), null);
  assert.equal(buildFtsQuery('a" OR b'), '"a" "OR" "b"*'); // operators neutralised
  assert.equal(buildFtsQuery("x", { prefixLast: false }), '"x"');
});

test("bengali words keep their vowel signs", () => {
  const word = "\u09AC\u09BE\u0982\u09B2\u09BE\u09DF";
  const q = buildFtsQuery("\u0986\u09AE\u09BF " + word);
  assert.equal(q, `"\u0986\u09AE\u09BF" "${word.normalize("NFC")}"*`);
  // index-side and query-side normalisation agree
  assert.equal(normalizeTranslationForSearch(word), word.normalize("NFC"));
});
