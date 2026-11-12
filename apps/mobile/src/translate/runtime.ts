import type { MachineTranslation, TranslatorPort } from "@tarteel/core";
import { mlkitTranslator } from "./mlkit";
import { onlineTranslator } from "./online";

/**
 * The engines this build can run. Adding one (a local language model, a system engine) is one file that implements
 * `TranslatorPort` and a line here; no screen changes.
 *  - `device`: on the phone, nothing leaves it. The default.
 *  - `online`: Tarteel's translation server. Used only when the person turned it on in Settings.
 */
export interface Engines {
  device: TranslatorPort | null;
  online: TranslatorPort | null;
}

let found: Promise<Engines> | null = null;

async function usable(port: TranslatorPort | null): Promise<TranslatorPort | null> {
  if (!port) return null;
  try {
    return (await port.available()) ? port : null;
  } catch {
    return null;
  }
}

/** Which engines can run in this build. Decided once. */
export function getEngines(): Promise<Engines> {
  found ??= Promise.all([usable(mlkitTranslator), usable(onlineTranslator)]).then(([device, online]) => ({ device, online }));
  return found;
}

/**
 * The engine to use: the online one only when the person chose it and this build has it, otherwise the one on the device. It never
 * goes the other way round, and it never sends text online because the on-device engine is missing: with no engine there is none.
 */
export function chooseEngine(engines: Engines, online: boolean): TranslatorPort | null {
  return online && engines.online ? engines.online : engines.device;
}

/** Translations made in this session, kept in memory only so a passage scrolled away and back is not translated again. Nothing is written to disk. */
const memory = new Map<string, MachineTranslation>();
const MEMORY_MAX = 60;

/** One key per engine, language and passage, so switching engine shows that engine's translation, not the other one's. */
export const translationKey = (text: string, to: string, engineId: string): string => `${engineId}|${to}|${text}`;

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
