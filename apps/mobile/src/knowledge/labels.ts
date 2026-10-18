import type { HistoryClaim } from "@tarteel/database";
import type { StringKey } from "../i18n";

/** The words for each evidence label. Shared by the History screen and the Knowledge tab, so a label never reads differently in two places. */
export const EVIDENCE_KEY: Record<HistoryClaim["evidenceLabel"], StringKey> = {
  primary_text: "evPrimaryText",
  source_reported: "evSourceReported",
  scholarly_interpretation: "evScholarly",
  disputed: "evDisputed",
  unverified: "evUnverified",
  no_established_report_found: "evNoReport",
};
