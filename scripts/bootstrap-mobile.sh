#!/bin/sh
# One-time (re-runnable) setup for apps/mobile on any machine, including Termux.
# `expo install` picks the dependency versions that match the pinned Expo SDK, so we never
# guess version numbers by hand. Commit the resulting package.json + package-lock.json.
set -eu
cd "$(dirname "$0")/.."
npm install
cd apps/mobile
npx expo install \
  expo-router expo-sqlite expo-file-system expo-status-bar expo-linking expo-constants expo-location expo-localization expo-splash-screen react-native-svg \
  react-native-mmkv react-native-nitro-modules \
  react-native-safe-area-context react-native-screens
# react-native-notify-kit and react-native-track-player are not in the Expo SDK table; their versions come from apps/mobile/package.json
# (track-player 4.1.2 needs patches/react-native-track-player+4.1.2.patch for the New Architecture; patch-package applies it on install)
npx expo install --check || true
echo "Done. Now commit package.json and package-lock.json."
