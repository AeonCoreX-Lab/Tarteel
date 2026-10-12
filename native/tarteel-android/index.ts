import { NativeModules, Platform } from "react-native";

/** Activity class that notify-kit launches over the lock screen (vendored from Mihrab, package com.prayer_times). */
export const PRAYER_ALARM_ACTIVITY = "com.prayer_times.PrayerAlarmActivity";

type FullScreenAlarmNative = { canUse(): Promise<boolean>; openSettings(): Promise<void> };
const native: FullScreenAlarmNative | undefined =
  Platform.OS === "android" ? (NativeModules["FullScreenAlarm"] as FullScreenAlarmNative | undefined) : undefined;

/** False when the native module is not linked (e.g. Expo Go, web) or the permission is off. */
export async function canUseFullScreenIntent(): Promise<boolean> {
  try {
    return native ? Boolean(await native.canUse()) : false;
  } catch {
    return false;
  }
}

/** Opens the system screen where the user grants full-screen alerts. No-op when unavailable. */
export async function openFullScreenIntentSettings(): Promise<void> {
  try {
    await native?.openSettings();
  } catch {
    /* ignore */
  }
}

export const isNativeLinked = native !== undefined;
