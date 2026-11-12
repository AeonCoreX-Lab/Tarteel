import type { PreferencesStore } from "@tarteel/storage";
import type { AyahRef, ReaderMode, ThemeMode, UiLanguage } from "@tarteel/types";
import type { TasbihState } from "./tasbih.ts";
import type { Madhab } from "./madhab.ts";
import type { TranslateTargetPref } from "./translate.ts";

/** Everything stored in the preferences store (MMKV / localStorage). Keep it SMALL. */
export interface PreferenceSchema {
  theme: ThemeMode;
  uiLanguage: UiLanguage;
  /** Quran translation id, independent of UI language. null = Arabic only. */
  selectedTranslationId: string | null;
  readerMode: ReaderMode;
  arabicFontSize: number;
  /** Arabic text size in the Books reader, kept apart from the Quran reader's so each can be set for its own page. */
  bookFontSize: number;
  /**
   * Off by default. When on, an Arabic passage can be translated on this device (machine translation, marked as such). Turning it on
   * lets the app download a small language pack (about 30 MB per language) from Google, once, when the person asks for a translation.
   */
  translateOn: boolean;
  /**
   * Off by default. When on (and the build has an online translator), translation uses the online engine instead of the one on the
   * device: the passage being translated is sent to Tarteel's translation server on Cloudflare, which answers from a shared cache
   * or asks a Gemma model. Turned on only by the person, in Settings, after it says so.
   */
  translateOnline: boolean;
  /** Language to translate into: "app" = the app's language. */
  translateTarget: TranslateTargetPref;
  /** Download language packs only over Wi-Fi. */
  translateWifiOnly: boolean;
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
  /** The school the person named (see `madhab.ts`). Always written together with `asrSchool`; null = not asked or not sure. */
  madhab: Madhab | null;
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
  /**
   * Off by default. When on, hadith are looked up live from hadeethenc.com (the server sees the IP address and what is opened).
   * Nothing is stored. Has an effect only in a build where that provider is enabled. Separate from `onlineHadith`, because it
   * is a different server.
   */
  onlineHadeethEnc: boolean;
  /**
   * Off by default. When on, background reading (people, places, events, surahs) is looked up live from Wikipedia when no
   * installed pack covers a question (wikipedia.org sees the IP address and the words searched). Nothing is stored. Has an
   * effect only in a build where the feature is enabled.
   */
  onlineWikipedia: boolean;
  /**
   * Off by default. When on, tafsir and translation notes are looked up live from quranenc.com (the server sees the IP address
   * and which surah and ayah are opened). Nothing is stored. Has an effect only in a build where that provider is enabled.
   */
  onlineQuranEnc: boolean;
  /**
   * Off by default. When on, the introduction of a surah, classical tafsir and the reasons of revelation are read live from
   * api.quranpedia.net (the server sees the IP address and which surah and ayah are opened). Nothing is stored. Has an effect
   * only in a build where that provider is enabled.
   */
  onlineQuranpedia: boolean;
  /**
   * Off by default. When on, classical books are read live from the islamic.app Library (the server sees the IP address and which
   * book and chapter are opened). Nothing is stored. Has an effect only in a build where that provider is enabled.
   */
  onlineIslamicBooks: boolean;
  /**
   * Off by default. When on, the OpenITI book list can be fetched from Zenodo and a chosen book kept from GitHub (those servers see the
   * IP address). Only the books the person chooses to keep are saved. Has an effect only in a build where that provider is enabled.
   */
  onlineOpenIti: boolean;
  /** The tasbih counter: where each dhikr has got to, and today's totals. See `tasbih.ts`. */
  tasbih: TasbihState | null;
  /** A short vibration on each tap of the tasbih counter, a longer one when a round is finished. */
  tasbihVibrate: boolean;
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
  bookFontSize: 26,
  translateOn: false,
  translateOnline: false,
  translateTarget: "app",
  translateWifiOnly: true,
  translationFontSize: 16,
  lineSpacing: 1.8,
  lastRead: null,
  historyEnabled: true,
  onboardingComplete: false,
  location: null,
  countryCode: null,
  calcMethodId: null,
  asrSchool: null,
  madhab: null,
  prayerOffsets: {},
  hijriOffsetDays: 0,
  audioReciterId: null,
  audioAllowStreaming: false,
  audioPlaybackRate: 1,
  onlineHadith: false,
  onlineHadeethEnc: false,
  onlineWikipedia: false,
  onlineQuranEnc: false,
  onlineQuranpedia: false,
  onlineIslamicBooks: false,
  onlineOpenIti: false,
  tasbih: null,
  tasbihVibrate: true,
  audioRepeatEachAyah: 1,
  audioRepeatRange: 1,
  audioPauseFactor: 0,
  lastListened: null,
};

export const LIMITS = {
  arabicFontSize: { min: 18, max: 56 },
  bookFontSize: { min: 18, max: 44 },
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
export * from "./madhab.ts";
export * from "./translate.ts";
export * from "./translatecloud.ts";
export * from "./translations.ts";
export * from "./hadith.ts";
export * from "./hadeethenc.ts";
export * from "./wikipedia.ts";
export * from "./quranenc.ts";
export * from "./quranpedia.ts";
export * from "./islamicbooks.ts";
export * from "./openiti.ts";
export * from "./providers.ts";
export * from "./tasbih.ts";
export * from "./bookcover.ts";
