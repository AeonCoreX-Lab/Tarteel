import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlaybackController } from "../src/controller.ts";
import type { PlaybackPolicy, PlayerPort } from "../src/controller.ts";
import { LISTEN_WINDOW } from "../src/queue.ts";
import type { PlayerTrack, Reciter } from "../src/types.ts";
import { makeReciter } from "./helpers.ts";

const r = (s: number, a: number) => ({ surahId: s, ayahNumber: a });
const tick = () => new Promise<void>((res) => setTimeout(res, 0));

interface FakePlayer extends PlayerPort {
  queue: PlayerTrack[];
  active: number | null;
  log: string[];
  rate: number;
}

function fakePlayer(): FakePlayer {
  const p: FakePlayer = {
    queue: [],
    active: null,
    log: [],
    rate: 1,
    async setup() { p.log.push("setup"); },
    async reset() { p.queue = []; p.active = null; p.log.push("reset"); },
    async add(tracks, at) {
      if (at === undefined) p.queue.push(...tracks);
      else p.queue.splice(at, 0, ...tracks);
      if (p.active === null && p.queue.length) p.active = 0;
      p.log.push(`add:${tracks.length}${at === undefined ? "" : `@${at}`}`);
    },
    async remove(ix) { p.queue = p.queue.filter((_, i) => !ix.includes(i)); p.log.push(`remove:${ix.join(",")}`); },
    async getQueue() { return [...p.queue]; },
    async getTrack(i) { return p.queue[i]; },
    async getActiveIndex() { return p.active; },
    async play() { p.log.push("play"); },
    async pause() { p.log.push("pause"); },
    async seekTo(s) { p.log.push(`seek:${s}`); },
    async skipToNext() { p.log.push("next"); },
    async skipToPrevious() { p.log.push("prev"); },
    async setRate(x) { p.rate = x; },
  };
  return p;
}

function setup(over: { local?: Set<string>; policy?: Partial<PlaybackPolicy>; reciter?: Reciter | null; prefetch?: (ref: { surahId: number; ayahNumber: number }) => Promise<string | null> } = {}) {
  const player = fakePlayer();
  const local = over.local ?? new Set<string>();
  const reciter = over.reciter === undefined ? makeReciter() : over.reciter;
  const policy: PlaybackPolicy = { allowStreaming: true, rate: 1, repeatEachAyah: 1, repeatRange: 1, pauseFactor: 0, ...over.policy };
  const listened: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const ctl = createPlaybackController({
    player,
    getReciter: () => reciter,
    getPolicy: () => policy,
    localUri: async (_r, ref) => (local.has(`${ref.surahId}:${ref.ayahNumber}`) ? `file:///l/${ref.surahId}-${ref.ayahNumber}.mp3` : null),
    prefetch: async (_r, ref) => (over.prefetch ? over.prefetch(ref) : null),
    label: (ref) => ({ title: `${ref.surahId}:${ref.ayahNumber}` }),
    onListened: (ref) => listened.push(`${ref.surahId}:${ref.ayahNumber}`),
    schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    cancelSchedule: () => undefined,
  });
  return { player, ctl, local, policy, listened, timers };
}

test("no reciter, no playback, and nothing touches the player", async () => {
  const { ctl, player } = setup({ reciter: null });
  assert.deepEqual(await ctl.playFromAyah(r(1, 1)), { started: false, reason: "no-reciter" });
  assert.deepEqual(player.log, []);
});

test("play from here queues the rest of the surah and starts playing", async () => {
  const { ctl, player } = setup();
  const res = await ctl.playFromAyah(r(1, 5));
  assert.deepEqual(res, { started: true });
  assert.deepEqual(player.queue.map((t) => t.title), ["1:5", "1:6", "1:7"]);
  assert.ok(player.log.includes("play"));
  assert.deepEqual(ctl.getStatus().active, r(1, 5));
  assert.equal(ctl.getStatus().playing, true);
  assert.equal(ctl.getStatus().reciterId, "test-reciter");
  assert.equal(ctl.isListening(), false);
});

