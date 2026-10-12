import { hijriMonthName } from "@tarteel/prayer";

/** "17:50" -> "5:50 PM" */
export function to12h(clock: string): string {
  const [h, m] = clock.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "17:50" -> "5:50" (compact, for tables) */
export function short12(clock: string): string {
  const [h, m] = clock.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}


const HIJRI_MONTHS_BN = [
  "\u09AE\u09C1\u09B9\u09BE\u09B0\u09B0\u09AE", "\u09B8\u09AB\u09B0", "\u09B0\u09AC\u09BF\u0989\u09B2 \u0986\u0989\u09AF\u09BC\u09BE\u09B2", "\u09B0\u09AC\u09BF\u0989\u09B8 \u09B8\u09BE\u09A8\u09BF",
  "\u099C\u09AE\u09BE\u09A6\u09BF\u0989\u09B2 \u0986\u0989\u09AF\u09BC\u09BE\u09B2", "\u099C\u09AE\u09BE\u09A6\u09BF\u0989\u09B8 \u09B8\u09BE\u09A8\u09BF", "\u09B0\u099C\u09AC", "\u09B6\u09BE\u09AC\u09BE\u09A8",
  "\u09B0\u09AE\u099C\u09BE\u09A8", "\u09B6\u09BE\u0993\u09AF\u09BC\u09BE\u09B2", "\u099C\u09BF\u09B2\u0995\u09A6", "\u099C\u09BF\u09B2\u09B9\u099C",
];

/** Hijri month name in the UI language (English transliteration, or the names used in Bangladesh). */
export function hijriMonthLabel(month: number, lang: "en" | "bn" | "ar"): string {
  return lang === "bn" ? (HIJRI_MONTHS_BN[month - 1] ?? String(month)) : hijriMonthName(month);
}

/** "Wednesday, 7 October" in the UI language; falls back to English if the runtime lacks the locale. */
export function longDate(d: Date, lang: "en" | "bn" | "ar"): string {
  try {
    return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }
}
