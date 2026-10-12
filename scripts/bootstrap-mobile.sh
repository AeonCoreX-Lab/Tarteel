#!/bin/sh
# One-time (re-runnable) setup for apps/mobile on any machine, including Termux.
# `expo install` picks the dependency versions that match the pinned Expo SDK, so we never
# guess version numbers by hand. Commit the resulting package.json + package-lock.json.
set -eu
cd "$(dirname "$0")/.."
npm install
cd apps/mobile
npx expo install \
  expo-router expo-sqlite expo-status-bar expo-linking expo-constants expo-location expo-localization expo-splash-screen react-native-svg \
  react-native-mmkv react-native-nitro-modules \
  react-native-safe-area-context react-native-screens
# react-native-notify-kit is not in the Expo SDK table; its version comes from apps/mobile/package.json
npx expo install --check || true
echo "Done. Now commit package.json and package-lock.json."