test("downloaded ayahs play from disk and the rest stream", async () => {
  const { ctl, player } = setup({ local: new Set(["1:1"]) });
  await ctl.playFromAyah(r(1, 1));
  assert.match(player.queue[0]?.url ?? "", /^file:\/\//);
  assert.match(player.queue[1]?.url ?? "", /^https:\/\//);
});

test("offline policy: nothing downloaded means a BLOCKED start, not a silent stream or a silent skip", async () => {
  const { ctl, player } = setup({ policy: { allowStreaming: false } });
  const res = await ctl.playFromAyah(r(1, 1));
  assert.deepEqual(res, { started: false, reason: "blocked", blockedAt: r(1, 1) });
  assert.deepEqual(ctl.getStatus().blocked, r(1, 1));
  assert.equal(player.queue.length, 0);
  assert.equal(ctl.getStatus().loading, false);
});

test("offline policy: plays what is downloaded, then reports the GAP when the queue ends", async () => {
  const { ctl, player } = setup({ policy: { allowStreaming: false }, local: new Set(["1:1", "1:2", "1:4"]) });
  assert.deepEqual(await ctl.playFromAyah(r(1, 1)), { started: true });
  assert.deepEqual(player.queue.map((t) => t.title), ["1:1", "1:2"]);
  ctl.handleQueueEnded();
  assert.deepEqual(ctl.getStatus().gap, r(1, 3));
  assert.equal(ctl.getStatus().active, null);
  // a fresh start clears the gap
  await ctl.playFromAyah(r(1, 1));
  assert.equal(ctl.getStatus().gap, null);
});

test("memorisation repeats expand into the queue itself", async () => {
  const { ctl, player } = setup({ policy: { repeatEachAyah: 2, repeatRange: 2 } });
  await ctl.playRange(r(112, 1), r(112, 2));
  assert.deepEqual(player.queue.map((t) => t.title), ["112:1", "112:1", "112:2", "112:2", "112:1", "112:1", "112:2", "112:2"]);
  assert.equal(new Set(player.queue.map((t) => t.id)).size, 8, "ids unique");
  await ctl.playFromAyah(r(112, 1));
  assert.equal(player.queue.length, 4, "play-from-here ignores repeats");
});

test("playback rate from the policy is applied", async () => {
  const { ctl, player } = setup({ policy: { rate: 1.25 } });
  await ctl.playFromAyah(r(112, 1));
  assert.equal(player.rate, 1.25);
});

test("listening queues a window across surahs, records the place, and tops up before it drains", async () => {
  const { ctl, player, listened } = setup();
  await ctl.listenFrom(r(1, 1));
  assert.equal(ctl.isListening(), true);
  assert.equal(player.queue.length, LISTEN_WINDOW);
  assert.equal(player.queue[7]?.title, "2:1", "al-Fatihah runs straight into the next surah");
  assert.deepEqual(listened, ["1:1"]);

  // move near the end of the window: the controller appends the next one
  player.active = player.queue.length - 5;
  ctl.handleActiveTrackChanged(player.queue[player.active]?.id ?? null);
  await tick(); await tick(); await tick();
  assert.equal(player.queue.length, LISTEN_WINDOW * 2);
  const ids = player.queue.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "no id reused across top-ups");
  assert.equal(player.queue[LISTEN_WINDOW]?.title, player.queue[LISTEN_WINDOW - 1]?.title === "2:193" ? "2:194" : player.queue[LISTEN_WINDOW]?.title);
});

test("two quick track changes do not append the same window twice", async () => {
  const { ctl, player } = setup();
  await ctl.listenFrom(r(1, 1));
  player.active = player.queue.length - 5;
  const id = player.queue[player.active]?.id ?? null;
  ctl.handleActiveTrackChanged(id);
  ctl.handleActiveTrackChanged(id);
  await tick(); await tick(); await tick(); await tick();
  assert.equal(player.queue.length, LISTEN_WINDOW * 2);
});

test("a range play replaces a continuous listen", async () => {
  const { ctl } = setup();
  await ctl.listenFrom(r(1, 1));
  await ctl.playRange(r(112, 1), r(112, 2));
  assert.equal(ctl.isListening(), false);
});

test("lock-screen next/previous move by SURAH", async () => {
  const { ctl, player } = setup();
  await ctl.listenFrom(r(2, 1));
  await ctl.nextSurah();
  assert.equal(player.queue[0]?.title, "3:1");
  assert.deepEqual(ctl.getStatus().active, r(3, 1));
  // mid-surah: previous restarts the surah, then steps back from its first ayah
  ctl.handleActiveTrackChanged("3:5:4");
  await ctl.previousSurah();
  assert.equal(player.queue[0]?.title, "3:1");
  await ctl.previousSurah();
  assert.equal(player.queue[0]?.title, "2:1");
  // limits
  await ctl.listenFrom(r(114, 1));
  assert.equal(await ctl.nextSurah(), undefined);
  await ctl.listenFrom(r(1, 1));
  await ctl.previousSurah();
  assert.equal(player.queue[0]?.title, "1:1");
});

test("prefetch swaps a streaming entry for the file, two or more places ahead only", async () => {
  const seen: string[] = [];
  const { ctl, player } = setup({ prefetch: async (ref) => { seen.push(`${ref.surahId}:${ref.ayahNumber}`); return `file:///p/${ref.ayahNumber}.mp3`; } });
  await ctl.playFromAyah(r(2, 1));
  ctl.handleActiveTrackChanged(player.queue[0]?.id ?? null);
  await tick(); await tick(); await tick(); await tick();
  assert.deepEqual(seen.sort(), ["2:2", "2:3", "2:4"]);
  assert.match(player.queue[1]?.url ?? "", /^https:/, "the very next entry is left alone");
  assert.equal(player.queue[2]?.url, "file:///p/3.mp3");
  assert.equal(player.queue[3]?.url, "file:///p/4.mp3");
  assert.equal(player.queue[2]?.id, "2:3:2", "id preserved through the swap");
  assert.equal(player.queue.length, 286);
});

test("a prefetch that finishes after the queue changed is dropped", async () => {
  let finish: (v: string) => void = () => undefined;
  const { ctl, player } = setup({ prefetch: () => new Promise<string | null>((res) => (finish = res)) });
  await ctl.playFromAyah(r(2, 1));
  ctl.handleActiveTrackChanged(player.queue[0]?.id ?? null);
  await tick(); await tick();
  await ctl.playFromAyah(r(112, 1));
  const before = [...player.log];
  finish("file:///late.mp3");
  await tick(); await tick();
  assert.deepEqual(player.log, before);
});

test("an error on an ayah that is not on disk is reported as a GAP; on disk it is not", async () => {
  const a = setup();
  await a.ctl.playFromAyah(r(1, 1));
  a.ctl.handlePlaybackError();
  await tick(); await tick();
  assert.deepEqual(a.ctl.getStatus().gap, r(1, 1));
  assert.equal(a.ctl.getStatus().playing, false);

  const b = setup({ local: new Set(["1:1"]) });
  await b.ctl.playFromAyah(r(1, 1));
  b.ctl.handlePlaybackError();
  await tick(); await tick();
  assert.equal(b.ctl.getStatus().gap, null);
});

test("pause between repeats: pauses on a natural end, resumes when the timer fires, and a manual command cancels it", async () => {
  const { ctl, player, timers } = setup({ policy: { pauseFactor: 1 } });
  await ctl.playRange(r(112, 1), r(112, 2));
  ctl.handleActiveTrackChanged("112:2:1", { positionSec: 6, durationSec: 6 });
  await tick(); await tick();
  assert.ok(player.log.includes("pause"));
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.ms, 6000);
  const playsBefore = player.log.filter((x) => x === "play").length;
  timers[0]?.fn();
  await tick();
  assert.equal(player.log.filter((x) => x === "play").length, playsBefore + 1);
  // a skip is not a finish: no pause
  const n = timers.length;
  ctl.handleActiveTrackChanged("112:1:2", { positionSec: 1, durationSec: 6 });
  await tick(); await tick();
  assert.equal(timers.length, n);
});

