export interface MethodInfo {
  id: number;
  name: string;
}

/** Method ids understood by the vendored calculator (AlAdhan numbering). */
export const METHODS: readonly MethodInfo[] = [
  { id: 1, name: "University of Islamic Sciences, Karachi" },
  { id: 3, name: "Muslim World League" },
  { id: 2, name: "Islamic Society of North America" },
  { id: 4, name: "Umm al-Qura University, Makkah" },
  { id: 5, name: "Egyptian General Authority of Survey" },
  { id: 7, name: "Institute of Geophysics, University of Tehran" },
  { id: 8, name: "Gulf Region" },
  { id: 9, name: "Kuwait" },
  { id: 10, name: "Qatar" },
  { id: 11, name: "Majlis Ugama Islam Singapura" },
  { id: 12, name: "Union des Organisations Islamiques de France" },
  { id: 13, name: "Diyanet Isleri Baskanligi, Turkey" },
  { id: 14, name: "Spiritual Administration of Muslims of Russia" },
  { id: 15, name: "Moonsighting Committee Worldwide" },
  { id: 21, name: "Morocco (Ministry of Habous)" },
  { id: 0, name: "Shia Ithna-Ashari (Leva Institute, Qum)" },
];

export const GLOBAL_DEFAULT_METHOD_ID = 3;

export const methodName = (id: number | "auto"): string =>
  id === "auto" ? "Automatic" : (METHODS.find((m) => m.id === id)?.name ?? `Method ${id}`);

export interface MethodDefault {
  methodId: number;
  school: 0 | 1;
}

/**
 * STARTING defaults by ISO country code, used only until the user confirms their method in Setup.
 * Deliberately short: only well-known conventions. A wrong default in a religious practice is worse
 * than asking, so Setup always shows the choice and the user can change it. Review these against
 * each country's official timetable before release (see docs/roadmap/FEATURE-PARITY.md).
 *  - BD, PK: Karachi angles with Hanafi Asr (majority Hanafi). Confirm BD against the
 *    Islamic Foundation Bangladesh timetable.
 */
export const COUNTRY_DEFAULTS: Readonly<Record<string, MethodDefault>> = {
  BD: { methodId: 1, school: 1 },
  PK: { methodId: 1, school: 1 },
  SA: { methodId: 4, school: 0 },
  EG: { methodId: 5, school: 0 },
  IR: { methodId: 7, school: 0 },
  KW: { methodId: 9, school: 0 },
  QA: { methodId: 10, school: 0 },
  SG: { methodId: 11, school: 0 },
  TR: { methodId: 13, school: 0 },
  RU: { methodId: 14, school: 0 },
  MA: { methodId: 21, school: 0 },
};

export interface MethodChoice {
  methodId: number | "auto";
  school: 0 | 1;
  /** Where the choice came from: shown to the user so the basis is never hidden. */
  source: "user" | "country" | "auto";
}

export function resolveMethod(opts: {
  userMethodId: number | null;
  userSchool: 0 | 1 | null;
  countryCode: string | null;
}): MethodChoice {
  const country = opts.countryCode ? COUNTRY_DEFAULTS[opts.countryCode.toUpperCase()] : undefined;
  if (opts.userMethodId !== null) {
    return { methodId: opts.userMethodId, school: opts.userSchool ?? country?.school ?? 0, source: "user" };
  }
  if (country) return { methodId: country.methodId, school: opts.userSchool ?? country.school, source: "country" };
  return { methodId: "auto", school: opts.userSchool ?? 0, source: "auto" };
}
