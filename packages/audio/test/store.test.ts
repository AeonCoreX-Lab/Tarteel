import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryFileStore } from "@tarteel/storage";
import { looksLikeMp3, assertAudioBytes, MIN_AUDIO_BYTES } from "../src/mp3.ts";
import { createAudioStore } from "../src/store.ts";
import { fakeMp3 } from "./helpers.ts";

const R = "test-reciter";

test("accepts an ID3 tag and an MPEG frame sync", () => {
  assert.equal(looksLikeMp3([0x49, 0x44, 0x33, 0x04]), true);
  assert.equal(looksLikeMp3([0xff, 0xfb, 0x90, 0x00]), true);
  assert.equal(looksLikeMp3([0xff, 0xf3, 0x00, 0x00]), true);
});

test("rejects what a captive portal or an error page returns with a 200", () => {
  assert.equal(looksLikeMp3([0x3c, 0x21, 0x44, 0x4f]), false); // <!DO
  assert.equal(looksLikeMp3([0x7b, 0x22, 0x65, 0x72]), false); // {"er
  assert.equal(looksLikeMp3([]), false);
  assert.equal(looksLikeMp3([0xff]), false);
  assert.throws(() => assertAudioBytes(new Uint8Array(MIN_AUDIO_BYTES)), /truncated/);
  const html = new TextEncoder().encode("<!DOCTYPE html>" + "x".repeat(3000));
  assert.throws(() => assertAudioBytes(html), /not an mp3/);
  assert.doesNotThrow(() => assertAudioBytes(fakeMp3()));
});

test("commitAyah goes through .part and leaves no partial behind", async () => {
  const files = createMemoryFileStore();
  const store = createAudioStore(files);
  const uri = await store.commitAyah(R, { surahId: 1, ayahNumber: 1 }, fakeMp3());
  assert.equal(uri, `audio/${R}/001001.mp3`);
  assert.deepEqual((await files.listWithSize("audio", R)).map((e) => e.name), ["001001.mp3"]);
  assert.equal(await store.localPath(R, { surahId: 1, ayahNumber: 1 }), uri);
  assert.equal(await store.localPath(R, { surahId: 1, ayahNumber: 2 }), null);
});

test("a file too small to be audio does not count as downloaded", async () => {
  const files = createMemoryFileStore();
  const store = createAudioStore(files);
  await files.write("audio", `${R}/001001.mp3`, new Uint8Array(10));
  assert.equal(await store.hasAyah(R, { surahId: 1, ayahNumber: 1 }), false);
});

test("surahStatus says which ayahs are missing, not just that some are", async () => {
  const store = createAudioStore(createMemoryFileStore());
  assert.deepEqual(await store.surahStatus(R, 1), { surahId: 1, total: 7, have: 0, missing: [1, 2, 3, 4, 5, 6, 7] });
  for (const a of [1, 2, 3, 5, 6, 7]) await store.commitAyah(R, { surahId: 1, ayahNumber: a }, fakeMp3());
  const s = await store.surahStatus(R, 1);
  assert.equal(s.have, 6);
  assert.deepEqual(s.missing, [4]);
  // this surah and not the one beside it
  for (let a = 1; a <= 3; a++) await store.commitAyah(R, { surahId: 2, ayahNumber: a }, fakeMp3());
  assert.equal((await store.surahStatus(R, 1)).have, 6);
  assert.equal((await store.surahStatus(R, 2)).have, 3);
});

test("a .part file is never counted", async () => {
  const files = createMemoryFileStore();
  const store = createAudioStore(files);
  await files.write("audio", `${R}/001001.mp3.part`, fakeMp3());
  assert.equal((await store.surahStatus(R, 1)).have, 0);
  assert.deepEqual(await store.reciterStats(R), { files: 0, bytes: 0, complete: false });
});

test("reciterStats counts files and bytes from one listing", async () => {
  const store = createAudioStore(createMemoryFileStore());
  await store.commitAyah(R, { surahId: 1, ayahNumber: 1 }, fakeMp3(3000));
  await store.commitAyah(R, { surahId: 1, ayahNumber: 2 }, fakeMp3(4000));
  assert.deepEqual(await store.reciterStats(R), { files: 2, bytes: 7000, complete: false });
  assert.deepEqual(await store.reciterStats("nobody"), { files: 0, bytes: 0, complete: false });
});

test("removeSurah removes that surah's files and its partials only", async () => {
  const files = createMemoryFileStore();
  const store = createAudioStore(files);
  for (const a of [1, 2]) await store.commitAyah(R, { surahId: 1, ayahNumber: a }, fakeMp3());
  await store.commitAyah(R, { surahId: 2, ayahNumber: 1 }, fakeMp3());
  await files.write("audio", `${R}/001003.mp3.part`, fakeMp3());
  assert.equal(await store.removeSurah(R, 1), 2);
  assert.deepEqual((await files.listWithSize("audio", R)).map((e) => e.name), ["002001.mp3"]);
  assert.equal(await store.removeSurah(R, 1), 0);
  await store.removeReciter(R);
  assert.deepEqual(await files.listWithSize("audio", R), []);
});

test("rejects unsafe reciter ids and aux names", async () => {
  const store = createAudioStore(createMemoryFileStore());
  await assert.rejects(store.commitAyah("../evil", { surahId: 1, ayahNumber: 1 }, fakeMp3()), /Unsafe reciter id/);
  await assert.rejects(store.writeAux(R, "../x", new Uint8Array(1)), /Unsafe file name/);
  assert.equal(await store.readAux(R, "../x"), null);
  await store.writeAux(R, "timings.json", new Uint8Array([1, 2]));
  assert.deepEqual(await store.readAux(R, "timings.json"), new Uint8Array([1, 2]));
  assert.equal(await store.readAux(R, "missing.json"), null);
});
