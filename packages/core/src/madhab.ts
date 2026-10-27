/**
 * The school (madhab) a person prays by, and what follows from it for the times.
 *
 * Modelled on how Mihrab asks it (src/prayer/madhab.ts, read 2026-10-27): the app asks for the SCHOOL, not for a
 * shadow ratio, and shows each school's own Asr time next to its name so the choice is concrete.
 *
 * What a school decides here, and what it does not:
 * - It decides one computed thing: the Asr shadow. The Hanafi reckoning (shadow twice the object) is later; Shafi'i, Maliki
 *   and Hanbali take the standard reckoning (shadow once the object). So there are four names but two answers, and the
 *   picker says so instead of implying four different sets of times.
 * - It does NOT rename Fajr to Subh under Maliki, and it adds no second (ikhtiyari / darury) times: Tarteel does not
 *   compute those. A school changes what is true, not what happens: choosing one never turns an alert on.
 *
 * Stored as a pair, `madhab` and `asrSchool`, written together. `asrSchool` is what the calculator reads;
 * `madhab` is only the name the person gave. If the two stop agreeing (an older install, or a hand-set shadow), the
 * name is not claimed: `selectedMadhab` returns null.
 */
export type Madhab = "hanafi" | "maliki" | "shafii" | "hanbali";

/** In the order the picker lists them. */
export const MADHABS: readonly Madhab[] = ["hanafi", "maliki", "shafii", "hanbali"];

/** `school` as the calculator wants it: 1 is the Hanafi shadow, 0 the standard one the other three take. */
export function asrSchoolFor(madhab: Madhab): 0 | 1 {
  return madhab === "hanafi" ? 1 : 0;
}

/** The school to show as chosen: the stored name, only while it still describes the stored Asr school. */
export function selectedMadhab(madhab: Madhab | null | undefined, school: 0 | 1 | null): Madhab | null {
  if (!madhab || school === null) return null;
  return asrSchoolFor(madhab) === school ? madhab : null;
}

/** What to write when a school is picked, or null for "I'm not sure" (the region's usual practice is then used). */
export function madhabChoice(madhab: Madhab | null): { madhab: Madhab | null; asrSchool: 0 | 1 | null } {
  return madhab === null ? { madhab: null, asrSchool: null } : { madhab, asrSchool: asrSchoolFor(madhab) };
}
