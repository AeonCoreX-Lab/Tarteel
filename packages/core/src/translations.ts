/** The least a translation needs to be listed in a picker. */
export interface ListedTranslation { id: string; language: string; languageName: string }

/**
 * Puts translations in the order a person expects: the languages they most likely want first (the app language, then the two
 * the app ships in), then everything else by language name, ties by id. Stable and independent of the order the database returns.
 */
export function orderTranslations<T extends ListedTranslation>(all: readonly T[], preferredLanguages: readonly string[]): T[] {
  const rank = (t: T): number => {
    const i = preferredLanguages.indexOf(t.language);
    return i === -1 ? preferredLanguages.length : i;
  };
  return [...all].sort((a, b) => rank(a) - rank(b) || a.languageName.localeCompare(b.languageName) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface TranslationChoices<T> {
  /** Shown directly in the settings screen. */
  shown: T[];
  /** Behind the "More" button. Empty when everything fits, so no button is needed. */
  more: T[];
  /** Every translation in display order: what the "More" sheet lists. */
  all: T[];
}

/**
 * Splits the list for a compact picker. The first `visible` translations are shown, and the selected one is always among
 * them (it takes the last place if it would otherwise be hidden), so the screen always says what is chosen. A single hidden
 * translation is shown instead of a "More (1)" button: opening a sheet for one item is worse than showing it.
 */
export function splitTranslations<T extends ListedTranslation>(
  list: readonly T[], selectedId: string | null, opts: { preferredLanguages: readonly string[]; visible?: number },
): TranslationChoices<T> {
  const visible = Math.max(1, Math.floor(opts.visible ?? 3));
  const all = orderTranslations(list, opts.preferredLanguages);
  if (all.length <= visible + 1) return { shown: all, more: [], all };
  let shown = all.slice(0, visible);
  const selected = all.find((t) => t.id === selectedId);
  if (selected && !shown.includes(selected)) shown = [...shown.slice(0, visible - 1), selected];
  const more = all.filter((t) => !shown.includes(t));
  return { shown, more, all };
}
