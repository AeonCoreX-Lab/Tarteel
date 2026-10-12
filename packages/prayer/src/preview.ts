import { assertSane, parseClock } from "./day.ts";
import type { TimesCalculator } from "./types.ts";

export type CoordinateCheck =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: "not-a-number" | "out-of-range" | "null-island" };

/**
 * Validates a place before it is ever used for prayer times.
 * (0, 0) is rejected on purpose: it is the classic "no location yet" default, it sits in the Gulf of Guinea,
 * and it computes perfectly valid-looking nonsense. (Idea borrowed from Mihrab's onboarding.)
 */
export function validateCoordinates(latitude: unknown, longitude: unknown): CoordinateCheck {
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return { ok: false, reason: "not-a-number" };
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { ok: false, reason: "out-of-range" };
  if (latitude === 0 && longitude === 0) return { ok: false, reason: "null-island" };
  return { ok: true, latitude, longitude };
}

export interface AsrPreview {
  standard: string;
  hanafi: string;
  /** minutes later the Hanafi Asr falls */
  differenceMinutes: number;
}

/**
 * Asr under both schools for the same place, date and method. Shown while the user chooses a school so the
 * decision is concrete. Only the shadow length differs between the schools; the rest of the day does not move.
 */
export function previewAsrBySchool(
  calc: TimesCalculator,
  where: { latitude: number; longitude: number },
  date: Date,
  methodId: number | "auto",
): AsrPreview {
  const run = (school: 0 | 1) => {
    const t = calc({ ...where, date, methodId, school }).timings;
    assertSane(t);
    return t.Asr;
  };
  const standard = run(0);
  const hanafi = run(1);
  return { standard, hanafi, differenceMinutes: parseClock(hanafi) - parseClock(standard) };
}
