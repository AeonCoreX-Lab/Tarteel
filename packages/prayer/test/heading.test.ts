import { test } from "node:test";
import assert from "node:assert/strict";
import { createHeadingSmoother, headingSpread, headingStability } from "../src/index.ts";

test("smoother converges to a steady heading and returns the first sample unchanged", () => {
  const s = createHeadingSmoother(0.3);
  assert.ok(Math.abs(s.push(90) - 90) < 1e-9);
  let last = 0;
  for (let i = 0; i < 60; i++) last = s.push(120);
  assert.ok(Math.abs(last - 120) < 0.01, `got ${last}`);
});

test("smoother is circular-safe: jitter across north stays near north, never swings through 180", () => {
  const s = createHeadingSmoother(0.25);
  const out: number[] = [];
  for (let i = 0; i < 40; i++) out.push(s.push(i % 2 === 0 ? 358 : 2));
  for (const v of out.slice(5)) assert.ok(v > 355 || v < 5, `unexpected ${v}`);
});

test("smoother reduces jitter relative to the raw samples", () => {
  const s = createHeadingSmoother(0.2);
  const raw = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 8 : -8));
  const smoothed = raw.map((r) => s.push(r)).slice(20);
  assert.ok(headingSpread(smoothed) < headingSpread(raw.slice(20)) / 2);
});

test("reset and invalid alpha", () => {
  const s = createHeadingSmoother();
  s.push(10); s.reset();
  assert.ok(Math.abs(s.push(200) - 200) < 1e-9);
  assert.throws(() => createHeadingSmoother(0), RangeError);
  assert.throws(() => createHeadingSmoother(1.5), RangeError);
});

test("stability: steady = high, wrapping around north is still steady, chaotic = low, few samples = neutral", () => {
  assert.equal(headingStability([100, 100, 100, 100, 100]), 100);
  assert.ok(headingStability([359, 1, 0, 358, 2, 0]) > 80);
  assert.ok(headingStability([0, 90, 180, 270, 45, 225]) < 20);
  assert.equal(headingStability([10, 200]), 55);
  assert.equal(headingSpread([5]), 0);
});
