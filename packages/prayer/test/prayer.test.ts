import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRY_DEFAULTS, METHODS, TimingsError, applyOffsets, assertSane, computePrayerDay, countdownParts, currentPhase, formatClock,
  formatCountdown, hijriMonthName, nextEvent, parseClock, resolveMethod, tabularHijri, toHijri,
} from "../src/index.ts";
import type { CalcInput, TimesCalculator } from "../src/index.ts";

// Synthetic timings: this package is tested with a fake calculator; the real adhan-based one
// is exercised in CI via tests/mihrab-vendored.test.ts and apps/mobile.
const T = { Fajr: "04:40", Sunrise: "06:00", Dhuhr: "11:55", Asr: "15:20", Maghrib: "17:50", Isha: "19:05" };
const fakeCalc: TimesCalculator = (i: CalcInput) => ({ timings: { ...T, Imsak: i.school === 1 ? "04:30" : "04:29" } });

test("clock helpers round-trip and wrap past midnight", () => {
  assert.equal(parseClock("07:05"), 425);
  assert.equal(formatClock(425), "07:05");
  assert.equal(formatClock(-5), "23:55");
  assert.equal(formatClock(1445), "00:05");
  assert.throws(() => parseClock("7:05"), TimingsError);
  assert.throws(() => parseClock("24:00"), TimingsError);
});

test("sanity check rejects missing, malformed and out-of-order times", () => {
  assert.doesNotThrow(() => assertSane({ ...T }));
  assert.throws(() => assertSane({ ...T, Asr: "3:20pm" }), /HH:MM/);
  assert.throws(() => assertSane({ ...T, Dhuhr: "17:00" }), /out of order/);
  const { Isha: _i, ...missing } = T;
  assert.throws(() => assertSane(missing), /Isha is missing/);
});

test("method resolution: user > country > auto, and the source is reported", () => {
  assert.deepEqual(resolveMethod({ userMethodId: null, userSchool: null, countryCode: "BD" }), { methodId: 1, school: 1, source: "country" });
  assert.deepEqual(resolveMethod({ userMethodId: 3, userSchool: null, countryCode: "BD" }), { methodId: 3, school: 1, source: "user" });
  assert.deepEqual(resolveMethod({ userMethodId: null, userSchool: 0, countryCode: "bd" }), { methodId: 1, school: 0, source: "country" });
  assert.deepEqual(resolveMethod({ userMethodId: null, userSchool: null, countryCode: "ZZ" }), { methodId: "auto", school: 0, source: "auto" });
  assert.deepEqual(resolveMethod({ userMethodId: null, userSchool: null, countryCode: null }), { methodId: "auto", school: 0, source: "auto" });
  for (const d of Object.values(COUNTRY_DEFAULTS)) assert.ok(METHODS.some((m) => m.id === d.methodId), "every default method must be supported");
});

test("computePrayerDay records its basis and applies manual offsets", () => {
  const where = { latitude: 23.8, longitude: 90.4 };
  const day = computePrayerDay(fakeCalc, where, new Date(2026, 9, 7), { methodId: 1, school: 1, source: "country" }, { Fajr: -2, Isha: 10 });
  assert.equal(day.timings.Fajr, "04:38");
  assert.equal(day.timings.Isha, "19:15");
  assert.equal(day.timings.Dhuhr, "11:55");
  assert.equal(day.timings["Imsak"], "04:30"); // untouched extras pass through
  assert.deepEqual([day.basis.methodName, day.basis.school, day.basis.source, day.basis.date], ["University of Islamic Sciences, Karachi", 1, "country", "2026-10-07"]);
  assert.throws(() => computePrayerDay(() => ({ timings: { ...T, Asr: "03:00" } }), where, new Date(), { methodId: 3, school: 0, source: "auto" }), TimingsError);
  assert.deepEqual(applyOffsets(T as never, {}), T);
});

