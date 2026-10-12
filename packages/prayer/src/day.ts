import type { MethodChoice } from "./methods.ts";
import { methodName } from "./methods.ts";
import type { CalcInput, PrayerEvent, Timings, TimesCalculator } from "./types.ts";
import { PRAYER_EVENTS } from "./types.ts";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class TimingsError extends Error {}

export function parseClock(s: string): number {
  const m = CLOCK.exec(s);
  if (!m) throw new TimingsError(`"${s}" is not HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatClock(minutes: number): string {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Throws unless all six events are present, well-formed and strictly in order. */
export function assertSane(t: Record<string, string | undefined>): asserts t is Timings {
  let prev = -1;
  for (const name of PRAYER_EVENTS) {
    const raw = t[name];
    if (raw === undefined) throw new TimingsError(`${name} is missing`);
    const mins = parseClock(raw);
    if (mins <= prev) throw new TimingsError(`${name} (${raw}) is out of order`);
    prev = mins;
  }
}

/** Per-event manual corrections in minutes (e.g. a local mosque's published times). */
export type Offsets = Partial<Record<PrayerEvent, number>>;

export function applyOffsets(t: Timings, offsets: Offsets): Timings {
  const out: Record<string, string | undefined> = { ...t };
  for (const name of PRAYER_EVENTS) {
    const o = offsets[name];
    if (o) out[name] = formatClock(parseClock(t[name]) + o);
  }
  return out as Timings;
}

export interface DayBasis {
  methodId: number | "auto";
  methodName: string;
  school: 0 | 1;
  source: MethodChoice["source"];
  latitude: number;
  longitude: number;
  /** yyyy-mm-dd of the computed day */
  date: string;
}

export interface PrayerDay {
  timings: Timings;
  basis: DayBasis;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function computePrayerDay(
  calc: TimesCalculator,
  where: { latitude: number; longitude: number },
  date: Date,
  choice: MethodChoice,
  offsets: Offsets = {},
): PrayerDay {
  const input: CalcInput = { ...where, date, methodId: choice.methodId, school: choice.school };
  const raw = calc(input).timings;
  assertSane(raw); // fail loudly rather than show wrong times
  return {
    timings: applyOffsets(raw, offsets),
    basis: {
      methodId: choice.methodId,
      methodName: methodName(choice.methodId),
      school: choice.school,
      source: choice.source,
      latitude: where.latitude,
      longitude: where.longitude,
      date: ymd(date),
    },
  };
}

// ----------------------------------------------------------- now / next

export function atClock(day: Date, clock: string): Date {
  const m = parseClock(clock);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60, 0, 0);
}

export interface NextPrayer {
  /** Next event of the day cycle; Sunrise is included because it ends Fajr's time. */
  name: PrayerEvent;
  at: Date;
  /** seconds from `now` */
  secondsLeft: number;
}

/** `tomorrow` supplies the Fajr that follows Isha. */
export function nextEvent(today: Timings, tomorrow: Timings, now: Date): NextPrayer {
  for (const name of PRAYER_EVENTS) {
    const at = atClock(now, today[name]);
    if (at > now) return { name, at, secondsLeft: Math.ceil((at.getTime() - now.getTime()) / 1000) };
  }
  const tm = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const at = atClock(tm, tomorrow.Fajr);
  return { name: "Fajr", at, secondsLeft: Math.ceil((at.getTime() - now.getTime()) / 1000) };
}

export type Phase = PrayerEvent | "Night";

/** The window "now" is in: the most recent event that has started. Before Fajr it is still night. */
export function currentPhase(today: Timings, now: Date): Phase {
  let current: Phase = "Night";
  for (const name of PRAYER_EVENTS) if (atClock(now, today[name]) <= now) current = name;
  return current;
}

export interface CountdownParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownParts(totalSeconds: number): CountdownParts {
  const s = Math.max(0, Math.floor(totalSeconds));
  return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export function formatCountdown(totalSeconds: number): string {
  const { hours, minutes, seconds } = countdownParts(totalSeconds);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hours)}:${p(minutes)}:${p(seconds)}`;
}
