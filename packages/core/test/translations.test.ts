import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTranslations, splitTranslations } from "../src/index.ts";

const t = (id: string, language: string, languageName: string) => ({ id, language, languageName });
const seven = [
  t("zh-majian", "zh", "Chinese (Traditional)"), t("tl-rowwad", "tl", "Filipino"), t("fr-hamidullah", "fr", "French"), t("en-saheeh", "en", "English"),
  t("bn-khan", "bn", "Bengali"), t("ru-muntahab", "ru", "Russian"), t("id-kemenag", "id", "Indonesian"),
];
const ids = (xs: { id: string }[]): string[] => xs.map((x) => x.id);

test("order: app language first, then English and Bengali, then the rest by language name", () => {
  assert.deepEqual(ids(orderTranslations(seven, ["bn", "en"])), ["bn-khan", "en-saheeh", "zh-majian", "tl-rowwad", "fr-hamidullah", "id-kemenag", "ru-muntahab"]);
  assert.deepEqual(ids(orderTranslations(seven, ["en", "bn"])).slice(0, 2), ["en-saheeh", "bn-khan"]);
  assert.deepEqual(ids(orderTranslations([...seven].reverse(), ["en", "bn"])), ids(orderTranslations(seven, ["en", "bn"])), "input order does not matter");
});

test("seven translations: three shown, four behind More", () => {
  const r = splitTranslations(seven, "bn-khan", { preferredLanguages: ["bn", "en"] });
  assert.equal(r.shown.length, 3);
  assert.equal(r.more.length, 4);
  assert.equal(r.all.length, 7);
  assert.deepEqual(ids(r.shown), ["bn-khan", "en-saheeh", "zh-majian"]);
  assert.deepEqual(ids([...r.shown, ...r.more]).sort(), ids(seven).sort(), "nothing lost, nothing twice");
});

test("a selected translation that would be hidden is shown, in the last place", () => {
  const r = splitTranslations(seven, "ru-muntahab", { preferredLanguages: ["bn", "en"] });
  assert.deepEqual(ids(r.shown), ["bn-khan", "en-saheeh", "ru-muntahab"]);
  assert.ok(!ids(r.more).includes("ru-muntahab"));
  assert.equal(r.more.length, 4);
  assert.deepEqual(ids([...r.shown, ...r.more]).sort(), ids(seven).sort());
});

test("no More button when everything fits, or when only one would be hidden", () => {
  assert.equal(splitTranslations(seven.slice(0, 3), null, { preferredLanguages: [] }).more.length, 0);
  assert.equal(splitTranslations(seven.slice(0, 4), null, { preferredLanguages: [] }).more.length, 0);
  assert.equal(splitTranslations(seven.slice(0, 4), null, { preferredLanguages: [] }).shown.length, 4);
  assert.equal(splitTranslations(seven.slice(0, 5), null, { preferredLanguages: [] }).more.length, 2);
  assert.deepEqual(splitTranslations([], null, { preferredLanguages: [] }), { shown: [], more: [], all: [] });
});

test("visible is respected and never below one; an unknown selection changes nothing", () => {
  assert.equal(splitTranslations(seven, null, { preferredLanguages: [], visible: 5 }).more.length, 2);
  assert.equal(splitTranslations(seven, null, { preferredLanguages: [], visible: 0 }).shown.length, 1);
  assert.deepEqual(ids(splitTranslations(seven, "gone", { preferredLanguages: ["en"] }).shown), ids(splitTranslations(seven, null, { preferredLanguages: ["en"] }).shown));
  const one = splitTranslations(seven, "ru-muntahab", { preferredLanguages: [], visible: 1 });
  assert.deepEqual(ids(one.shown), ["ru-muntahab"]);
  assert.equal(one.more.length, 6);
});
