import type { AyahRef } from "@tarteel/types";

export type { AyahRef };

/**
 * Proof that a human read the audio source's terms. Without it a reciter can be listed but never enabled:
 * the project rule is "verify each audio licence ourselves, never trust an upstream claim".
 */
export interface ReciterVerification {
  /** True only after the owner has read the source's terms and confirmed the audio may be downloaded and stored on devices. */
  licenseVerified: boolean;
  /** ISO date, YYYY-MM-DD. */
  verifiedOn: string;
  verifiedBy: string;
  /** The page whose terms were read. */
  termsUrl: string;
}

/** Optional per-recording word timings (segments per ayah). Timing data is specific to ONE recording. */
export interface ReciterTimings {
  url: string;
  /** Shown in Settings -> Sources, e.g. the data set's name, author and licence. */
  attribution: string;
}

export interface Reciter {
  /** Stable id: used in settings and as a directory name, so it is restricted to [a-z0-9-]. */
  id: string;
  /** Display name (a proper noun, not translated). */
  name: string;
  arabicName: string;
  /**
   * https URL for one ayah's MP3, numbered by the Hafs 6236 convention. Either `{surah3}` and `{ayah3}` (each zero
   * padded to three digits) or `{ayah}`, the ayah's number in the whole book (1..6236, not padded). Not both.
   */
  urlTemplate: string;
  /** Used only for the storage estimate shown before a whole-Quran download. */
  bitrateKbps: number;
  /** Reading the recording is of, e.g. "hafs". */
  riwayah: string;
  /**
   * Set only for a recording whose FIRST ayah file already starts with the Bismillah, so the player must not add one
   * in front of it. Leave it out for the usual one-file-per-ayah recordings, where the Bismillah is the 1:1 file.
   */
  bismillahInFirstAyah?: boolean;
  /** Extra spellings the search box should match. */
  aliases?: string[];
  /** Credit line shown in Settings -> Sources. */
  attribution: string;
  verification: ReciterVerification;
  timings?: ReciterTimings;
  /** A listed reciter is only offered to users when enabled. Enabling requires `verification.licenseVerified`. */
  enabled: boolean;
}

/** The part of a track the player needs. The platform adapter maps it onto its player library. */
export interface PlayerTrack {
  id: string;
  /** `https://…` stream or a local file URI. */
  url: string;
  title: string;
  artist: string;
  album?: string;
}
