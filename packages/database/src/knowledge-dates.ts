/**
 * Dates of events, people and places. A date is never made more exact than its source: `precision` says how exact it is, and
 * `calendar` says which calendar the years are in. The years of the source are kept as they are. Only `sortYear`, an
 * APPROXIMATE Gregorian year, is worked out, and only to put things in order; it is never shown as a date.
 */

export type DateCalendar = "ah" | "ce";
export type DatePrecision = "year" | "decade" | "century" | "approximate" | "unknown";
export const DATE_PRECISIONS: readonly DatePrecision[] = ["year", "decade", "century", "approximate", "unknown"];

export interface EntityDate {
  calendar: DateCalendar | null;
  start: number | null;
  end: number | null;
  precision: DatePrecision;
  /** Approximate Gregorian year for ordering only; null when undated. */
  sortYear: number | null;
  note: string | null;
}

/**
 * The Gregorian year that a Hijri year mostly falls in. A Hijri year is about 0.9702 of a Gregorian one, and year 1 began in
 * 622 CE. Good to within a year or so, which is enough to order events and not enough to date them.
 */
export function approxCeYear(calendar: DateCalendar, year: number): number {
  return calendar === "ce" ? year : Math.round(year * 0.970224 + 621.5744);
}

/** The ordering year for a date as the authors write it, or null when there is no start. For a decade or a century this is the start year given. */
export function sortYearFor(calendar: DateCalendar | null, start: number | null, precision: DatePrecision): number | null {
  if (calendar === null || start === null || precision === "unknown") return null;
  return approxCeYear(calendar, start);
}

export interface DateWords {
  /** "AH" / "CE" in the reader's language. */
  era(calendar: DateCalendar): string;
  /** "c." */
  circa: string;
  unknown: string;
  /** For a decade given by its first year: "620s". */
  decade(startYear: number): string;
  /** For a century number: "7th century". */
  century(n: number): string;
}

/**
 * The date as words, as exact as the source and no more. A year is shown as "1 AH", a span as "1–3 AH", a decade as "the 620s CE",
 * a century as "the 7th century AH" (the century a start year falls in), an approximate one as "c. 610 CE". Undated: the `unknown` words.
 */
export function formatDate(d: Pick<EntityDate, "calendar" | "start" | "end" | "precision">, w: DateWords): string {
  if (d.precision === "unknown" || d.start === null || d.calendar === null) return w.unknown;
  const era = w.era(d.calendar);
  switch (d.precision) {
    case "century":
      return `${w.century(Math.floor((d.start - 1) / 100) + 1)} ${era}`;
    case "decade":
      return `${w.decade(Math.floor(d.start / 10) * 10)} ${era}`;
    case "approximate":
      return `${w.circa} ${span(d)} ${era}`;
    default:
      return `${span(d)} ${era}`;
  }
}

function span(d: Pick<EntityDate, "start" | "end">): string {
  return d.end !== null && d.end !== d.start ? `${d.start}–${d.end}` : String(d.start);
}
