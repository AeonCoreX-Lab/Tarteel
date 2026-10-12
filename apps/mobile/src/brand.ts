/* eslint-disable @typescript-eslint/no-require-imports */
// Official brand constants. Logo files live in brand/source and are processed by scripts/brand/build_assets.py.
export const BRAND = {
  name: "Tarteel",
  arabicName: "\u062A\u0631\u062A\u064A\u0644", // the wordmark's Arabic line; UI text, not Quran text
  gold: "#B88A2A",
  green: "#03402E",
  cream: "#FBF9F4",
} as const;

export const MARKS = {
  /** green + gold: for light backgrounds */
  color: require("../assets/brand/mark-color.png") as number,
  /** cream + gold: for dark backgrounds */
  light: require("../assets/brand/mark-light.png") as number,
};
