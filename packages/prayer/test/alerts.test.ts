import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_ID_PREFIX, DEFAULT_ALERT_SETTINGS, alertId, computeRange, diffAlerts, planAlerts } from "../src/index.ts";
import type { PrayerDay, TimesCalculator } from "../src/index.ts";

const T = { Fajr: "04:40", Sunrise: "06:00", Dhuhr: "11:55", Asr: "15:20", Maghrib: "17:50", Isha: "19:05" };
const calc: TimesCalculator = () => ({ timings: { ...T } });
const choice = { methodId: 1, school: 1 as const, source: "user" as const };
const where = { latitude: 23.8, longitude: 90.4 };
const days = (start: Date, n: number): PrayerDay[] =>
  computeRange(calc, where, start, n, choice).map((r) => (r.result.ok ? r.result.day : (undefined as never)));
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

test("plan covers five prayers per day, soonest first, skipping what already passed", () => {
  const plan = planAlerts({ days: days(new Date(2026, 9, 7), 2), settings: DEFAULT_ALERT_SETTINGS, now: at(7, 12, 0) });
  assert.deepEqual(plan.map((p) => `${p.dayKey} ${p.event}`), [
    "2026-10-07 Asr", "2026-10-07 Maghrib", "2026-10-07 Isha",
    "2026-10-08 Fajr", "2026-10-08 Dhuhr", "2026-10-08 Asr", "2026-10-08 Maghrib", "2026-10-08 Isha",
  ]);
  assert.ok(plan.every((p) => p.kind === "adhan" && p.id.startsWith(ALERT_ID_PREFIX)));
  assert.equal(plan[0]?.at.getHours(), 15);
  assert.equal(plan[0]?.clock, "15:20");
});

test("ids are deterministic and unique", () => {
  const a = planAlerts({ days: days(new Date(2026, 9, 7), 3), settings: DEFAULT_ALERT_SETTINGS, now: at(7, 0, 0) });
  const b = planAlerts({ days: days(new Date(2026, 9, 7), 3), settings: DEFAULT_ALERT_SETTINGS, now: at(7, 0, 0) });
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.equal(new Set(a.map((x) => x.id)).size, a.length);
  assert.equal(alertId("2026-10-07", "Fajr", "adhan"), "tarteel.2026-10-07.Fajr.adhan");
});

test("an alert about to fire inside the minimum lead time is skipped; exactly outside it is kept", () => {
  const s = DEFAULT_ALERT_SETTINGS;
  const justBefore = new Date(2026, 9, 7, 15, 19, 58); // Asr in 2s
  assert.equal(planAlerts({ days: days(new Date(2026, 9, 7), 1), settings: s, now: justBefore })[0]?.event, "Maghrib");
  const farEnough = new Date(2026, 9, 7, 15, 19, 55); // exactly 5s
  assert.equal(planAlerts({ days: days(new Date(2026, 9, 7), 1), settings: s, now: farEnough })[0]?.event, "Asr");
});

test("disabled prayers, sunrise and before-reminders", () => {
  const settings = { prayers: { Fajr: false, Dhuhr: true, Asr: false, Maghrib: true, Isha: false }, sunrise: true, beforeMinutes: 15 };
  const plan = planAlerts({ days: days(new Date(2026, 9, 7), 1), settings, now: at(7, 0, 0) });
  assert.deepEqual(plan.map((p) => `${p.event}:${p.kind}`), ["Sunrise:sunrise", "Dhuhr:before", "Dhuhr:adhan", "Maghrib:before", "Maghrib:adhan"]);
  const dh = plan.find((p) => p.id === alertId("2026-10-07", "Dhuhr", "before"));
  assert.equal(dh?.at.getHours() * 60 + (dh?.at.getMinutes() ?? 0), 11 * 60 + 40);
  assert.equal(dh?.clock, "11:55"); // clock is the prayer's own time
  assert.equal(planAlerts({ days: days(new Date(2026, 9, 7), 1), settings: { ...settings, beforeMinutes: null }, now: at(7, 0, 0) }).filter((p) => p.kind === "before").length, 0);
});

test("a before-reminder that is already in the past is dropped while the adhan itself is kept", () => {
  const settings = { ...DEFAULT_ALERT_SETTINGS, beforeMinutes: 30 };
  const early = planAlerts({ days: days(new Date(2026, 9, 7), 1), settings, now: at(7, 14, 0) }); // reminder 14:50 still ahead
  assert.deepEqual(early.slice(0, 2).map((p) => `${p.event}:${p.kind}`), ["Asr:before", "Asr:adhan"]);
  const late = planAlerts({ days: days(new Date(2026, 9, 7), 1), settings, now: at(7, 15, 0) }); // reminder passed, Asr 15:20 ahead
  assert.deepEqual(late.slice(0, 2).map((p) => `${p.event}:${p.kind}`), ["Asr:adhan", "Maghrib:before"]);
});

test("limit keeps the soonest alerts", () => {
  const plan = planAlerts({ days: days(new Date(2026, 9, 7), 10), settings: DEFAULT_ALERT_SETTINGS, now: at(7, 0, 0), limit: 7 });
  assert.equal(plan.length, 7);
  assert.equal(plan[6]?.dayKey, "2026-10-08");
});

test("diff: create what is missing, cancel what is no longer planned, recreate what moved, never touch foreign ids", () => {
  const planned = planAlerts({ days: days(new Date(2026, 9, 7), 1), settings: DEFAULT_ALERT_SETTINGS, now: at(7, 12, 0) });
  const [asr, maghrib, isha] = planned as [typeof planned[0], typeof planned[0], typeof planned[0]];
  const scheduled = [
    { id: asr.id, at: asr.at.getTime() },                       // correct
    { id: maghrib.id, at: maghrib.at.getTime() + 10 * 60_000 }, // moved by 10 min
    { id: alertId("2026-10-06", "Isha", "adhan"), at: 1 },      // stale (ours)
    { id: "someone-elses-notification", at: 2 },                // not ours
  ];
  const d = diffAlerts(scheduled, planned);
  assert.deepEqual(d.toCreate.map((x) => x.id), [maghrib.id, isha.id]);
  assert.deepEqual(d.toCancel.sort(), [maghrib.id, alertId("2026-10-06", "Isha", "adhan")].sort());
  assert.ok(!d.toCancel.includes("someone-elses-notification"));
  assert.deepEqual(diffAlerts(planned.map((p) => ({ id: p.id, at: p.at.getTime() })), planned), { toCreate: [], toCancel: [] });
  assert.equal(diffAlerts(planned.map((p) => ({ id: p.id, at: p.at.getTime() + 20_000 })), planned).toCreate.length, 0); // within tolerance
});

test("computeRange spans month ends and reports bad days", () => {
  const rows = computeRange(calc, where, new Date(2026, 9, 30), 4, choice);
  assert.deepEqual(rows.map((r) => r.date.getDate()), [30, 31, 1, 2]);
  assert.equal(rows[2]?.date.getMonth(), 10);
  const bad: TimesCalculator = (i) => ({ timings: i.date.getDate() === 31 ? { ...T, Asr: "03:00" } : { ...T } });
  const r2 = computeRange(bad, where, new Date(2026, 9, 30), 3, choice);
  assert.deepEqual(r2.map((r) => r.result.ok), [true, false, true]);
});
