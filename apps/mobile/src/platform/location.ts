import * as Location from "expo-location";
import { getLocales } from "expo-localization";

export type LocationFailure = "permission-denied" | "unavailable";

export class LocationError extends Error {
  reason: LocationFailure;
  constructor(reason: LocationFailure) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * One-shot, foreground-only GPS fix. The coordinates stay on the device (preferences only).
 * The country code comes from the DEVICE REGION setting, not from the coordinates (no network lookup);
 * it only chooses a starting calculation method that the user can change.
 */
export async function detectLocation(): Promise<{
  location: { latitude: number; longitude: number; source: "gps" };
  countryCode: string | null;
}> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") throw new LocationError("permission-denied");
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, source: "gps" },
      countryCode: getLocales()[0]?.regionCode ?? null,
    };
  } catch {
    throw new LocationError("unavailable");
  }
}

export function deviceRegion(): string | null {
  return getLocales()[0]?.regionCode ?? null;
}
