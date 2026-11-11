/**
 * Machine translation, as a port. The reader (and any later screen) talks to a `TranslatorPort`; an engine is one file that
 * implements it. Today there is one engine (ML Kit, on the device). A bigger one (a local language model) or another system
 * engine would be one more file and one more entry in the list the app passes to `pickTranslator`, with no change to a screen.
 *
 * Rules every engine and screen follow:
 *  - the original text is never replaced: a translation is shown beside it, marked as machine translation;
 *  - nothing is translated before the person turned it on, and a language pack is downloaded only after they agreed;
 *  - the text being translated is not sent anywhere by Tarteel (an on-device engine keeps it on the device).
 */

export const TRANSLATE_LANGS = ["ar", "en", "bn"] as const;
export type TranslateLang = (typeof TRANSLATE_LANGS)[number];

/** Where the translation goes: the app's own language (the default), or one chosen. */
export type TranslateTargetPref = "app" | "en" | "bn";

export type TranslateErrorCode = "unavailable" | "pack-missing" | "download-failed" | "failed" | "cancelled";

export class TranslateError extends Error {
  readonly code: TranslateErrorCode;
  constructor(code: TranslateErrorCode, message: string) {
    super(message);
    this.name = "TranslateError";
    this.code = code;
  }
}

export interface PrepareOptions {
  /** Download language packs only over Wi-Fi. */
  wifiOnly: boolean;
}

export interface TranslatorPort {
  /** Stable id, for example "mlkit". */
  readonly id: string;
  /** The name shown to the person, for example "Google ML Kit (on this device)". */
  readonly name: string;
  /** Whether this engine can run here at all (for example the native part is linked). Never throws. */
  available(): Promise<boolean>;
  /** Language codes whose packs are on the device. */
  downloaded(): Promise<string[]>;
  /** Makes `from` to `to` ready, downloading what is missing. Rejects with `download-failed` when it cannot. */
  prepare(from: TranslateLang, to: TranslateLang, options: PrepareOptions): Promise<void>;
  /** Deletes one language pack. */
  remove(lang: TranslateLang): Promise<void>;
  /** Translates one short piece of text. Rejects with `pack-missing` when `prepare` has not been done. */
  translate(text: string, from: TranslateLang, to: TranslateLang): Promise<string>;
}

/** What a screen shows under the original: the text and where it came from. Always `machine: true`. */
export interface MachineTranslation {
  readonly text: string;
  readonly from: TranslateLang;
  readonly to: TranslateLang;
  readonly engineId: string;
  readonly engineName: string;
  readonly machine: true;
}

/** The language to translate into: the one chosen, or the app's language. The Arabic setting falls back to English. */
export function targetLanguage(pref: TranslateTargetPref, uiLanguage: string): "en" | "bn" {
  if (pref === "en" || pref === "bn") return pref;
  return uiLanguage === "bn" ? "bn" : "en";
}

/** The first engine that can run, in the order given; null if none can. */
export async function pickTranslator(ports: readonly TranslatorPort[]): Promise<TranslatorPort | null> {
  for (const p of ports) {
    try {
      if (await p.available()) return p;
    } catch {
      /* an engine that throws is not available */
    }
  }
  return null;
}

const ENDERS = new Set([".", "؟", "?", "!", "؛", ";", "۔", "\n"]);

/**
 * Cuts text into pieces an engine copes with, at the ends of sentences (an Arabic full stop, question mark, semicolon, a new
 * line), never inside a word. Pieces are joined back to about `max` characters; a sentence longer than `max` is cut at the last
 * space before it. No text is lost or reordered: `pieces.join("")` is the input.
 */
export function splitForTranslation(text: string, max = 450): string[] {
  const sentences: string[] = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (ENDERS.has(ch)) {
      sentences.push(cur);
      cur = "";
    }
  }
  if (cur !== "") sentences.push(cur);
  const pieces: string[] = [];
  let acc = "";
  const flush = (): void => {
    if (acc !== "") pieces.push(acc);
    acc = "";
  };
  for (let s of sentences) {
    while (s.length > max) {
      const space = s.lastIndexOf(" ", max);
      const at = space > max * 0.4 ? space + 1 : max;
      flush();
      pieces.push(s.slice(0, at));
      s = s.slice(at);
    }
    if (acc.length + s.length > max) flush();
    acc += s;
  }
  flush();
  return pieces;
}

export interface TranslateOptions {
  signal?: AbortSignal | undefined;
  /** Called after each piece with how many are done, for a progress line. */
  onProgress?: ((done: number, total: number) => void) | undefined;
}

/** Translates a passage piece by piece (so a long one shows progress and can be stopped) and returns it marked as machine translation. */
export async function translateText(port: TranslatorPort, text: string, from: TranslateLang, to: TranslateLang, options: TranslateOptions = {}): Promise<MachineTranslation> {
  const pieces = splitForTranslation(text);
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (options.signal?.aborted) throw new TranslateError("cancelled", "stopped");
    const piece = pieces[i] as string;
    if (piece.trim() === "") {
      out.push(piece);
    } else {
      const translated = await port.translate(piece.trim(), from, to);
      out.push(translated.trim());
    }
    options.onProgress?.(i + 1, pieces.length);
  }
  return { text: out.filter((s) => s !== "").join("\n"), from, to, engineId: port.id, engineName: port.name, machine: true };
}
