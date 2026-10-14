import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRepeats, buildTracks, canSwapAt, listenWindow, MAX_QUEUE_TRACKS, parseTrackId, pauseBetweenRepeatsMs, prefetchTargets, trackId } from "../src/queue.ts";
import { expandRange } from "../src/refs.ts";
import type { PlayerTrack } from "../src/types.ts";
import { makeReciter } from "./helpers.ts";

const r = (s: number, a: number) => ({ surahId: s, ayahNumber: a });
const label = (ref: { surahId: number; ayahNumber: number }) => ({ title: `${ref.surahId}:${ref.ayahNumber}` });

test("track ids round trip and stay unique for repeated ayahs", () => {
  assert.equal(trackId(r(2, 255), 7), "2:255:7");
  assert.deepEqual(parseTrackId("2:255:7"), r(2, 255));
  assert.equal(parseTrackId("garbage"), null);
  assert.equal(parseTrackId("2:255"), null);
});

test("repeats: each ayah x N, then the whole range x M", () => {
  const base = [r(112, 1), r(112, 2)];
  assert.deepEqual(applyRepeats(base, 1, 1), base);
  assert.deepEqual(applyRepeats(base, 2, 1), [r(112, 1), r(112, 1), r(112, 2), r(112, 2)]);
  assert.deepEqual(applyRepeats(base, 1, 2), [...base, ...base]);
  assert.equal(applyRepeats(base, 2, 3).length, 12);
  // clamps nonsense
  assert.equal(applyRepeats(base, 0, 0).length, 2);
  assert.equal(applyRepeats(base, 99, 99).length, 2 * 10 * 10);
  assert.equal(applyRepeats(base, Number.NaN, 1).length, 2);
});

test("repeats can never build a pathological queue", () => {
  const long = expandRange(r(2, 1), r(2, 286));
  const out = applyRepeats(long, 10, 10);
  assert.ok(out.length <= MAX_QUEUE_TRACKS);
  // range repeats are trimmed before ayah repeats
  assert.equal(applyRepeats(long, 2, 10).length, 572);
});

test("listenWindow walks across surah boundaries and reports where to resume", () => {
  const w = listenWindow(r(1, 6), 4);
  assert.deepEqual(w.refs, [r(1, 6), r(1, 7), r(2, 1), r(2, 2)]);
  assert.deepEqual(w.cursor, r(2, 3));
  const end = listenWindow(r(114, 5), 10);
  assert.deepEqual(end.refs, [r(114, 5), r(114, 6)]);
  assert.equal(end.cursor, null);
});

test("tracks use the local file when there is one and the stream otherwise", () => {
  const reciter = makeReciter();
  const { tracks, blockedAt } = buildTracks({
    refs: [r(1, 1), r(1, 2)],
    reciter,
    localUri: (ref) => (ref.ayahNumber === 1 ? "file:///a/001001.mp3" : null),
    allowStreaming: true,
    label,
  });
  assert.equal(blockedAt, null);
  assert.equal(tracks[0]?.url, "file:///a/001001.mp3");
  assert.equal(tracks[1]?.url, "https://audio.example.invalid/data/test/001002.mp3");
  assert.equal(tracks[1]?.artist, "Test Reciter");
  assert.equal(tracks[1]?.id, "1:2:1");
});

test("with streaming off the queue STOPS at the first missing ayah rather than silently skipping it", () => {
  const { tracks, blockedAt } = buildTracks({
    refs: [r(1, 1), r(1, 2), r(1, 3)],
    reciter: makeReciter(),
    localUri: (ref) => (ref.ayahNumber === 2 ? null : `file:///x/${ref.ayahNumber}`),
    allowStreaming: false,
    label,
  });
  assert.equal(tracks.length, 1);
  assert.deepEqual(blockedAt, r(1, 2));
});

test("index offset keeps ids unique across top-ups", () => {
  const a = buildTracks({ refs: [r(1, 1)], reciter: makeReciter(), localUri: () => "file:///x", allowStreaming: false, label, indexOffset: 0 });
  const b = buildTracks({ refs: [r(1, 1)], reciter: makeReciter(), localUri: () => "file:///x", allowStreaming: false, label, indexOffset: 1 });
  assert.notEqual(a.tracks[0]?.id, b.tracks[0]?.id);
});

test("pause between repeats: natural end only, scaled, capped, and off at factor 0", () => {
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 6, lastPositionSec: 6, factor: 0 }), null);
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 6, lastPositionSec: 2, factor: 1 }), null, "a skip is not a finish");
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 6, lastPositionSec: 5.7, factor: 1 }), 6000);
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 6, lastPositionSec: 6, factor: 1.5 }), 9000);
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 60, lastPositionSec: 60, factor: 2 }), 30000);
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 0, lastPositionSec: 0, factor: 1 }), null);
  assert.equal(pauseBetweenRepeatsMs({ lastDurationSec: 0.1, lastPositionSec: 0.1, factor: 1 }), null, "too short to matter");
});

test("prefetch targets: only upcoming remote entries within the window", () => {
  const q: PlayerTrack[] = [
    { id: "1:1:0", url: "file:///a", title: "", artist: "" },
    { id: "1:2:1", url: "https://h.invalid/2", title: "", artist: "" },
    { id: "1:3:2", url: "file:///c", title: "", artist: "" },
    { id: "1:4:3", url: "https://h.invalid/4", title: "", artist: "" },
    { id: "1:5:4", url: "https://h.invalid/5", title: "", artist: "" },
    { id: "1:6:5", url: "https://h.invalid/6", title: "", artist: "" },
  ];
  assert.deepEqual(prefetchTargets(q, 0).map((t) => t.index), [1, 3]);
  assert.deepEqual(prefetchTargets(q, 4).map((t) => t.index), [5]);
  assert.deepEqual(prefetchTargets(q, 5), []);
});

test("swap only entries two or more places ahead: the next one may already be buffering", () => {
  assert.equal(canSwapAt(1, 0), false);
  assert.equal(canSwapAt(2, 0), true);
  assert.equal(canSwapAt(5, null), false);
});