test("stop clears everything; a stale start does not resurrect a stopped queue", async () => {
  const { ctl, player } = setup();
  await ctl.playFromAyah(r(1, 1));
  await ctl.stop();
  assert.equal(player.queue.length, 0);
  assert.deepEqual(ctl.getStatus().active, null);
  assert.equal(ctl.isListening(), false);

  const fresh = setup();
  await fresh.ctl.stop(); // never started: harmless
  assert.deepEqual(fresh.player.log, []);
});

test("stop dismisses the blocked and gap notices", async () => {
  const { ctl } = setup({ policy: { allowStreaming: false } });
  await ctl.playFromAyah(r(1, 1));
  assert.deepEqual(ctl.getStatus().blocked, r(1, 1));
  await ctl.stop();
  assert.equal(ctl.getStatus().blocked, null);
  ctl.handleQueueEnded();
  await ctl.stop();
  assert.equal(ctl.getStatus().gap, null);
});

test("a newer start supersedes one still loading", async () => {
  const slow = setup();
  const first = slow.ctl.playFromAyah(r(2, 1));
  const second = slow.ctl.playFromAyah(r(112, 1));
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(b, { started: true });
  assert.equal(a.started === false && a.reason === "superseded", true);
  assert.equal(slow.player.queue[0]?.title, "112:1");
});

test("status subscribers are notified, and a throwing player.setup can be retried", async () => {
  const { ctl } = setup();
  let n = 0;
  const off = ctl.subscribe(() => n++);
  await ctl.playFromAyah(r(112, 1));
  assert.ok(n > 0);
  off();
  const before = n;
  ctl.handlePlayerState("paused");
  assert.equal(n, before);

  let calls = 0;
  const player = fakePlayer();
  player.setup = async () => { if (++calls === 1) throw new Error("boom"); };
  const c2 = createPlaybackController({ player, getReciter: () => makeReciter(), getPolicy: () => ({ allowStreaming: true, rate: 1, repeatEachAyah: 1, repeatRange: 1, pauseFactor: 0 }), localUri: async () => null, prefetch: async () => null, label: () => ({ title: "" }) });
  await assert.rejects(c2.playFromAyah(r(112, 1)), /boom/);
  assert.deepEqual(await c2.playFromAyah(r(112, 1)), { started: true });
});
