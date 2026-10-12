import { getLocales } from "expo-localization";
import type { UiLanguage } from "@tarteel/types";

/** The UI language to suggest on first launch: Bangla if the device is set to Bangla, otherwise English. */
export function suggestedUiLanguage(): UiLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === "bn" ? "bn" : "en";
}
