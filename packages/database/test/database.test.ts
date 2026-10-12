import { test } from "node:test";
import assert from "node:assert/strict";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import {
  CONTENT_MIGRATIONS, USER_MIGRATIONS, MigrationError, createRepositories, importQuran, importTranslation,
  uninstallTranslation, migrate,
} from "../src/index.ts";
import type { DatasetManifest } from "@tarteel/types";

// ALL text below is synthetic placeholder text, not Quran content.
const TINY = { id: "tiny", ayahCounts: [2, 3] };
const base = (over: Partial<DatasetManifest>): DatasetManifest => ({
  id: "x", kind: "quran", version: "1", language: "ar", languageName: "Arabic", direction: "rtl",
  source: { name: "test", url: "https://example.org" }, license: { name: "test" }, copyright: "c", attribution: "a",
  numberingConvention: "tiny", redistributionPermitted: true, importedAt: "2026-01-01",
  files: { "ayahs.json": "0".repeat(64) }, ...over,
});
// "kataba", "alamun", "darasa" with harakat -- ordinary Arabic words used as test data
const ARABIC = ["\u0643\u064E\u062A\u064E\u0628\u064E", "\u0639\u0650\u0644\u0652\u0645\u064C", "\u062F\u064E\u0631\u064E\u0633\u064E", "\u0643\u0650\u062A\u064E\u0627\u0628\u064C", "\u0642\u064E\u0644\u064E\u0645\u064C"];
const refs = [[1, 1], [1, 2], [2, 1], [2, 2], [2, 3]] as const;
const quranAyahs = refs.map(([s, a], i) => ({ surah: s, ayah: a, text: ARABIC[i] as string }));
const surahs = [
  { id: 1, name_ar: "\u0627", name_translit: "One", name_en: "First", revelation: "makkah" as const },
  { id: 2, name_ar: "\u0628", name_translit: "Two", name_en: "Second", revelation: "madinah" as const },
];
const BN = ["\u0986\u09AE\u09BF \u09AC\u09BE\u0982\u09B2\u09BE\u09DF \u0997\u09BE\u09A8 \u0997\u09BE\u0987", "\u09AC\u0987 \u09AA\u09DC\u09BF", "\u09A8\u09A6\u09C0\u09B0 \u09AA\u09BE\u09A1\u09BC\u09C7", "\u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6", "\u09A6\u09C7\u09B6"];
const EN = ["the quick fox", "a lazy dog", "the river bank", "quickly running", "end"];
const tr = (id: string, lang: string, texts: string[]) => ({
  manifest: base({ id, kind: "translation", language: lang, languageName: lang, direction: "ltr", translator: "T" }),
  checksum: "c", ayahs: refs.map(([s, a], i) => ({ surah: s, ayah: a, text: texts[i] as string })),
});

async function setup() {
  const content = openNodeSqlite();
  const user = openNodeSqlite();
  await migrate(content, CONTENT_MIGRATIONS);
  await migrate(user, USER_MIGRATIONS);
  await importQuran(content, { manifest: base({}), checksum: "c", ayahs: quranAyahs, surahs,
    ayahMeta: [{ surah: 1, ayah: 1, juz: 1, page: 1 }, { surah: 2, ayah: 1, juz: 2, page: 2 }, { surah: 2, ayah: 3, juz: 2, page: 3, sajdah: "recommended" }] }, TINY);
  await importTranslation(content, tr("bn-test", "bn", BN), TINY);
  await importTranslation(content, tr("en-test", "en", EN), TINY);
  let t = 1000;
  return { content, user, repos: createRepositories(content, user, () => (t += 10_000)) };
}

test("migrations are idempotent, ordered, and protect against downgrade/tampering", async () => {
  const db = openNodeSqlite();
  assert.deepEqual((await migrate(db, USER_MIGRATIONS)).applied, [1]);
  assert.deepEqual((await migrate(db, USER_MIGRATIONS)).applied, []);
  await assert.rejects(migrate(db, []), MigrationError); // db newer than app
  await assert.rejects(migrate(db, [{ id: 1, name: "renamed", sql: "" }]), MigrationError); // edited migration
  await assert.rejects(migrate(openNodeSqlite(), [{ id: 2, name: "x", sql: "" }]), MigrationError); // gap
});

test("a failing migration rolls back completely", async () => {
  const db = openNodeSqlite();
  await assert.rejects(migrate(db, [{ id: 1, name: "bad", sql: "CREATE TABLE a(x); CREATE TABLE a(y);" }]));
  assert.equal((await db.all("SELECT * FROM schema_migrations")).length, 0);
  assert.equal((await db.all("SELECT name FROM sqlite_master WHERE name='a'")).length, 0);
});

test("quran repository: surahs, ayahs, translations, juz/page/sajdah", async () => {
  const { repos } = await setup();
  assert.equal((await repos.quran.getSurahs()).length, 2);
  const s2 = await repos.quran.getSurahAyahs(2, "en-test");
  assert.equal(s2.length, 3);
  assert.equal(s2[0]?.translation, "the river bank");
  assert.equal((await repos.quran.getSurahAyahs(2, null))[0]?.translation, null);
  assert.equal((await repos.quran.getAyah({ surahId: 1, ayahNumber: 2 }, "bn-test"))?.translation, BN[1]);
  assert.equal(s2[0]?.textArabic, ARABIC[2]); // stored text is untouched (harakat intact)
  assert.deepEqual((await repos.quran.getJuzStarts()).map((j) => [j.juz, j.surahId, j.ayahNumber]), [[1, 1, 1], [2, 2, 1]]);
  assert.equal((await repos.quran.getSajdahAyahs()).length, 1);
  assert.equal((await repos.quran.getPageAyahs(3)).length, 1);
  assert.deepEqual((await repos.translations.listInstalled()).map((t) => t.id), ["bn-test", "en-test"]);
});

