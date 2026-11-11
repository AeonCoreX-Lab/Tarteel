import { pickTranslator } from "@tarteel/core";
import type { MachineTranslation, TranslatorPort } from "@tarteel/core";
import { mlkitTranslator } from "./mlkit";

/**
 * The engines the app knows, best first. Adding one (a local language model, a system engine) is one file that implements
 * `TranslatorPort` and one line here; no screen changes.
 */
const ENGINES: readonly TranslatorPort[] = [mlkitTranslator];

let picked: Promise<TranslatorPort | null> | null = null;

/** The engine to use, or null when none can run in this build. Decided once. */
export function getTranslator(): Promise<TranslatorPort | null> {
  picked ??= pickTranslator(ENGINES);
  return picked;
}

/** Translations made in this session, kept in memory only so a passage scrolled away and back is not translated again. Nothing is written to disk. */
const memory = new Map<string, MachineTranslation>();
const MEMORY_MAX = 60;

export const translationKey = (text: string, to: string): string => `${to}\u0000${text}`;

export function rememberedTranslation(key: string): MachineTranslation | undefined {
  return memory.get(key);
}

export function rememberTranslation(key: string, value: MachineTranslation): void {
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}
