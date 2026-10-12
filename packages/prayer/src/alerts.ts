import { atClock } from "./day.ts";
import type { PrayerDay } from "./day.ts";
import type { PrayerEvent } from "./types.ts";

/** Pure planning of WHICH alerts should exist. Scheduling them on a device is the platform adapter's job. */
export type AlertPrayer = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";
export type AlertKind = "adhan" | "before" | "sunrise";

export interface AlertSettings {
  prayers: Record<AlertPrayer, boolean>;
  /** Alert at sunrise (end of Fajr time). */
  sunrise: boolean;
  /** Also alert this many minutes before each enabled prayer. null = off. */
  beforeMinutes: number | null;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  prayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  sunrise: false,
  beforeMinutes: null,
};

export const ALERT_ID_PREFIX = "tarteel.";

export interface PlannedAlert {
  /** Deterministic: the same prayer on the same day always has the same id. */
  id: string;
  at: Date;
  event: PrayerEvent;
  kind: AlertKind;
  /** yyyy-mm-dd */
  dayKey: string;
  /** "HH:MM" of the prayer itself (not of the reminder) */
  clock: string;
}

export const alertId = (dayKey: string, event: PrayerEvent, kind: AlertKind): string => `${ALERT_ID_PREFIX}${dayKey}.${event}.${kind}`;

const KIND_ORDER: Record<AlertKind, number> = { before: 0, adhan: 1, sunrise: 1 };
const PRAYERS: readonly AlertPrayer[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export interface PlanInput {
  days: PrayerDay[];
  settings: AlertSettings;
  now: Date;
  /** Maximum number of alerts to keep (the soonest ones). iOS allows 64 pending local notifications. */
  limit?: number;
  /** Alerts closer than this to `now` are skipped: they would fire before they can be scheduled. */
  minLeadSeconds?: number;
}

/** Soonest-first list of alerts that should be scheduled right now. */
export function planAlerts(input: PlanInput): PlannedAlert[] {
  const { days, settings, now, limit = 48, minLeadSeconds = 5 } = input;
  const earliest = now.getTime() + minLeadSeconds * 1000;
  const out: PlannedAlert[] = [];
  const push = (a: PlannedAlert) => {
    if (a.at.getTime() >= earliest) out.push(a);
  };
  for (const day of days) {
    const dayKey = day.basis.date;
    const base = dateFromKey(dayKey);
    for (const p of PRAYERS) {
      if (!settings.prayers[p]) continue;
      const clock = day.timings[p];
      const at = atClock(base, clock);
      push({ id: alertId(dayKey, p, "adhan"), at, event: p, kind: "adhan", dayKey, clock });
      if (settings.beforeMinutes && settings.beforeMinutes > 0) {
        push({ id: alertId(dayKey, p, "before"), at: new Date(at.getTime() - settings.beforeMinutes * 60_000), event: p, kind: "before", dayKey, clock });
      }
    }
    if (settings.sunrise) {
      const clock = day.timings.Sunrise;
      push({ id: alertId(dayKey, "Sunrise", "sunrise"), at: atClock(base, clock), event: "Sunrise", kind: "sunrise", dayKey, clock });
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return out.slice(0, limit);
}

export interface ScheduledAlert {
  id: string;
  /** epoch ms */
  at: number;
}

export interface AlertDiff {
  toCreate: PlannedAlert[];
  toCancel: string[];
}

/**
 * Minimal changes to bring the device's schedule in line with the plan.
 * Only ids with our prefix are ever cancelled: other notifications are not ours to touch.
 * An alert whose time moved (method, location or offset changed) is cancelled and created again.
 */
export function diffAlerts(scheduled: readonly ScheduledAlert[], planned: readonly PlannedAlert[], toleranceMs = 30_000): AlertDiff {
  const have = new Map(scheduled.filter((s) => s.id.startsWith(ALERT_ID_PREFIX)).map((s) => [s.id, s.at]));
  const want = new Map(planned.map((p) => [p.id, p]));
  const toCreate: PlannedAlert[] = [];
  const toCancel: string[] = [];
  for (const p of planned) {
    const at = have.get(p.id);
    if (at === undefined) toCreate.push(p);
    else if (Math.abs(at - p.at.getTime()) >= toleranceMs) {
      toCancel.push(p.id);
      toCreate.push(p);
    }
  }
  for (const id of have.keys()) if (!want.has(id)) toCancel.push(id);
  return { toCreate, toCancel };
}
