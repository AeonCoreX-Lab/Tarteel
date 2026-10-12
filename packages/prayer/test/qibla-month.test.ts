import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMonth, distanceToKaabaKm, headingQuality, isAligned, qiblaBearing, shiftMonth, turnToward } from "../src/index.ts";
import type { TimesCalculator } from "../src/index.ts";

const near = (actual: number | null, expected: number, tol: number, what: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${what}: got ${actual}, expected ${expected} +-${tol}`);

test("qibla bearing matches widely published values for well-known cities (+-1 degree)", () => {
  near(qiblaBearing(51.5074, -0.1278), 119, 1, "London");
  near(qiblaBearing(40.7128, -74.006), 58.5, 1, "New York");
  near(qiblaBearing(23.8103, 90.4125), 277.5, 1.5, "Dhaka");
  near(qiblaBearing(-33.8688, 151.2093), 277, 1.5, "Sydney");
});

test("qibla bearing: cardinal sanity and the Kaaba itself", () => {
  const south = qiblaBearing(10, 39.8262); // due south of the Kaaba -> must point roughly north
  assert.ok(south !== null && (south < 2 || south > 358));
  assert.equal(qiblaBearing(21.4225, 39.8262), null);
  const b = qiblaBearing(35, 139) as number;
  assert.ok(b >= 0 && b < 360);
});

test("distance to the Kaaba is plausible", () => {
  assert.ok(distanceToKaabaKm(51.5074, -0.1278) > 4700 && distanceToKaabaKm(51.5074, -0.1278) < 4900);
  assert.ok(distanceToKaabaKm(40.7128, -74.006) > 10200 && distanceToKaabaKm(40.7128, -74.006) < 10400);
  assert.ok(distanceToKaabaKm(21.4225, 39.8262) < 0.01);
});

test("turning direction takes the short way round the compass", () => {
  assert.equal(turnToward(350, 10), 20);
  assert.equal(turnToward(10, 350), -20);
  assert.equal(turnToward(90, 90), 0);
  assert.equal(Math.abs(turnToward(0, 180)), 180);
  assert.equal(isAligned(358, 1, 3), true);
  assert.equal(isAligned(300, 277, 3), false);
});

test("heading quality thresholds", () => {
  assert.deepEqual([3, 2, 1, 0, -1].map(headingQuality), ["good", "fair", "poor", "poor", "poor"]);
});

const T = { Fajr: "04:40", Sunrise: "06:00", Dhuhr: "11:55", Asr: "15:20", Maghrib: "17:50", Isha: "19:05" };
const choice = { methodId: 1, school: 1 as const, source: "user" as const };
const where = { latitude: 23.8, longitude: 90.4 };

test("month has the right number of days (leap years included) and one result per day", () => {
  const calc: TimesCalculator = () => ({ timings: { ...T } });
  assert.equal(computeMonth(calc, where, 2026, 2, choice).length, 28);
  assert.equal(computeMonth(calc, where, 2028, 2, choice).length, 29);
  assert.equal(computeMonth(calc, where, 2026, 10, choice).length, 31);
  assert.equal(computeMonth(calc, where, 2026, 4, choice).length, 30);
  const rows = computeMonth(calc, where, 2026, 10, choice, { Fajr: 1 });
  assert.ok(rows.every((r) => r.result.ok && r.result.day.timings.Fajr === "04:41"));
  assert.equal(rows[6]?.date.getDate(), 7);
});

test("a bad day is reported, not hidden, and does not abort the month", () => {
  const calc: TimesCalculator = (i) => ({ timings: i.date.getDate() === 15 ? { ...T, Asr: "03:00" } : { ...T } });
  const rows = computeMonth(calc, where, 2026, 10, choice);
  const bad = rows.filter((r) => !r.result.ok);
  assert.deepEqual(bad.map((r) => r.day), [15]);
  assert.equal(rows.filter((r) => r.result.ok).length, 30);
});

test("month navigation wraps years both ways", () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 10, 14), { year: 2027, month: 12 });
  assert.deepEqual(shiftMonth(2026, 10, 0), { year: 2026, month: 10 });
});
