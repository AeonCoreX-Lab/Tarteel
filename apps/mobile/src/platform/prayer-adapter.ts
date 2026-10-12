import type { CalcInput, TimesCalculator } from "@tarteel/prayer";
// Vendored, hash-locked upstream code (AGPL-3.0-or-later). Imported only here, so a change in
// upstream's API is fixed in this one file.
import { computeLocalAdhanTimes } from "../../../../third_party/mihrab/src/providers/localAdhan";

/**
 * Binds the vendored on-device calculator (adhan) to Tarteel's TimesCalculator.
 * Fully offline. Times come back in the device's local time zone.
 */
export const calculateTimes: TimesCalculator = (i: CalcInput) =>
  computeLocalAdhanTimes({
    latitude: i.latitude,
    longitude: i.longitude,
    date: i.date,
    calculationMethod: i.methodId,
    school: i.school,
  });
