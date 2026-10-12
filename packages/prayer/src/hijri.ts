export interface HijriDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..30
  /** Which algorithm produced this date. */
  source: "umalqura" | "tabular";
}

export const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi' al-awwal", "Rabi' al-thani", "Jumada al-ula", "Jumada al-akhirah",
  "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
] as const;

// ---- Tabular (arithmetic) civil Islamic calendar: continuous by construction.

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

const CIVIL_EPOCH_JDN = 1948440; // 1 Muharram 1 AH (civil)

function islamicToJdn(y: number, m: number, d: number): number {
  return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + CIVIL_EPOCH_JDN - 1;
}

export function tabularHijri(year: number, month: number, day: number): Omit<HijriDate, "source"> {
  const jdn = gregorianToJdn(year, month, day);
  const y = Math.floor((30 * (jdn - CIVIL_EPOCH_JDN) + 10646) / 10631);
  const m = Math.min(12, Math.ceil((jdn - 29 - islamicToJdn(y, 1, 1)) / 29.5) + 1);
  const d = jdn - islamicToJdn(y, m, 1) + 1;
  return { year: y, month: m, day: d };
}

// ---- Umm al-Qura through ICU, when the runtime supports it.

let formatter: Intl.DateTimeFormat | null | undefined;
function umAlQuraFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter;
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric" });
    // Sanity probe: a runtime that ignores the calendar returns Gregorian years (~2026).
    const probe = f.formatToParts(new Date(2025, 5, 26, 12)).find((p) => p.type === "year");
    formatter = probe && Number(probe.value) > 1300 && Number(probe.value) < 1600 ? f : null;
  } catch {
    formatter = null;
  }
  return formatter;
}

function umAlQuraHijri(year: number, month: number, day: number): Omit<HijriDate, "source"> | null {
  const f = umAlQuraFormatter();
  if (!f) return null;
  const get = (parts: Intl.DateTimeFormatPart[], t: string) => Number(parts.find((p) => p.type === t)?.value);
  const parts = f.formatToParts(new Date(year, month - 1, day, 12));
  const out = { year: get(parts, "year"), month: get(parts, "month"), day: get(parts, "day") };
  return Number.isFinite(out.year) && Number.isFinite(out.month) && Number.isFinite(out.day) ? out : null;
}

export interface HijriOptions {
  /** User adjustment for local moon sighting, usually -2..+2. */
  offsetDays?: number;
  /** "auto" prefers Umm al-Qura via ICU and falls back to the tabular calendar. */
  source?: "auto" | "tabular";
}

/** Hijri date for the local calendar date of `date`. Offsets are applied on the Gregorian side. */
export function toHijri(date: Date, opts: HijriOptions = {}): HijriDate {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (opts.offsetDays ?? 0), 12);
  const y = shifted.getFullYear();
  const m = shifted.getMonth() + 1;
  const d = shifted.getDate();
  if (opts.source !== "tabular") {
    const u = umAlQuraHijri(y, m, d);
    if (u) return { ...u, source: "umalqura" };
  }
  return { ...tabularHijri(y, m, d), source: "tabular" };
}

export const hijriMonthName = (month: number): string => HIJRI_MONTHS_EN[month - 1] ?? String(month);
