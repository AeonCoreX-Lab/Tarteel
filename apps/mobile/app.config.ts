import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Tarteel",
  slug: "tarteel",
  version: "0.1.0",
  scheme: "tarteel",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/brand/icon.png",
  android: {
    package: "com.aeoncorex.tarteel", // change before first public release; it cannot change later
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-icon-foreground.png",
      monochromeImage: "./assets/brand/adaptive-icon-monochrome.png",
      backgroundColor: "#03402E",
    },
    versionCode: Number(process.env.VERSION_CODE ?? 1),
    // Privacy: notes/bookmarks must stay on the device unless the user opts into sync.
    allowBackup: false,
    // No network-dependent permissions needed for the offline core.
    permissions: [],
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-localization",
    "expo-status-bar",
    [
      "expo-splash-screen",
      {
        // Native splash: the mark on the brand cream / deep green. The in-app BrandSplash continues it.
        image: "./assets/brand/splash-light.png",
        imageWidth: 190,
        resizeMode: "contain",
        backgroundColor: "#FBF9F4",
        dark: { image: "./assets/brand/splash-dark.png", backgroundColor: "#053227" },
      },
    ],
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: false,
        locationWhenInUsePermission: "Tarteel uses your location on this device to calculate prayer times. It is never sent anywhere.",
      },
    ],
  ],
  // AGPL-3.0 source offer shown in Settings -> About. Set SOURCE_URL in CI/env to the real repository.
  extra: { sourceUrl: process.env.SOURCE_URL ?? "https://github.com/AeonCoreX-Lab/Tarteel" },
  web: { bundler: "metro", output: "single", favicon: "./assets/brand/favicon.png", themeColor: "#03402E", backgroundColor: "#FBF9F4" },
};

export default config;