test("search: arabic ignores diacritics; bengali keeps vowel signs; english prefix; datasets isolated", async () => {
  const { repos } = await setup();
  const plain = "\u0643\u062A\u0628"; // kataba without harakat
  const hits = await repos.search.searchArabic(plain);
  assert.deepEqual(hits.map((h) => [h.surahId, h.ayahNumber]), [[1, 1]]);
  assert.ok(hits[0]?.highlighted.includes("["));
  // bengali whole word with vowel signs / hasanta
  assert.deepEqual((await repos.search.searchTranslation("bn-test", "\u09AC\u09BE\u0982\u09B2\u09BE\u09DF")).map((h) => h.ayahNumber), [1]);
  // NFC/NFD forms of the same word both match
  assert.equal((await repos.search.searchTranslation("bn-test", "\u09AC\u09BE\u0982\u09B2\u09BE\u09AF\u09BC")).length, 1);
  // prefix search works on the word start (2 words begin with this), but a mid-word
  // fragment must NOT match: proves vowel signs do not split words into tokens
  assert.equal((await repos.search.searchTranslation("bn-test", "\u09AC\u09BE")).length, 2);
  assert.equal((await repos.search.searchTranslation("bn-test", "\u09B2\u09BE")).length, 0);
  assert.deepEqual((await repos.search.searchTranslation("en-test", "quick")).map((h) => [h.surahId, h.ayahNumber]), [[1, 1], [2, 2]]);
  assert.equal((await repos.search.searchTranslation("en-test", "quick")).length, 2);
  assert.equal((await repos.search.searchTranslation("bn-test", "quick")).length, 0);
  assert.deepEqual(await repos.search.searchArabic("   "), []);
  assert.deepEqual(await repos.search.searchTranslation("en-test", 'fox" OR *'), []); // no syntax errors from user input
});

test("uninstalling a translation removes rows and FTS entries; reinstall works", async () => {
  const { content, repos } = await setup();
  await uninstallTranslation(content, "en-test");
  assert.equal((await repos.search.searchTranslation("en-test", "quick")).length, 0);
  assert.deepEqual((await repos.translations.listInstalled()).map((t) => t.id), ["bn-test"]);
  await importTranslation(content, tr("en-test", "en", EN), TINY);
  assert.equal((await repos.search.searchTranslation("en-test", "fox")).length, 1);
});

test("import rejects invalid or non-redistributable data without writing", async () => {
  const { content } = await setup();
  const bad = tr("bad", "en", EN);
  await assert.rejects(importTranslation(content, { ...bad, ayahs: bad.ayahs.slice(1) }, TINY), /missing/);
  await assert.rejects(importTranslation(content, { ...bad, manifest: { ...bad.manifest, redistributionPermitted: false } }, TINY), /redistribution/);
  await assert.rejects(importTranslation(content, { ...bad, ayahs: bad.ayahs.map((a, i) => (i === 0 ? { ...a, text: "" } : a)) }, TINY), /empty-verse/);
  assert.equal((await content.all("SELECT id FROM datasets WHERE id='bad'")).length, 0);
});

test("bookmarks, notes, history", async () => {
  const { repos } = await setup();
  const r = { surahId: 2, ayahNumber: 3 };
  await repos.bookmarks.add(r);
  await repos.bookmarks.add(r, "remember"); // upsert, no duplicate
  assert.equal((await repos.bookmarks.list()).length, 1);
  assert.equal((await repos.bookmarks.list())[0]?.note, "remember");
  assert.equal(await repos.bookmarks.isBookmarked(r), true);
  assert.deepEqual([...(await repos.bookmarks.listForSurah(2))], [3]);
  assert.equal(await repos.bookmarks.remove(r), true);
  assert.equal(await repos.bookmarks.remove(r), false);

  const id = await repos.notes.create(r, "first");
  assert.equal(await repos.notes.update(id, "edited"), true);
  assert.equal((await repos.notes.listForAyah(r))[0]?.body, "edited");
  assert.equal(await repos.notes.delete(id), true);

  assert.equal(await repos.history.record(r, 0), true);
  assert.equal(await repos.history.record({ surahId: 1, ayahNumber: 1 }), true);
  assert.equal((await repos.history.list()).length, 2);
  assert.equal(await repos.history.prune(1), 1);
  await repos.history.clear();
  assert.equal((await repos.history.list()).length, 0);
});

test("history dedupes the same ayah inside the window", async () => {
  const user = openNodeSqlite();
  await migrate(user, USER_MIGRATIONS);
  const { HistoryRepository } = await import("../src/repositories.ts");
  const h = new HistoryRepository(user, () => 5000);
  assert.equal(await h.record({ surahId: 1, ayahNumber: 1 }), true);
  assert.equal(await h.record({ surahId: 1, ayahNumber: 1 }), false);
});
