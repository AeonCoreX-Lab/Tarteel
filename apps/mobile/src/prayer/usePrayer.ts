import { useEffect, useMemo, useState } from "react";
import { computePrayerDay, currentPhase, nextEvent, resolveMethod } from "@tarteel/prayer";
import type { NextPrayer, Phase, PrayerDay } from "@tarteel/prayer";
import { calculateTimes } from "../platform/prayer-adapter";
import { useSettings } from "../state/settings";

/** Re-renders every `ms` with the current time. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type PrayerState =
  | { status: "needs-location" }
  | { status: "error"; message: string }
  | { status: "ready"; today: PrayerDay; tomorrow: PrayerDay; next: NextPrayer; phase: Phase; now: Date };

export function usePrayer(): PrayerState {
  const location = useSettings((s) => s.location);
  const countryCode = useSettings((s) => s.countryCode);
  const methodId = useSettings((s) => s.calcMethodId);
  const school = useSettings((s) => s.asrSchool);
  const offsets = useSettings((s) => s.prayerOffsets);
  const now = useNow(1000);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  // Times are computed once per day (and when inputs change), not every second.
  type Days = { ok: true; today: PrayerDay; tomorrow: PrayerDay } | { ok: false; message: string };
  const days = useMemo((): Days | null => {
    if (!location) return null;
    try {
      const choice = resolveMethod({ userMethodId: methodId, userSchool: school, countryCode });
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return {
        ok: true,
        today: computePrayerDay(calculateTimes, location, base, choice, offsets),
        tomorrow: computePrayerDay(calculateTimes, location, tomorrow, choice, offsets),
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, [dayKey, location, countryCode, methodId, school, offsets]);

  if (!days) return { status: "needs-location" };
  if (!days.ok) return { status: "error", message: days.message };
  return {
    status: "ready",
    today: days.today,
    tomorrow: days.tomorrow,
    now,
    next: nextEvent(days.today.timings, days.tomorrow.timings, now),
    phase: currentPhase(days.today.timings, now),
  };
}
