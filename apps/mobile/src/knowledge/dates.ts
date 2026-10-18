import type { DateWords, EntityDate } from "@tarteel/database";
import { formatDate } from "@tarteel/database";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";

const ordinalEn = (n: number): string => {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** The date of an event, person or place as words in the reader's language, as exact as the source says and no more. */
export function useFormatDate(): (d: Pick<EntityDate, "calendar" | "start" | "end" | "precision">) => string {
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  const words: DateWords = {
    era: (c) => (c === "ah" ? t("tlAh") : t("tlCe")),
    circa: t("tlCirca"),
    unknown: t("tlDateUnknown"),
    decade: (y) => (lang === "bn" ? `${y}-এর দশক` : `${y}s`),
    century: (n) => (lang === "bn" ? `${n} শতক` : `${ordinalEn(n)} century`),
  };
  return (d) => formatDate(d, words);
}
