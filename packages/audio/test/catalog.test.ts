import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROX_RECITATION_HOURS, ayahFileName, ayahUrl, estimateReciterBytes, findReciter, foldForSearch, offeredReciters, parseAyahFileName, parseCatalog, reciterProblems, searchReciters, sortedReciters } from "../src/catalog.ts";
import { makeReciter } from "./helpers.ts";

test("builds zero padded URLs and file names", () => {
  const r = makeReciter();
  assert.equal(ayahUrl(r, { surahId: 1, ayahNumber: 1 }), "https://audio.example.invalid/data/test/001001.mp3");
  assert.equal(ayahUrl(r, { surahId: 114, ayahNumber: 6 }), "https://audio.example.invalid/data/test/114006.mp3");
  assert.equal(ayahFileName({ surahId: 2, ayahNumber: 255 }), "002255.mp3");
});

test("reads file names back and ignores everything else in the folder", () => {
  assert.deepEqual(parseAyahFileName("002255.mp3"), { surahId: 2, ayahNumber: 255 });
  assert.equal(parseAyahFileName("002255.mp3.part"), null);
  assert.equal(parseAyahFileName("000001.mp3"), null);
  assert.equal(parseAyahFileName("115001.mp3"), null);
  assert.equal(parseAyahFileName("timings.json"), null);
});

test("a well formed entry has no problems", () => {
  assert.deepEqual(reciterProblems(makeReciter()), []);
});

test("rejects unsafe or incomplete entries", () => {
  const bad: [string, unknown][] = [
    ["path-like id", { ...makeReciter(), id: "../x" }],
    ["uppercase id", { ...makeReciter(), id: "Test" }],
    ["http url", { ...makeReciter(), urlTemplate: "http://a.invalid/{surah3}{ayah3}.mp3" }],
    ["missing placeholder", { ...makeReciter(), urlTemplate: "https://a.invalid/{surah3}.mp3" }],
    ["both numberings", { ...makeReciter(), urlTemplate: "https://a.invalid/{surah3}{ayah3}/{ayah}.mp3" }],
    ["url with space", { ...makeReciter(), urlTemplate: "https://a.invalid/x y/{surah3}{ayah3}.mp3" }],
    ["traversal", { ...makeReciter(), urlTemplate: "https://a.invalid/../{surah3}{ayah3}.mp3" }],
    ["bitrate", { ...makeReciter(), bitrateKbps: 5 }],
    ["no verification", { ...makeReciter(), verification: undefined }],
    ["bad date", { ...makeReciter(), verification: { ...makeReciter().verification, verifiedOn: "yesterday" } }],
    ["bad timings", { ...makeReciter(), timings: { url: "ftp://x", attribution: "" } }],
    ["not an object", 5],
  ];
  for (const [name, entry] of bad) assert.notDeepEqual(reciterProblems(entry), [], name);
});

test("an enabled reciter must have a verified licence", () => {
  const entry = makeReciter({ verification: { ...makeReciter().verification, licenseVerified: false } });
  assert.match(reciterProblems(entry).join(";"), /licenseVerified = true/);
  // disabled and unverified is allowed: it is a record, not an option
  assert.deepEqual(reciterProblems({ ...entry, enabled: false }), []);
});

test("parseCatalog drops bad entries and duplicates but keeps the good ones", () => {
  const good = makeReciter({ id: "a" });
  const dup = makeReciter({ id: "a" });
  const bad = { ...makeReciter({ id: "b" }), urlTemplate: "nope" };
  const { reciters, errors } = parseCatalog([good, dup, bad]);
  assert.deepEqual(reciters.map((r) => r.id), ["a"]);
  assert.ok(errors.some((e) => e.startsWith("a: duplicate")));
  assert.ok(errors.some((e) => e.startsWith("b:")));
  assert.deepEqual(parseCatalog({}).reciters, []);
  assert.deepEqual(parseCatalog([]), { reciters: [], errors: [] });
});

test("only enabled and verified reciters are offered", () => {
  const a = makeReciter({ id: "a" });
  const b = makeReciter({ id: "b", enabled: false });
  const c = makeReciter({ id: "c", verification: { ...a.verification, licenseVerified: false } });
  assert.deepEqual(offeredReciters([a, b, c]).map((r) => r.id), ["a"]);
  assert.equal(findReciter([a, b], "b")?.id, "b");
  assert.equal(findReciter([a, b], "zzz"), null);
  assert.equal(findReciter([a], null), null);
});

test("search folds case, punctuation, the article and Arabic vowel marks", () => {
  assert.equal(foldForSearch("Al-Ajmi"), foldForSearch("ajmi"));
  assert.equal(foldForSearch("  El Minshawi "), foldForSearch("minshawi"));
  const list = [makeReciter({ id: "x", name: "Ahmed Al-Ajmi", arabicName: "أحمد العجمي", aliases: ["ajamy"] }), makeReciter({ id: "y", name: "Zed" })];
  for (const q of ["ajmi", "alajmi", "ajamy", "Al-Ajmi", "العجمي"]) assert.deepEqual(searchReciters(q, list).map((r) => r.id), ["x"], q);
  assert.equal(searchReciters("", list).length, 2);
  assert.equal(searchReciters("zzzqqq", list).length, 0);
  assert.deepEqual(sortedReciters(list).map((r) => r.name), ["Ahmed Al-Ajmi", "Zed"]);
});

test("estimates the whole-Quran size from the bitrate", () => {
  const r = makeReciter({ bitrateKbps: 128 });
  assert.equal(estimateReciterBytes(r), Math.round((APPROX_RECITATION_HOURS * 3600 * 128 * 1000) / 8));
  assert.ok(estimateReciterBytes(r) > estimateReciterBytes(makeReciter({ bitrateKbps: 32 })));
});

test("ayahUrl: a reciter whose files are numbered through the whole book", () => {
  const r = { ...makeReciter(), urlTemplate: "https://audio.example.invalid/128/ed/{ayah}.mp3" };
  assert.deepEqual(reciterProblems(r), []);
  assert.equal(ayahUrl(r, { surahId: 1, ayahNumber: 1 }), "https://audio.example.invalid/128/ed/1.mp3");
  assert.equal(ayahUrl(r, { surahId: 2, ayahNumber: 1 }), "https://audio.example.invalid/128/ed/8.mp3");
  assert.equal(ayahUrl(r, { surahId: 114, ayahNumber: 6 }), "https://audio.example.invalid/128/ed/6236.mp3");
});
