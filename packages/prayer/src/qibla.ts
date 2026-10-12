/** Kaaba coordinates (Masjid al-Haram, Makkah), degrees. */
export const KAABA = { latitude: 21.4225, longitude: 39.8262 } as const;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const EARTH_RADIUS_KM = 6371;

/** Great-circle initial bearing to the Kaaba, degrees clockwise from TRUE north (0..360). null if you are at the Kaaba. */
export function qiblaBearing(latitude: number, longitude: number): number | null {
  if (distanceToKaabaKm(latitude, longitude) < 0.5) return null;
  const p1 = rad(latitude);
  const p2 = rad(KAABA.latitude);
  const dl = rad(KAABA.longitude - longitude);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}

/** Haversine distance to the Kaaba in kilometres. */
export function distanceToKaabaKm(latitude: number, longitude: number): number {
  const p1 = rad(latitude);
  const p2 = rad(KAABA.latitude);
  const dp = p2 - p1;
  const dl = rad(KAABA.longitude - longitude);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Signed shortest turn in degrees from `heading` to `target`: negative = turn left, positive = turn right (-180..180]. */
export function turnToward(heading: number, target: number): number {
  const d = norm360(target - heading);
  return d > 180 ? d - 360 : d;
}

export const isAligned = (heading: number, target: number, toleranceDeg = 3): boolean =>
  Math.abs(turnToward(heading, target)) <= toleranceDeg;

export type HeadingQuality = "good" | "fair" | "poor";

/**
 * expo-location heading accuracy is 0..3 on Android/iOS (3 = best, 0 = uncalibrated, -1 = unknown).
 * Anything below 2 should prompt the user to calibrate (figure-8 motion) before trusting the needle.
 */
export function headingQuality(accuracy: number): HeadingQuality {
  if (accuracy >= 3) return "good";
  if (accuracy === 2) return "fair";
  return "poor";
}
