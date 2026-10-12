import { Platform, useColorScheme } from "react-native";
import { useSettings } from "./state/settings";

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  /** Slightly recessed panels (inputs, table headers). */
  surfaceAlt: string;
  text: string;
  muted: string;
  /** Brand green: fills (buttons, hero card). */
  accent: string;
  /** Brand green as TEXT/ICON colour: lighter in dark themes so it keeps 4.5:1 contrast. */
  accentText: string;
  onAccent: string;
  border: string;
  /** Gold, for non-text marks only (current-prayer bar, progress). */
  brass: string;
  /** Gold as text colour (>= 4.5:1 on bg and surface). */
  brassText: string;
}

// Colours sampled from the official logo files (brand/source): deep green #03402E, cream #FBF9F4, gold ramp #EAC76C -> #A46906.
// Every text/background pair below is >= 4.5:1 (checked in docs/design/BRAND.md).
const light: Theme = {
  dark: false, bg: "#FBF9F4", surface: "#FFFFFF", surfaceAlt: "#F3EEE0", text: "#0A2B22", muted: "#55665F",
  accent: "#03402E", accentText: "#03402E", onAccent: "#FBF9F4", border: "#E3DDCB", brass: "#B88A2A", brassText: "#8A6414",
};
const dark: Theme = {
  dark: true, bg: "#0E1A17", surface: "#15251F", surfaceAlt: "#1B2E27", text: "#EEE9DB", muted: "#A3B3AB",
  accent: "#0F5A3F", accentText: "#7FCFA6", onAccent: "#FBF9F4", border: "#24382F", brass: "#E3B94F", brassText: "#E3B94F",
};
const amoled: Theme = { ...dark, bg: "#000000", surface: "#0A0F0D", surfaceAlt: "#111A16", border: "#1C2A24" };

export function useTheme(): Theme {
  const mode = useSettings((s) => s.theme);
  const system = useColorScheme();
  if (mode === "amoled") return amoled;
  if (mode === "dark" || (mode === "system" && system === "dark")) return dark;
  return light;
}

/** Headings use the platform serif (Noto Serif on Android) to echo the wordmark. A licensed font bundle comes after the font audit. */
export const HEADING_FONT = Platform.select({ android: "serif", ios: "Georgia", default: "serif" });
