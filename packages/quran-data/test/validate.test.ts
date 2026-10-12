import { test } from "node:test";
import assert from "node:assert/strict";
import { HAFS_6236, totalAyahs, validateAyahs, validateManifest, verifyFileHashes } from "../src/index.ts";

// Synthetic convention + placeholder text: NOT Quran content.
const TINY = { id: "tiny", ayahCounts: [2, 3] } as const;
const good = [
  { surah: 1, ayah: 1, text: "x1" }, { surah: 1, ayah: 2, text: "x2" },
  { surah: 2, ayah: 1, text: "x3" }, { surah: 2, ayah: 2, text: "x4" }, { surah: 2, ayah: 3, text: "x5" },
];
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

test("hafs-6236 convention is structurally sound", () => {
  assert.equal(HAFS_6236.ayahCounts.length, 114);
  assert.equal(totalAyahs(HAFS_6236), 6236);
  assert.equal(HAFS_6236.ayahCounts[0], 7);
  assert.equal(HAFS_6236.ayahCounts[1], 286);
  assert.equal(HAFS_6236.ayahCounts[113], 6);
});

test("valid dataset passes", () => {
  const r = validateAyahs(good, TINY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.stats, { surahs: 2, ayahs: 5 });
});

test("detects missing surah and ayah", () => {
  assert.ok(codes(validateAyahs(good.slice(0, 2), TINY)).includes("missing-surah"));
  const r = validateAyahs(good.filter((x) => !(x.surah === 2 && x.ayah === 2)), TINY);
  assert.ok(codes(r).includes("missing-ayah"));
  assert.equal(r.ok, false);
});

test("detects duplicates, extra surah, invalid numbering, order", () => {
  assert.ok(codes(validateAyahs([...good, good[0]], TINY)).includes("duplicate-ayah"));
  assert.ok(codes(validateAyahs([...good, { surah: 3, ayah: 1, text: "x" }], TINY)).includes("extra-surah"));
  assert.ok(codes(validateAyahs([...good, { surah: 2, ayah: 9, text: "x" }], TINY)).includes("invalid-ayah-number"));
  assert.ok(codes(validateAyahs([good[1], good[0], ...good.slice(2)], TINY)).includes("bad-order"));
});

test("detects empty, broken utf-8 and control characters", () => {
  const bad = (text: string) => validateAyahs(good.map((g, i) => (i === 0 ? { ...g, text } : g)), TINY);
  assert.ok(codes(bad("   ")).includes("empty-verse"));
  assert.ok(codes(bad("a\uFFFDb")).includes("broken-utf8"));
  assert.ok(codes(bad("a\uD800b")).includes("broken-utf8"));
  assert.ok(codes(bad("a\u0000b")).includes("control-char"));
});

test("non-array and non-object input fail cleanly", () => {
  assert.equal(validateAyahs({}, TINY).ok, false);
  assert.equal(validateAyahs([null], TINY).ok, false);
});

const okManifest = {
  id: "t", kind: "translation", version: "1", language: "en", languageName: "English", direction: "ltr",
  translator: "T", source: { name: "S", url: "https://example.org" }, license: { name: "L" },
  copyright: "c", attribution: "a", numberingConvention: "hafs-6236", redistributionPermitted: true,
  importedAt: "2026-01-01", files: { "ayahs.json": "a".repeat(64) },
};

test("manifest validation", () => {
  assert.deepEqual(validateManifest(okManifest), []);
  assert.ok(validateManifest({ ...okManifest, redistributionPermitted: false }).some((i) => i.code === "not-redistributable"));
  assert.ok(validateManifest({ ...okManifest, license: undefined }).length > 0);
  assert.ok(validateManifest({ ...okManifest, translator: "" }).length > 0);
  assert.ok(validateManifest({ ...okManifest, files: { x: "nothex" } }).some((i) => i.code === "manifest-bad-hash"));
});

test("checksum verification", async () => {
  const enc = new TextEncoder().encode("hello");
  const fake = async (b: Uint8Array) => (b.length === 5 ? "h".repeat(64) : "z");
  assert.deepEqual(await verifyFileHashes({ files: { f: "h".repeat(64) } }, async () => enc, fake), []);
  const r = await verifyFileHashes({ files: { f: "0".repeat(64) } }, async () => enc, fake);
  assert.equal(r[0]?.code, "checksum-mismatch");
});
