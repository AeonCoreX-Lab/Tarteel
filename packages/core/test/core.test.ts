import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryKeyValueStore, createPreferencesStore } from "@tarteel/storage";
import { HAFS_6236_AYAH_COUNTS as C } from "@tarteel/quran-data";
import { PREFERENCE_DEFAULTS, ReadingProgress, clamp, formatAyahRef, parseAyahRef } from "../src/index.ts";

test("parseAyahRef accepts common forms and rejects invalid ones", () => {
  assert.deepEqual(parseAyahRef("2:255", C), { surahId: 2, ayahNumber: 255 });
  assert.deepEqual(parseAyahRef("2 255", C), { surahId: 2, ayahNumber: 255 });
  assert.deepEqual(parseAyahRef("114", C), { surahId: 114, ayahNumber: 1 });
  assert.equal(parseAyahRef("2:287", C), null);
  assert.equal(parseAyahRef("115:1", C), null);
  assert.equal(parseAyahRef("0:1", C), null);
  assert.equal(parseAyahRef("abc", C), null);
  assert.equal(formatAyahRef({ surahId: 2, ayahNumber: 255 }), "2:255");
});

test("clamp", () => assert.equal(clamp(100, 10, 20), 20));

test("reading progress: pointer always updated, history only when enabled", async () => {
  const prefs = createPreferencesStore(createMemoryKeyValueStore(), PREFERENCE_DEFAULTS);
  const calls: unknown[] = [];
  const rp = new ReadingProgress(prefs, { record: async (r) => (calls.push(r), true) });
  await rp.recordRead({ surahId: 2, ayahNumber: 152 });
  assert.deepEqual(rp.lastRead, { surahId: 2, ayahNumber: 152 });
  assert.equal(calls.length, 1);
  prefs.set("historyEnabled", false);
  await rp.recordRead({ surahId: 3, ayahNumber: 1 });
  assert.deepEqual(rp.lastRead, { surahId: 3, ayahNumber: 1 });
  assert.equal(calls.length, 1);
});

test("audio preferences default to the offline-safe choice and survive a round trip", () => {
  const prefs = createPreferencesStore(createMemoryKeyValueStore(), PREFERENCE_DEFAULTS);
  assert.equal(prefs.get("audioAllowStreaming"), false, "streaming is opt-in");
  assert.equal(prefs.get("audioReciterId"), null);
  assert.equal(prefs.get("lastListened"), null);
  prefs.set("audioAllowStreaming", true);
  prefs.set("audioReciterId", "some-reciter");
  prefs.set("lastListened", { surahId: 2, ayahNumber: 5, reciterId: "some-reciter", at: 1, pausedAt: null });
  assert.equal(prefs.get("audioAllowStreaming"), true);
  assert.equal(prefs.get("audioReciterId"), "some-reciter");
  assert.equal(prefs.get("lastListened")?.ayahNumber, 5);
  // a wrong-typed stored value falls back to the default instead of crashing
  const kv = createMemoryKeyValueStore();
  kv.setString("pref.audioPlaybackRate", JSON.stringify("fast"));
  assert.equal(createPreferencesStore(kv, PREFERENCE_DEFAULTS).get("audioPlaybackRate"), 1);
});
