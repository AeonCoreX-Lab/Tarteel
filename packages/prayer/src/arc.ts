import { atClock } from "./day.ts";
import type { Phase } from "./day.ts";
import { currentPhase } from "./day.ts";
import type { PrayerEvent, Timings } from "./types.ts";
import { PRAYER_EVENTS } from "./types.ts";

export interface ArcTick {
  event: PrayerEvent;
  /** 0 = Fajr (left end of the arc), 1 = Isha (right end) */
  at: number;
}

export interface DayArc {
  /** How far through the Fajr-to-Isha span `now` is, clamped to 0..1. */
  progress: number;
  ticks: ArcTick[];
  phase: Phase;
}

/**
 * Geometry for the "waqt arc" on the Today screen: the six events of the day as ticks on a half-ring,
 * positioned in proportion to real clock time, plus a marker for now.
 */
export function dayArc(today: Timings, now: Date): DayArc {
  const start = atClock(now, today.Fajr).getTime();
  const end = atClock(now, today.Isha).getTime();
  const span = end - start;
  const f = (ms: number) => (span <= 0 ? 0 : Math.min(1, Math.max(0, (ms - start) / span)));
  return {
    progress: f(now.getTime()),
    ticks: PRAYER_EVENTS.map((event) => ({ event, at: f(atClock(now, today[event]).getTime()) })),
    phase: currentPhase(today, now),
  };
}

/** Point on a half-ring (centre cx,cy radius r): f=0 is the left end, f=1 the right end, f=0.5 the top. */
export function arcPoint(cx: number, cy: number, r: number, f: number): { x: number; y: number } {
  const theta = Math.PI * (1 - Math.min(1, Math.max(0, f)));
  return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) };
}

/** SVG path for the part of the half-ring between fractions a and b (a < b). Empty string if there is nothing to draw. */
export function arcPath(cx: number, cy: number, r: number, a: number, b: number): string {
  if (b - a <= 1e-6) return "";
  const p0 = arcPoint(cx, cy, r, a);
  const p1 = arcPoint(cx, cy, r, b);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return `M ${r2(p0.x)} ${r2(p0.y)} A ${r} ${r} 0 0 1 ${r2(p1.x)} ${r2(p1.y)}`;
}
