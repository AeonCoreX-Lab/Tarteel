/** What the Worker accepts and what it lets out. Pure functions, no network. */

export const MAX_CHARS = 600;
export const MAX_BODY_BYTES = 4096;

export type TargetLang = "en" | "bn";

export type Parsed = { ok: true; text: string; from: "ar"; to: TargetLang } | { ok: false; code: "bad-request" | "too-long" | "not-arabic"; message: string };

/* eslint-disable no-control-regex */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/* eslint-enable no-control-regex */
const ARABIC_LETTER = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const ANY_LETTER = /\p{L}/u;

/** One spelling of a passage, so the same sentence always has the same cache key: line ends unified, runs of spaces collapsed, ends trimmed. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0\u200f\u200e]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function countLetters(s: string, test: RegExp): number {
  let n = 0;
  for (const ch of s) if (test.test(ch)) n++;
  return n;
}

/** Share of letters in `s` that are Arabic-script (0 when there are none). */
export function arabicShare(s: string): number {
  const letters = countLetters(s, ANY_LETTER);
  return letters === 0 ? 0 : countLetters(s, ARABIC_LETTER) / letters;
}

export function parseRequest(raw: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, code: "bad-request", message: "body is not JSON" };
  }
  if (typeof data !== "object" || data === null) return { ok: false, code: "bad-request", message: "body must be an object" };
  const o = data as Record<string, unknown>;
  if (o["from"] !== "ar") return { ok: false, code: "bad-request", message: "only Arabic source text is supported" };
  const to = o["to"];
  if (to !== "en" && to !== "bn") return { ok: false, code: "bad-request", message: "target must be en or bn" };
  if (typeof o["text"] !== "string") return { ok: false, code: "bad-request", message: "text must be a string" };
  const text = normalizeText(o["text"]);
  if (text === "") return { ok: false, code: "bad-request", message: "text is empty" };
  if (text.length > MAX_CHARS) return { ok: false, code: "too-long", message: `text is longer than ${MAX_CHARS} characters` };
  if (CONTROL.test(text)) return { ok: false, code: "bad-request", message: "text has control characters" };
  if (arabicShare(text) < 0.5) return { ok: false, code: "not-arabic", message: "text is not mostly Arabic" };
  return { ok: true, text, from: "ar", to };
}

/** Takes off wrapping a model sometimes adds: code fences and one pair of quotes around the whole answer. */
export function cleanOutput(out: string): string {
  let s = out.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(s);
  if (fence?.[1] !== undefined) s = fence[1].trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["“", "”"], ["«", "»"]];
  for (const [open, close] of pairs) {
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close) && !s.slice(1, -1).includes(open)) {
      s = s.slice(1, -1).trim();
      break;
    }
  }
  return s;
}

/**
 * Whether a model's answer is fit to show and to keep in the shared cache. A wrong answer cached is wrong for everyone for 90
 * days, so this is strict: not empty, not far too long or too short for the input, and in the script the target needs.
 */
export function checkOutput(out: string, to: TargetLang, inputLength: number): { ok: true; text: string } | { ok: false; reason: string } {
  const text = cleanOutput(out);
  if (text === "") return { ok: false, reason: "empty" };
  if (text.length > inputLength * 8 + 200) return { ok: false, reason: "too long" };
  if (text.length < inputLength * 0.15) return { ok: false, reason: "too short" };
  if (CONTROL.test(text)) return { ok: false, reason: "control characters" };
  const letters = countLetters(text, ANY_LETTER);
  if (letters === 0) return { ok: false, reason: "no letters" };
  if (arabicShare(text) > 0.2) return { ok: false, reason: "mostly Arabic" };
  const script = to === "bn" ? /\p{Script=Bengali}/u : /\p{Script=Latin}/u;
  if (countLetters(text, script) / letters < 0.5) return { ok: false, reason: "wrong script" };
  return { ok: true, text };
}
