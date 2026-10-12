import { test } from "node:test";
import assert from "node:assert/strict";
import { arcPath, arcPoint, dayArc } from "../src/index.ts";

const T = { Fajr: "04:40", Sunrise: "06:00", Dhuhr: "11:55", Asr: "15:20", Maghrib: "17:50", Isha: "19:05" };
const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);
const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("ticks run from 0 (Fajr) to 1 (Isha), in order, proportional to clock time", () => {
  const { ticks } = dayArc(T as never, at(12));
  assert.deepEqual(ticks.map((t) => t.event), ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  near(ticks[0]!.at, 0);
  near(ticks[5]!.at, 1);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i]!.at > ticks[i - 1]!.at);
  // span 04:40 -> 19:05 = 865 min; Dhuhr at 11:55 = 435 min in
  near(ticks[2]!.at, 435 / 865);
});

test("progress is clamped before Fajr and after Isha, and exact in between", () => {
  assert.equal(dayArc(T as never, at(2)).progress, 0);
  assert.equal(dayArc(T as never, at(23)).progress, 1);
  near(dayArc(T as never, at(11, 55)).progress, 435 / 865);
  assert.equal(dayArc(T as never, at(11, 55)).phase, "Dhuhr");
  assert.equal(dayArc(T as never, at(2)).phase, "Night");
});

test("degenerate day (Isha not after Fajr) does not divide by zero", () => {
  const bad = { ...T, Isha: "04:40" };
  const a = dayArc(bad as never, at(12));
  assert.equal(a.progress, 0);
  assert.ok(a.ticks.every((t) => Number.isFinite(t.at)));
});

test("arc geometry: ends, top, and path shape", () => {
  const l = arcPoint(150, 140, 100, 0);
  const t = arcPoint(150, 140, 100, 0.5);
  const r = arcPoint(150, 140, 100, 1);
  near(l.x, 50); near(l.y, 140, 1e-6);
  near(t.x, 150, 1e-6); near(t.y, 40);
  near(r.x, 250); near(r.y, 140, 1e-6);
  assert.equal(arcPath(150, 140, 100, 0.3, 0.3), "");
  assert.match(arcPath(150, 140, 100, 0, 1), /^M 50 140 A 100 100 0 0 1 250 140$/);
  assert.equal(arcPoint(0, 0, 10, -5).x, arcPoint(0, 0, 10, 0).x); // f is clamped
});
