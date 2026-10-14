import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryFileStore } from "@tarteel/storage";
import { fetchAyahToStore, prefetchAyah, runAyahDownload } from "../src/download.ts";
import { surahRefs } from "../src/refs.ts";
import { createAudioStore } from "../src/store.ts";
import { fakeHttp, fakeMp3, makeReciter, noSleep } from "./helpers.ts";
import type { Handler } from "./helpers.ts";

const reciter = makeReciter();
const ok = () => ({ status: 200, bytes: fakeMp3() });
const setup = (handler: Handler = ok) => {
  const files = createMemoryFileStore();
  return { files, store: createAudioStore(files), http: fakeHttp(handler) };
};

test("downloads a surah, one file per ayah, and reports completion", async () => {
  const { store, http } = setup();
  const seen: number[] = [];
  const out = await runAyahDownload({ store, http, reciter, refs: surahRefs(1), onProgress: (p) => seen.push(p.done), sleep: noSleep });
  assert.equal(out.complete, true);
  assert.equal(out.done, 7);
  assert.equal(http.calls.length, 7);
  assert.equal(http.calls[0], "https://audio.example.invalid/data/test/001001.mp3");
  assert.equal((await store.surahStatus(reciter.id, 1)).have, 7);
  assert.equal(seen.at(-1), 7);
});

test("resume: files already on disk are skipped, never fetched again", async () => {
  const { store, http } = setup();
  for (const a of [1, 2, 3]) await store.commitAyah(reciter.id, { surahId: 1, ayahNumber: a }, fakeMp3());
  const out = await runAyahDownload({ store, http, reciter, refs: surahRefs(1), sleep: noSleep });
  assert.equal(out.complete, true);
  assert.equal(http.calls.length, 4);
});

test("a captive portal's 200 + HTML is rejected and leaves nothing behind", async () => {
  const html = new TextEncoder().encode("<!DOCTYPE html>" + "x".repeat(4000));
  const { files, store, http } = setup(() => ({ status: 200, bytes: html }));
  await assert.rejects(fetchAyahToStore({ store, http, reciter, ref: { surahId: 1, ayahNumber: 1 }, sleep: noSleep }), /not an mp3/);
  assert.equal(http.calls.length, 3, "transient-looking failures are retried");
  assert.deepEqual(await files.listWithSize("audio", reciter.id), []);
});

test("a 404 is permanent: not retried", async () => {
  const { store, http } = setup(() => ({ status: 404 }));
  await assert.rejects(fetchAyahToStore({ store, http, reciter, ref: { surahId: 1, ayahNumber: 1 }, sleep: noSleep }), /HTTP 404/);
  assert.equal(http.calls.length, 1);
});

test("a transient failure is retried and then succeeds", async () => {
  let n = 0;
  const { store, http } = setup(() => (++n < 3 ? new Error("reset") : ok()));
  const uri = await fetchAyahToStore({ store, http, reciter, ref: { surahId: 1, ayahNumber: 1 }, sleep: noSleep });
  assert.equal(uri, `audio/${reciter.id}/001001.mp3`);
  assert.equal(http.calls.length, 3);
});

test("a few bad files do not stop the run; they are reported, not thrown", async () => {
  const { store, http } = setup((url) => (url.endsWith("001003.mp3") ? { status: 404 } : ok()));
  const out = await runAyahDownload({ store, http, reciter, refs: surahRefs(1), sleep: noSleep });
  assert.equal(out.complete, false);
  assert.equal(out.interrupted, false);
  assert.equal(out.failed, 1);
  assert.deepEqual((await store.surahStatus(reciter.id, 1)).missing, [3]);
});

test("a dead connection ends the run as INTERRUPTED, quickly, keeping what arrived", async () => {
  let n = 0;
  const { store, http } = setup(() => (++n <= 2 ? ok() : new Error("offline")));
  const out = await runAyahDownload({ store, http, reciter, refs: surahRefs(2), workers: 1, attempts: 1, giveUpAfter: 4, sleep: noSleep });
  assert.equal(out.interrupted, true);
  assert.equal(out.complete, false);
  assert.equal(out.failed, 4);
  assert.ok(http.calls.length < 10, `gave up early, made ${http.calls.length} requests`);
  assert.equal((await store.surahStatus(reciter.id, 2)).have, 2);
});

test("cancelling stops the run and is not an interruption or a failure", async () => {
  const ctl = new AbortController();
  let n = 0;
  const { store, http } = setup(() => {
    if (++n === 3) ctl.abort();
    return ok();
  });
  const out = await runAyahDownload({ store, http, reciter, refs: surahRefs(2), workers: 1, signal: ctl.signal, sleep: noSleep });
  assert.equal(out.cancelled, true);
  assert.equal(out.interrupted, false);
  assert.equal(out.complete, false);
  assert.equal(out.failed, 0);
  assert.ok(out.done < 286);
});

test("an empty queue is trivially complete", async () => {
  const { store, http } = setup();
  const out = await runAyahDownload({ store, http, reciter, refs: [], sleep: noSleep });
  assert.equal(out.complete, true);
  assert.equal(http.calls.length, 0);
});

test("prefetch returns the local path, never refetches, and returns null on failure", async () => {
  const { store, http } = setup();
  const ref = { surahId: 1, ayahNumber: 1 };
  assert.equal(await prefetchAyah({ store, http, reciter, ref }), `audio/${reciter.id}/001001.mp3`);
  assert.equal(await prefetchAyah({ store, http, reciter, ref }), `audio/${reciter.id}/001001.mp3`);
  assert.equal(http.calls.length, 1);
  const bad = setup(() => ({ status: 500 }));
  assert.equal(await prefetchAyah({ store: bad.store, http: bad.http, reciter, ref: { surahId: 1, ayahNumber: 2 } }), null);
});
