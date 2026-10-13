// Smoke tests that the vendored Mihrab modules behave as Tarteel relies on.
// Test data is generic (dates, coordinates, clock strings): no Quran content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gregorianToHijri, hijriMonthLength, isHijriLeap } from "../third_party/mihrab/src/hijri/convert";
import { DEFAULT_AUTO_METHOD, autoMethodForCoords } from "../third_party/mihrab/src/providers/autoMethod";
import { computeImsak, timeMinusMinutes } from "../third_party/mihrab/src/providers/imsak";
import { validateTimings } from "../third_party/mihrab/src/providers/validateTimings";

const sample = { Fajr: "05:00", Sunrise: "06:20", Dhuhr: "12:10", Asr: "15:30", Maghrib: "18:00", Isha: "19:20" };

test("hijri: mid-March 2024 falls in Ramadan 1445 (tolerant of +-2 day calendar variants)", () => {
  const h = gregorianToHijri(new Date(2024, 2, 15));
  assert.equal(h.year, 1445);
  assert.equal(h.month, 9);
});

function hijriDiscontinuities(fromYear: number, years: number) {
  const out: { prev: ReturnType<typeof gregorianToHijri>; cur: ReturnType<typeof gregorianToHijri> }[] = [];
  let prev = gregorianToHijri(new Date(fromYear, 0, 1));
  for (let i = 1; i < 365 * years; i++) {
    const cur = gregorianToHijri(new Date(fromYear, 0, 1 + i));
    const sameMonth = cur.year === prev.year && cur.month === prev.month;
    if (sameMonth ? cur.day !== prev.day + 1 : cur.day !== 1) out.push({ prev, cur });
    prev = cur;
  }
  return out;
}

test("hijri: months 1-11 advance one day at a time and months have 29-30 days", () => {
  for (const d of hijriDiscontinuities(2020, 12)) assert.equal(d.prev.month, 12, "only the year-end month may glitch");
  for (let m = 1; m <= 12; m++) assert.ok([29, 30].includes(hijriMonthLength(1446, m)));
  assert.equal(typeof isHijriLeap(1446), "boolean");
});

// CANARY for a defect found in the vendored tabular conversion (see docs/upstream/README.md):
// near the end of Dhu al-Hijjah a day is repeated or skipped (e.g. 1446-12-27 appears on two
// consecutive days). Tarteel must not display dates from convert.ts directly. This test is
// expected to FAIL once upstream fixes it: then delete it and the workaround.
test("CANARY known upstream issue: tabular Hijri repeats/skips a day at year end", () => {
  assert.ok(hijriDiscontinuities(2020, 12).length > 0);
});

test("auto method: Morocco gets its own method, elsewhere the global default", () => {
  assert.equal(autoMethodForCoords(34.02, -6.84), 21); // Rabat
  assert.equal(autoMethodForCoords(23.81, 90.41), DEFAULT_AUTO_METHOD); // Dhaka: no regional rule upstream
});

test("imsak arithmetic wraps past midnight", () => {
  assert.equal(timeMinusMinutes("05:00", 10), "04:50");
  assert.equal(timeMinusMinutes("00:05", 10), "23:55");
  assert.equal(computeImsak("05:00", 10), "04:50");
});

test("timing validation accepts a sane day and rejects bad shape/order", () => {
  assert.deepEqual(validateTimings({ ...sample }), sample);
  assert.throws(() => validateTimings({ ...sample, Asr: "3:30pm" }), /HH:MM/);
  assert.throws(() => validateTimings({ ...sample, Dhuhr: "17:00" }), /out of order/);
  const { Fajr: _f, ...missing } = sample;
  assert.throws(() => validateTimings(missing), /Fajr/);
});

// localAdhan needs the `adhan` package (installed by `npm install` in CI). Skipped when absent.
let adhanAvailable = true;
try { await import("adhan"); } catch { adhanAvailable = false; }

test("on-device calculation: Dhaka, Karachi/Hanafi gives six ordered, valid times", { skip: !adhanAvailable }, async () => {
  // localAdhan prints clock times in the DEVICE's timezone (right for a phone). Dhaka's day only sorts correctly on a Dhaka
  // clock: on a UTC CI runner Sunrise (23:52 the evening before) would sort before Dhuhr (05:48). So the test runs on Dhaka time
  // and puts the runner's timezone back afterwards.
  const previousTz = process.env["TZ"];
  process.env["TZ"] = "Asia/Dhaka";
  try {
    const { computeLocalAdhanTimes } = await import("../third_party/mihrab/src/providers/localAdhan");
    const { timings } = computeLocalAdhanTimes({ latitude: 23.8103, longitude: 90.4125, date: new Date(2026, 9, 6), calculationMethod: 1, school: 1 });
    validateTimings(timings); // shape + ordering, throws otherwise
    assert.ok(timings["Imsak"] && timings["Imsak"] < (timings["Fajr"] as string));
  } finally {
    if (previousTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = previousTz;
  }
});