test("next event: mid-day, before Fajr, after Isha (rolls to tomorrow's Fajr), and exact boundary", () => {
  const at = (h: number, m: number, s = 0) => new Date(2026, 9, 7, h, m, s);
  const n1 = nextEvent(T as never, T as never, at(13, 0));
  assert.equal(n1.name, "Asr");
  assert.equal(n1.secondsLeft, 2 * 3600 + 20 * 60);
  assert.equal(nextEvent(T as never, T as never, at(2, 0)).name, "Fajr");
  const late = nextEvent(T as never, { ...T, Fajr: "04:41" } as never, at(22, 0));
  assert.equal(late.name, "Fajr");
  assert.equal(late.at.getDate(), 8);
  assert.equal(late.secondsLeft, (6 * 60 + 41) * 60);
  assert.equal(nextEvent(T as never, T as never, at(11, 55, 0)).name, "Asr"); // at the exact time, the event has started
});

test("current phase", () => {
  const at = (h: number, m: number) => new Date(2026, 9, 7, h, m);
  assert.equal(currentPhase(T as never, at(3, 0)), "Night");
  assert.equal(currentPhase(T as never, at(5, 0)), "Fajr");
  assert.equal(currentPhase(T as never, at(6, 30)), "Sunrise");
  assert.equal(currentPhase(T as never, at(12, 0)), "Dhuhr");
  assert.equal(currentPhase(T as never, at(23, 0)), "Isha");
});

test("countdown formatting", () => {
  assert.deepEqual(countdownParts(3725), { hours: 1, minutes: 2, seconds: 5 });
  assert.equal(formatCountdown(3725), "01:02:05");
  assert.equal(formatCountdown(-4), "00:00:00");
});

test("tabular Hijri is continuous for two centuries, with 29/30-day months and 354/355-day years", () => {
  let prev = tabularHijri(1900, 1, 1);
  const monthLen = new Map<string, number>();
  for (let i = 1; i < 366 * 200; i++) {
    const d = new Date(1900, 0, 1 + i, 12);
    const cur = tabularHijri(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (cur.year === prev.year && cur.month === prev.month) assert.equal(cur.day, prev.day + 1, `gap at ${d.toDateString()}`);
    else {
      assert.equal(cur.day, 1, `month did not restart at day 1 on ${d.toDateString()}`);
      monthLen.set(`${prev.year}-${prev.month}`, prev.day);
    }
    prev = cur;
  }
  for (const [k, len] of monthLen) assert.ok(len === 29 || len === 30, `${k} has ${len} days`);
  const yearLen = new Map<number, number>();
  for (const [k, len] of monthLen) { const y = Number(k.split("-")[0]); yearLen.set(y, (yearLen.get(y) ?? 0) + len); }
  const full = [...yearLen].filter(([y]) => y > 1318 && y < 1500); // skip the partial first/last years
  assert.ok(full.every(([, len]) => len === 354 || len === 355));
  assert.equal(full.filter(([, len]) => len === 355).length >= 11 * (full.length / 30 - 1), true);
});

test("Hijri service: Umm al-Qura when ICU has it, always within a day of the tabular calendar, offsets shift it", () => {
  const sample = toHijri(new Date(2025, 5, 26));
  assert.ok(sample.source === "umalqura" || sample.source === "tabular");
  let worst = 0;
  for (let i = 0; i < 366 * 10; i++) {
    const d = new Date(2020, 0, 1 + i);
    const a = toHijri(d);
    const b = toHijri(d, { source: "tabular" });
    const toDays = (h: { year: number; month: number; day: number }) => h.year * 354.367 + (h.month - 1) * 29.53 + h.day;
    worst = Math.max(worst, Math.abs(toDays(a) - toDays(b)));
  }
  assert.ok(worst <= 2.5, `calendars diverge by ${worst.toFixed(2)} days`);
  const base = toHijri(new Date(2026, 2, 10), { source: "tabular" });
  const plus1 = toHijri(new Date(2026, 2, 10), { source: "tabular", offsetDays: 1 });
  const next = toHijri(new Date(2026, 2, 11), { source: "tabular" });
  assert.deepEqual([plus1.year, plus1.month, plus1.day], [next.year, next.month, next.day]);
  assert.notDeepEqual(base, plus1);
  assert.equal(hijriMonthName(9), "Ramadan");
});

test("Hijri: mid-March 2024 is Ramadan 1445 in both calendars", () => {
  for (const source of ["auto", "tabular"] as const) {
    const h = toHijri(new Date(2024, 2, 15), { source });
    assert.deepEqual([h.year, h.month], [1445, 9]);
  }
});
