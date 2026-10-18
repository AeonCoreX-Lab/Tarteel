import type { PreferencesStore } from "@tarteel/storage";
import type { AyahRef, ReaderMode, ThemeMode, UiLanguage } from "@tarteel/types";

/** Everything stored in the preferences store (MMKV / localStorage). Keep it SMALL. */
export interface PreferenceSchema {
  theme: ThemeMode;
  uiLanguage: UiLanguage;
  /** Quran translation id, independent of UI language. null = Arabic only. */
  selectedTranslationId: string | null;
  readerMode: ReaderMode;
  arabicFontSize: number;
  translationFontSize: number;
  /** Line height multiplier. */
  lineSpacing: number;
  lastRead: AyahRef | null;
  historyEnabled: boolean;
  onboardingComplete: boolean;
  /** Prayer-time location. GPS fix or manual entry; never leaves the device. */
  location: { latitude: number; longitude: number; label?: string; source: "gps" | "manual" } | null;
  /** ISO 3166-1 alpha-2, used only to pick a starting calculation method. */
  countryCode: string | null;
  /** null = use the country default / automatic. */
  calcMethodId: number | null;
  /** null = use the country default. 0 = Shafi/Maliki/Hanbali, 1 = Hanafi. */
  asrSchool: 0 | 1 | null;
  /** Manual per-event corrections in minutes, e.g. { Fajr: -2 }. */
  prayerOffsets: Record<string, number>;
  /** Moon-sighting adjustment for the Hijri date, usually -2..+2. */
  hijriOffsetDays: number;
  /** Chosen reciter (an id from the audio catalog). null = none chosen yet. */
  audioReciterId: string | null;
  /**
   * Off by default: with it off, nothing is fetched to play audio and only downloaded audio plays. When the user
   * turns it on, ayahs that are not downloaded stream from the audio source (a network request).
   */
  audioAllowStreaming: boolean;
  audioPlaybackRate: number;
  /**
   * Off by default. When on, hadith are looked up live from api.islamic.app (a network request that shows the server the IP
   * address and what is searched or opened). Nothing is stored. Has an effect only in a build where the feature is enabled.
   */
  onlineHadith: boolean;
  /** Memorisation: each ayah N times, then the whole range M times. */
  audioRepeatEachAyah: number;
  audioRepeatRange: number;
  /** Pause after each finished ayah as a multiple of its length (0 = off). */
  audioPauseFactor: number;
  /** Where continuous listening got to: its own place, separate from the reading marker. */
  lastListened: { surahId: number; ayahNumber: number; reciterId: string; at: number; pausedAt: number | null } | null;
}

export const PREFERENCE_DEFAULTS: PreferenceSchema = {
  theme: "system",
  uiLanguage: "en",
  selectedTranslationId: null,
  readerMode: "both",
  arabicFontSize: 28,
  translationFontSize: 16,
  lineSpacing: 1.8,
  lastRead: null,
  historyEnabled: true,
  onboardingComplete: false,
  location: null,
  countryCode: null,
  calcMethodId: null,
  asrSchool: null,
  prayerOffsets: {},
  hijriOffsetDays: 0,
  audioReciterId: null,
  audioAllowStreaming: false,
  audioPlaybackRate: 1,
  onlineHadith: false,
  audioRepeatEachAyah: 1,
  audioRepeatRange: 1,
  audioPauseFactor: 0,
  lastListened: null,
};

export const LIMITS = {
  arabicFontSize: { min: 18, max: 56 },
  translationFontSize: { min: 12, max: 32 },
  lineSpacing: { min: 1.3, max: 2.6 },
  audioPlaybackRate: { min: 0.75, max: 2 },
  audioRepeat: { min: 1, max: 10 },
  audioPauseFactor: { min: 0, max: 3 },
} as const;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Parses "2:255", "2 255", "2.255" or just "2" into a validated reference.
 * ayahCounts[i] is the verse count of surah i+1 (from the numbering convention).
 */
export function parseAyahRef(input: string, ayahCounts: readonly number[]): AyahRef | null {
  const m = input.trim().match(/^(\d{1,3})(?:\s*[:.\s]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const surahId = Number(m[1]);
  const ayahNumber = m[2] === undefined ? 1 : Number(m[2]);
  const count = ayahCounts[surahId - 1];
  if (count === undefined || ayahNumber < 1 || ayahNumber > count) return null;
  return { surahId, ayahNumber };
}

export function formatAyahRef(ref: AyahRef): string {
  return `${ref.surahId}:${ref.ayahNumber}`;
}

/** Minimal structural type so core does not depend on the database package. */
export interface HistoryWriter {
  record(ref: AyahRef): Promise<boolean>;
}

/**
 * MMKV pointer for instant "Continue reading" + optional SQLite history.
 * The pointer is always updated; history is written only if the user left it enabled.
 */
export class ReadingProgress {
  private prefs: PreferencesStore<PreferenceSchema>;
  private history: HistoryWriter;
  constructor(prefs: PreferencesStore<PreferenceSchema>, history: HistoryWriter) {
    this.prefs = prefs;
    this.history = history;
  }
  get lastRead(): AyahRef | null {
    return this.prefs.get("lastRead");
  }
  async recordRead(ref: AyahRef): Promise<void> {
    this.prefs.set("lastRead", ref);
    if (this.prefs.get("historyEnabled")) await this.history.record(ref);
  }
}
export * from "./setup.ts";
export * from "./translations.ts";
export * from "./hadith.ts";
