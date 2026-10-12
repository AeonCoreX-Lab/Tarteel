/**
 * Search helpers. Pure functions, no I/O.
 * Normalisation affects ONLY the derived search column (ayahs.text_search);
 * the displayed Arabic text is never modified.
 */

// Arabic harakat/tanween/shadda/sukun (064B-065F), superscript alef (0670),
// Quranic annotation marks (06D6-06ED), tatweel (0640).
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671]/g; // آ أ إ ٱ
const ALEF_MAKSURA = /\u0649/g; // ى -> ي

export function normalizeArabicForSearch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(ALEF_VARIANTS, "\u0627")
    .replace(ALEF_MAKSURA, "\u064A")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Translation search normalisation: Unicode NFC only (keeps Bengali precomposed/
 * decomposed forms such as U+09DF vs U+09AF+U+09BC consistent between the index
 * and the query). Case folding is handled by the FTS tokenizer.
 */
export function normalizeTranslationForSearch(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Bengali (and Arabic) combining marks must be treated as token characters by
 * SQLite's unicode61 tokenizer, otherwise words are split at every vowel sign.
 * Used in the FTS5 `tokenchars` option.
 */
export const BENGALI_MARKS =
  "\u0981\u0982\u0983\u09BC\u09BE\u09BF\u09C0\u09C1\u09C2\u09C3\u09C4\u09C7\u09C8\u09CB\u09CC\u09CD\u09D7";
export const ARABIC_SCRIPT_MARKS = "\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670";
export const FTS_TOKENCHARS = BENGALI_MARKS + ARABIC_SCRIPT_MARKS;

export interface FtsQueryOptions {
  /** Normalise as Arabic before tokenising. */
  arabic?: boolean;
  /** Prefix-match the last token (search-as-you-type). Default true. */
  prefixLast?: boolean;
  /** Safety cap on tokens. */
  maxTokens?: number;
}

/**
 * Turns free user input into a safe FTS5 MATCH expression.
 * Every token is double-quoted so user input can never inject FTS operators.
 * Returns null when there is nothing searchable.
 */
export function buildFtsQuery(input: string, opts: FtsQueryOptions = {}): string | null {
  const { arabic = false, prefixLast = true, maxTokens = 8 } = opts;
  const text = arabic ? normalizeArabicForSearch(input) : input.normalize("NFC");
  const tokens = text
    .split(/[\s\p{P}\p{S}]+/u)
    // keep combining marks inside words (\p{M}) — only split on whitespace/punctuation/symbols
    .map((t) => t.replace(/"/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, maxTokens);
  if (tokens.length === 0) return null;
  return tokens
    .map((t, i) => `"${t}"${prefixLast && i === tokens.length - 1 ? "*" : ""}`)
    .join(" ");
}
