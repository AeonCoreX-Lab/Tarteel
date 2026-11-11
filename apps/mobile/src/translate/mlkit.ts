import { NativeModules, Platform } from "react-native";
import { TranslateError } from "@tarteel/core";
import type { PrepareOptions, TranslateErrorCode, TranslateLang, TranslatorPort } from "@tarteel/core";

/** The Kotlin side (`native/tarteel-android/.../TarteelTranslateModule.kt`). */
type Native = {
  downloaded(): Promise<string[]>;
  prepare(from: string, to: string, wifiOnly: boolean): Promise<void>;
  translate(text: string, from: string, to: string): Promise<string>;
  remove(lang: string): Promise<void>;
};

const native: Native | undefined = Platform.OS === "android" ? (NativeModules["TarteelTranslate"] as Native | undefined) : undefined;

function fail(e: unknown, fallback: TranslateErrorCode): TranslateError {
  const code = (e as { code?: unknown } | null)?.code;
  const message = e instanceof Error ? e.message : "translation failed";
  return new TranslateError(code === "download-failed" || code === "unavailable" || code === "pack-missing" ? code : fallback, message);
}

/**
 * Google ML Kit on-device translation. Available only in an Android build that carries the native module (not Expo Go, not web).
 * The text stays on the phone; the network is used only to download a language pack when `prepare` is called.
 */
export const mlkitTranslator: TranslatorPort = {
  id: "mlkit",
  name: "Google ML Kit (on this device)",
  async available() {
    return native !== undefined;
  },
  async downloaded() {
    if (!native) return [];
    try {
      return await native.downloaded();
    } catch {
      return [];
    }
  },
  async prepare(from: TranslateLang, to: TranslateLang, options: PrepareOptions) {
    if (!native) throw new TranslateError("unavailable", "not linked");
    try {
      await native.prepare(from, to, options.wifiOnly);
    } catch (e) {
      throw fail(e, "download-failed");
    }
  },
  async remove(lang: TranslateLang) {
    if (!native) throw new TranslateError("unavailable", "not linked");
    try {
      await native.remove(lang);
    } catch (e) {
      throw fail(e, "failed");
    }
  },
  async translate(text: string, from: TranslateLang, to: TranslateLang) {
    if (!native) throw new TranslateError("unavailable", "not linked");
    try {
      return await native.translate(text, from, to);
    } catch (e) {
      throw fail(e, "failed");
    }
  },
};
