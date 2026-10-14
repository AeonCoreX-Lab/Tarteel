import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryFileStore } from "@tarteel/storage";
import { createDownloadManager } from "../src/manager.ts";
import type { DownloadState } from "../src/manager.ts";
import { createAudioStore } from "../src/store.ts";
import { fakeHttp, fakeMp3, makeReciter } from "./helpers.ts";

const reciter = makeReciter();
const ok = () => ({ status: 200, bytes: fakeMp3() });

function setup(over: { handler?: Parameters<typeof fakeHttp>[0]; free?: number; stallMs?: number } = {}) {
  const store = createAudioStore(createMemoryFileStore());
  const http = fakeHttp(over.handler ?? ok);
  const manager = createDownloadManager({
    store,
    http,
    getReciter: (id) => (id === reciter.id ? reciter : null),
    freeBytes: over.free === undefined ? undefined : async () => over.free as number,
    stallMs: over.stallMs,
  });
  return { store, http, manager };
}

test("downloads one surah and records how it ended", async () => {
  const { manager, store } = setup();
  const states: DownloadState[] = [];
  manager.subscribe((s) => states.push(s));
  const r = await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 1 });
  assert.equal(r.started, true);
  const s = manager.getState();
  assert.equal(s.running, null);
  assert.equal(s.last?.complete, true);
  assert.equal(s.last?.done, 7);
  assert.equal((await store.surahStatus(reciter.id, 1)).have, 7);
  assert.ok(states.some((x) => x.running !== null), "subscribers saw it running");
});

test("only the missing ayahs are queued when refs are given", async () => {
  const { manager, store, http } = setup();
  await store.commitAyah(reciter.id, { surahId: 1, ayahNumber: 1 }, fakeMp3());
  await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 1, refs: [{ surahId: 1, ayahNumber: 4 }] });
  assert.equal(manager.getState().last?.total, 1);
  assert.equal(http.calls.length, 1);
});

test("one download at a time: a second start is a no-op and does not disturb the first", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const store = createAudioStore(createMemoryFileStore());
  const http = {
    calls: [] as string[],
    async get(url: string) {
      http.calls.push(url);
      await gate;
      return { status: 200, bytes: fakeMp3() };
    },
  };
  const manager = createDownloadManager({ store, http, getReciter: () => reciter });
  const first = manager.start({ kind: "surah", reciterId: reciter.id, surahId: 112 });
  const second = await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 1 });
  assert.equal(second.started, false);
  assert.equal(manager.isRunning({ kind: "surah", reciterId: reciter.id, surahId: 112 }), true);
  assert.equal(manager.isRunning({ kind: "surah", reciterId: reciter.id, surahId: 1 }), false);
  release();
  await first;
  assert.equal(manager.getState().last?.complete, true);
});

test("cancel is reported as cancelled, never as interrupted or failed", async () => {
  const store = createAudioStore(createMemoryFileStore());
  let n = 0;
  const http = {
    async get() {
      if (++n === 2) manager.cancel(); // `manager` exists by the time the first request is made
      return { status: 200, bytes: fakeMp3() };
    },
  };
  const manager: ReturnType<typeof createDownloadManager> = createDownloadManager({ store, http, getReciter: () => reciter });
  await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 2 });
  const last = manager.getState().last;
  assert.equal(last?.cancelled, true);
  assert.equal(last?.interrupted, false);
  assert.equal(last?.complete, false);
});

test("refuses a whole-Quran download that will not fit, before fetching anything", async () => {
  const { manager, http } = setup({ free: 10 * 1024 * 1024 });
  await manager.start({ kind: "reciter", reciterId: reciter.id });
  assert.equal(manager.getState().last?.error, "no-space");
  assert.equal(http.calls.length, 0);
  assert.equal(manager.getState().running, null);
});

test("an unknown reciter ends cleanly and frees the slot", async () => {
  const { manager } = setup();
  await manager.start({ kind: "surah", reciterId: "nope", surahId: 1 });
  assert.equal(manager.getState().last?.error, "unknown-reciter");
  assert.equal(manager.getState().running, null);
  const again = await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 112 });
  assert.equal(again.started, true);
});

test("a stalled run is cancelled by the watchdog and reported as interrupted, so the manager cannot wedge", async () => {
  const store = createAudioStore(createMemoryFileStore());
  const http = {
    get: (_url: string, opts: { signal?: AbortSignal }) =>
      new Promise<never>((_, reject) => opts.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
  };
  const manager = createDownloadManager({ store, http, getReciter: () => reciter, stallMs: 60 });
  await manager.start({ kind: "surah", reciterId: reciter.id, surahId: 1 });
  const last = manager.getState().last;
  assert.equal(last?.interrupted, true);
  assert.equal(last?.cancelled, false);
  assert.equal(manager.getState().running, null);
});

test("downloads word timings alongside audio when the reciter publishes them, and ignores their failure", async () => {
  const withTimings = makeReciter({ timings: { url: "https://audio.example.invalid/t.json", attribution: "synthetic" } });
  const store = createAudioStore(createMemoryFileStore());
  const http = fakeHttp((url) => (url.endsWith("t.json") ? { status: 500 } : ok()));
  const manager = createDownloadManager({ store, http, getReciter: () => withTimings });
  await manager.start({ kind: "surah", reciterId: withTimings.id, surahId: 112 });
  assert.equal(manager.getState().last?.complete, true, "timings failure must not fail the audio");
  assert.ok(http.calls.some((u) => u.endsWith("t.json")));
});
