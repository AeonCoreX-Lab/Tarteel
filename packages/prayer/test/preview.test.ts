import { test } from "node:test";
import assert from "node:assert/strict";
import { previewAsrBySchool, validateCoordinates } from "../src/index.ts";
import type { TimesCalculator } from "../src/index.ts";

test("coordinates: accepts real places, rejects null island, NaN, strings and out-of-range", () => {
  assert.deepEqual(validateCoordinates(23.8103, 90.4125), { ok: true, latitude: 23.8103, longitude: 90.4125 });
  assert.deepEqual(validateCoordinates(0, 0), { ok: false, reason: "null-island" });
  assert.deepEqual(validateCoordinates(0, 10), { ok: true, latitude: 0, longitude: 10 }); // equator is fine
  assert.deepEqual(validateCoordinates(NaN, 1), { ok: false, reason: "not-a-number" });
  assert.deepEqual(validateCoordinates("23", 90), { ok: false, reason: "not-a-number" });
  assert.deepEqual(validateCoordinates(Infinity, 0), { ok: false, reason: "not-a-number" });
  assert.deepEqual(validateCoordinates(91, 0), { ok: false, reason: "out-of-range" });
  assert.deepEqual(validateCoordinates(10, -181), { ok: false, reason: "out-of-range" });
  assert.equal(validateCoordinates(-90, 180).ok, true);
});

const base = { Fajr: "04:40", Sunrise: "06:00", Dhuhr: "11:55", Sunrise2: "x", Maghrib: "17:50", Isha: "19:05" };
const calc: TimesCalculator = (i) => ({ timings: { ...base, Asr: i.school === 1 ? "16:05" : "15:20" } });

test("Asr preview reports both schools and the difference, using the same method and place", () => {
  const seen: unknown[] = [];
  const spy: TimesCalculator = (i) => (seen.push([i.methodId, i.school, i.latitude]), calc(i));
  const p = previewAsrBySchool(spy, { latitude: 23.8, longitude: 90.4 }, new Date(2026, 9, 8), 1);
  assert.deepEqual(p, { standard: "15:20", hanafi: "16:05", differenceMinutes: 45 });
  assert.deepEqual(seen, [[1, 0, 23.8], [1, 1, 23.8]]);
});

test("Asr preview refuses to show times from an invalid day", () => {
  const bad: TimesCalculator = () => ({ timings: { ...base, Asr: "03:00" } });
  assert.throws(() => previewAsrBySchool(bad, { latitude: 1, longitude: 1 }, new Date(), 3));
});
