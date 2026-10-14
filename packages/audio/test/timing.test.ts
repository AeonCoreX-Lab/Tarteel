import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryFileStore } from "@tarteel/storage";
import { createAudioStore } from "../src/store.ts";
import { activeWordAt, loadTimings, parseTimings, readCachedTimings, segmentsFor, spanForWord } from "../src/timing.ts";
import { fakeHttp, makeReciter } from "./helpers.ts";

const good = { "1:1": [[0, 1, 0, 500], [1, 2, 500, 900], [2, 4, 1000, 1800]] };

test("parses a well formed table", () => {
  const t = parseTimings(good);
  assert.ok(t);
  assert.equal(segmentsFor(t, { surahId: 1, ayahNumber: 1 })?.length, 3);
  assert.equal(segmentsFor(t, { surahId: 1, ayahNumber: 2 }), null);
  assert.equal(segmentsFor(null, { surahId: 1, ayahNumber: 1 }), null);
});

test("refuses a table with ANY malformed segment: half-right timing lights the wrong word", () => {
  assert.equal(parseTimings(null), null);
  assert.equal(parseTimings([]), null);
  assert.equal(parseTimings({}), null);
  assert.equal(parseTimings({ "x:y": [[0, 1, 0, 5]] }), null);
  assert.equal(parseTimings({ "1:1": "nope" }), null);
  assert.equal(parseTimings({ "1:1": [[0, 1, 0]] }), null);
  assert.equal(parseTimings({ "1:1": [[0, 1, "a", 5]] }), null);
  assert.equal(parseTimings({ "1:1": [[0, 1, 500, 500]] }), null);
  assert.equal(parseTimings({ "1:1": [[-1, 1, 0, 5]] }), null);
  assert.equal(parseTimings({ ...good, "1:2": [[0, 1, 9, 3]] }), null);
});

test("finds the word being recited at a moment in the audio", () => {
  const segs = segmentsFor(parseTimings(good), { surahId: 1, ayahNumber: 1 });
  assert.equal(activeWordAt(segs, 0), 0);
  assert.equal(activeWordAt(segs, 499), 0);
  assert.equal(activeWordAt(segs, 500), 1);
  assert.equal(activeWordAt(segs, 950), null, "a pause between words lights nothing");
  assert.equal(activeWordAt(segs, 5000), null);
  assert.equal(activeWordAt(null, 10), null);
});

test("finds the span for a word, including multi-word and degenerate segments", () => {
  const segs = segmentsFor(parseTimings({ "1:1": [[0, 1, 0, 500], [2, 4, 1000, 1800], [5, 5, 2000, 2300]] }), { surahId: 1, ayahNumber: 1 });
  assert.deepEqual(spanForWord(segs, 0), { startMs: 0, endMs: 500 });
  assert.deepEqual(spanForWord(segs, 3), { startMs: 1000, endMs: 1800 });
  assert.deepEqual(spanForWord(segs, 5), { startMs: 2000, endMs: 2300 });
  assert.equal(spanForWord(segs, 1), null);
  assert.equal(spanForWord(segs, 6), null);
});

test("loadTimings costs no request for a reciter without timings, caches on success, and never throws", async () => {
  const store = createAudioStore(createMemoryFileStore());
  const plain = makeReciter();
  const none = fakeHttp(() => ({ status: 200 }));
  assert.equal(await loadTimings({ store, http: none, reciter: plain }), null);
  assert.equal(none.calls.length, 0);

  const timed = makeReciter({ timings: { url: "https://audio.example.invalid/t.json", attribution: "synthetic" } });
  const body = new TextEncoder().encode(JSON.stringify(good));
  const http = fakeHttp(() => ({ status: 200, bytes: body }));
  assert.ok(await loadTimings({ store, http, reciter: timed }));
  assert.ok(await loadTimings({ store, http, reciter: timed }));
  assert.equal(http.calls.length, 1, "second call is served from the device");
  assert.ok(await readCachedTimings(store, timed));

  const fresh = createAudioStore(createMemoryFileStore());
  for (const h of [fakeHttp(() => ({ status: 500 })), fakeHttp(() => new Error("offline")), fakeHttp(() => ({ status: 200, bytes: new TextEncoder().encode("{not json") })), fakeHttp(() => ({ status: 200, bytes: new TextEncoder().encode('{"1:1":[[0,1,5,2]]}') }))]) {
    assert.equal(await loadTimings({ store: fresh, http: h, reciter: timed }), null);
  }
  assert.equal(await readCachedTimings(fresh, timed), null);
});
