import type { MethodChoice } from "./methods.ts";
import type { Offsets, PrayerDay } from "./day.ts";
import { computePrayerDay } from "./day.ts";
import type { TimesCalculator } from "./types.ts";

export interface MonthRow {
  day: number;
  date: Date;
  result: { ok: true; day: PrayerDay } | { ok: false; error: string };
}

/** Prayer times for every day of a month. A day that fails validation is reported, not hidden or guessed. */
export function computeMonth(
  calc: TimesCalculator,
  where: { latitude: number; longitude: number },
  year: number,
  month: number, // 1..12
  choice: MethodChoice,
  offsets: Offsets = {},
): MonthRow[] {
  const days = new Date(year, month, 0).getDate();
  const rows: MonthRow[] = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    try {
      rows.push({ day: d, date, result: { ok: true, day: computePrayerDay(calc, where, date, choice, offsets) } });
    } catch (e) {
      rows.push({ day: d, date, result: { ok: false, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  return rows;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** `count` consecutive days starting at `start` (local calendar dates). Invalid days are reported, never guessed. */
export function computeRange(
  calc: TimesCalculator,
  where: { latitude: number; longitude: number },
  start: Date,
  count: number,
  choice: MethodChoice,
  offsets: Offsets = {},
): MonthRow[] {
  const rows: MonthRow[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    try {
      rows.push({ day: date.getDate(), date, result: { ok: true, day: computePrayerDay(calc, where, date, choice, offsets) } });
    } catch (e) {
      rows.push({ day: date.getDate(), date, result: { ok: false, error: e instanceof Error ? e.message : String(e) } });
    }
  }
  return rows;
}
