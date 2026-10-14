import type { WordSpan } from "./timing.ts";

/**
 * Maps the timing data's word numbers onto the tokens of the text the reader draws.
 *
 * Timing data counts words the way a printed mushaf does. The reader's text is split on spaces, and the Tanzil text
 * has a token of its own for every pause or annotation sign (U+06D6..U+06ED, U+0610..U+061A) where the mushaf
 * attaches the sign to the word before it. About one ayah in three has one. Counting tokens would light a word too
 * far to the right from the first sign on, so those tokens are skipped when counting.
 *
 * (Mihrab hit the same mismatch and also had to skip the basmalah Tanzil prepends to ayah 1. Tarteel's dataset has
 * that basmalah removed at import, so there is nothing to skip: `data/quran/tanzil-uthmani/PROVENANCE.md`.)
 */
const ANNOTATION_ONLY = /^[ؐ-ؚۖ-ۭ]+$/;

/** True for a token that is only pause/annotation signs: it is not a word. */
export function isAnnotationToken(token: string): boolean {
  return ANNOTATION_ONLY.test(token);
}

/** `counted[wordNumber]` is the index into `tokens` of that word. */
export function countedTokenIndices(tokens: readonly string[]): number[] {
  const out: number[] = [];
  tokens.forEach((t, i) => {
    if (t.length > 0 && !isAnnotationToken(t)) out.push(i);
  });
  return out;
}

/**
 * The tokens to light for a span of words, as an inclusive range of token indexes, or null.
 *
 * Null whenever the span does not fit the text (a word number past the last word, an empty span). That is the
 * safety check on the whole feature: if a timing file counts words differently from the text, the reader lights
 * nothing for that ayah rather than the wrong word.
 */
export function tokenRangeForSpan(tokens: readonly string[], span: WordSpan | null): { from: number; to: number } | null {
  if (!span || span.end <= span.first || span.first < 0) return null;
  const counted = countedTokenIndices(tokens);
  const from = counted[span.first];
  const to = counted[span.end - 1];
  return from === undefined || to === undefined ? null : { from, to };
}

/** Whether every word number a timing table gives for one ayah fits the text. Used to refuse a mismatched source. */
export function timingsFitText(tokens: readonly string[], segments: readonly (readonly [number, number, number, number])[]): boolean {
  const words = countedTokenIndices(tokens).length;
  return segments.every((s) => s[0] < words && Math.max(s[1], s[0] + 1) <= words);
}
