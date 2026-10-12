/** The six events of the prayer day, in order. Sunrise ends Fajr; it is not a prayer. */
export const PRAYER_EVENTS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export type PrayerEvent = (typeof PRAYER_EVENTS)[number];

/** Clock strings "HH:MM" in the device's local time zone. */
export type Timings = Record<PrayerEvent, string> & Partial<Record<string, string>>;

export interface CalcInput {
  latitude: number;
  longitude: number;
  /** Only the local calendar date (year, month, day) is used. */
  date: Date;
  /** AlAdhan-style method id, or "auto" to let the calculator pick from coordinates. */
  methodId: number | "auto";
  /** 0 = Shafi/Maliki/Hanbali (shadow x1), 1 = Hanafi (shadow x2). */
  school: 0 | 1;
}

/**
 * The calculator is injected so this package stays pure and testable.
 * apps/mobile binds it to the vendored Mihrab/adhan implementation.
 * NOTE: the vendored calculator returns times in the DEVICE time zone, so results are only
 * correct for the place the device is actually in (or one in the same zone).
 */
export type TimesCalculator = (input: CalcInput) => { timings: Record<string, string> };

export interface Location {
  latitude: number;
  longitude: number;
  label?: string;
  source: "gps" | "manual";
}
