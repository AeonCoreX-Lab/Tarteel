/**
 * Shared domain types for Tarteel. No runtime code lives here.
 * Numbering: surahs are 1..114; ayah numbers restart at 1 in every surah
 * (the numbering convention is declared per dataset, see DatasetManifest).
 */

export type RevelationPlace = "makkah" | "madinah";
export type SajdahType = "recommended" | "obligatory";
export type TextDirection = "ltr" | "rtl";

export interface AyahRef {
  surahId: number;
  ayahNumber: number;
}

export interface Surah {
  id: number;
  nameArabic: string;
  nameTransliteration: string;
  nameEnglish: string;
  revelationPlace: RevelationPlace;
  ayahCount: number;
}

export interface Ayah extends AyahRef {
  textArabic: string;
  juz: number | null;
  hizbQuarter: number | null;
  page: number | null;
  sajdah: SajdahType | null;
}

export interface AyahWithTranslation extends Ayah {
  translation: string | null;
}

// ---------------------------------------------------------------- datasets

export type DatasetKind = "quran" | "translation";

export interface DatasetSource {
  name: string;
  url: string;
}

export interface DatasetLicense {
  name: string;
  spdx?: string;
  url?: string;
}

/**
 * manifest.json shipped next to every dataset. Nothing is optional on purpose:
 * a dataset without provenance and license must not enter the build.
 */
export interface DatasetManifest {
  id: string;
  kind: DatasetKind;
  version: string;
  /** BCP-47, e.g. "ar", "bn", "en" */
  language: string;
  languageName: string;
  direction: TextDirection;
  /** Required for translations. */
  translator?: string;
  source: DatasetSource;
  license: DatasetLicense;
  copyright: string;
  attribution: string;
  /** e.g. "hafs-6236". Documents exactly how verses are numbered. */
  numberingConvention: string;
  /** Must be true before the dataset may be bundled or distributed. */
  redistributionPermitted: boolean;
  /** ISO date the data was imported from the source. */
  importedAt: string;
  /** file name -> lowercase hex sha256 */
  files: Record<string, string>;
}

export interface TranslationMeta {
  id: string;
  language: string;
  languageName: string;
  direction: TextDirection;
  translator: string;
  version: string;
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  copyright: string;
  attribution: string;
}

/** Row format of ayahs.json (Quran and translations). */
export interface AyahRecord {
  surah: number;
  ayah: number;
  text: string;
}

/** Row format of surahs.json */
export interface SurahRecord {
  id: number;
  name_ar: string;
  name_translit: string;
  name_en: string;
  revelation: RevelationPlace;
}

/** Row format of ayah_meta.json (optional) */
export interface AyahMetaRecord {
  surah: number;
  ayah: number;
  juz?: number;
  hizb_quarter?: number;
  page?: number;
  sajdah?: SajdahType;
}

// -------------------------------------------------------------- user data

export interface Bookmark extends AyahRef {
  id: number;
  note: string | null;
  createdAt: number;
}

export interface Note extends AyahRef {
  id: number;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry extends AyahRef {
  id: number;
  readAt: number;
}

export interface SearchHit extends AyahRef {
  /** Matched text with matches wrapped in [ ] */
  highlighted: string;
}

// ------------------------------------------------------------ preferences

export type ThemeMode = "system" | "light" | "dark" | "amoled";
export type ReaderMode = "arabic" | "translation" | "both";
export type UiLanguage = "bn" | "en" | "ar";
