import { createHash } from "node:crypto";
import { HAFS_6236, validateAyahs } from "@tarteel/quran-data";
import type { AyahMetaRecord, DatasetManifest, SurahRecord } from "@tarteel/types";
import { buildAyahMeta, commentBlock, headerField, isoFromTanzilDate, parseMarkers, parseSurahs, parseVerseLines, stripPrefixedBismillah } from "./parse.ts";

// Deterministic: the same four Tanzil files always produce byte-identical datasets, so scripts/import-tanzil/import.test.ts
// can prove that nothing under data/quran and data/translations was edited by hand.

export const IMPORTED_AT = "2026-10-12";
export const SOURCE_DIR = "sources/tanzil";
export const SOURCE_FILES = { quran: "quran-uthmani.txt", metadata: "quran-data.xml", bn: "bn_bengali.txt", en: "en_sahih.txt" } as const;

export interface TanzilSources { quran: string; metadata: string; bn: string; en: string }

export interface BuildReport { ayahs: number; stripped: number[]; variants: number[] }
export interface Built {
  /** path relative to data/ -> file content (UTF-8) */
  files: Map<string, string>;
  report: BuildReport;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const jsonRows = (rows: readonly object[]): string => "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
const pretty = (o: unknown): string => JSON.stringify(o, null, 2) + "\n";

const TANZIL_TERMS = "https://tanzil.net/download/";

function expectHeader(source: string, label: string, field: string, expected: string): void {
  const got = headerField(source, field);
  if (got !== expected) throw new Error(`${label}: header "${field}" is "${got}", expected "${expected}": wrong file?`);
}

function manifest(m: Omit<DatasetManifest, "files" | "numberingConvention" | "redistributionPermitted" | "importedAt">, files: Record<string, string>): DatasetManifest {
  return { ...m, numberingConvention: HAFS_6236.id, redistributionPermitted: true, importedAt: IMPORTED_AT, files };
}

export function buildAll(src: TanzilSources): Built {
  const out = new Map<string, string>();
  const sumsOf = { [SOURCE_FILES.quran]: sha256(src.quran), [SOURCE_FILES.metadata]: sha256(src.metadata), [SOURCE_FILES.bn]: sha256(src.bn), [SOURCE_FILES.en]: sha256(src.en) };
  out.set(`${SOURCE_DIR}/SHA256SUMS`, Object.entries(sumsOf).sort(([a], [b]) => a.localeCompare(b)).map(([n, h]) => `${h}  ${n}\n`).join(""));

  // ---------------------------------------------------------------- Quran text
  if (!src.quran.includes("#  Tanzil Quran Text (Uthmani, Version 1.1)")) throw new Error("quran-uthmani.txt: not the Tanzil Uthmani Version 1.1 text: wrong file?");
  const rawAyahs = parseVerseLines(src.quran);
  const { ayahs, stripped, variants } = stripPrefixedBismillah(rawAyahs);
  const expectedStripped = HAFS_6236.ayahCounts.map((_n, i) => i + 1).filter((s) => s !== 1 && s !== 9);
  if (stripped.join() !== expectedStripped.join()) throw new Error("the Bismillah prefix was not found on exactly surahs 2-114 except 9");
  const report = validateAyahs(ayahs, HAFS_6236, "tanzil-uthmani");
  if (!report.ok) throw new Error(`Quran text failed validation: ${report.issues.map((i) => i.message).join("; ")}`);

  const surahMeta = parseSurahs(src.metadata);
  surahMeta.forEach((s, i) => {
    if (s.ayas !== HAFS_6236.ayahCounts[i]) throw new Error(`metadata says surah ${i + 1} has ${s.ayas} ayahs, hafs-6236 says ${HAFS_6236.ayahCounts[i]}`);
  });
  const surahs: SurahRecord[] = surahMeta.map((s) => s.record);
  const ayahMeta: AyahMetaRecord[] = buildAyahMeta(ayahs, parseMarkers(src.metadata));

  const qDir = "quran/tanzil-uthmani";
  const qCopyright = commentBlock(src.quran);
  const qProvenance = [
    "# Provenance: tanzil-uthmani",
    "",
    "- Text: Tanzil Project, Quran text, Uthmani, Version 1.1 (https://tanzil.net/download/).",
    `- Source file: data/${SOURCE_DIR}/${SOURCE_FILES.quran} (sha256 ${sumsOf[SOURCE_FILES.quran]}), kept byte for byte with its copyright block.`,
    `- Metadata: data/${SOURCE_DIR}/${SOURCE_FILES.metadata} (sha256 ${sumsOf[SOURCE_FILES.metadata]}) -> surahs.json, ayah_meta.json.`,
    "- Download options: Uthmani, \"Text (with aya numbers)\", pause marks ON, sajdah signs OFF, rub-el-hizb signs OFF, tatweel below superscript alefs ON, sequential tanweens OFF.",
    "",
    "## The one change made to the text",
    "",
    "`ayahs.json` has exactly one row per source row. Tanzil prepends the Bismillah to the first ayah of every surah except",
    "Al-Fatihah (where it is ayah 1) and At-Tawbah (which has none). Under the `hafs-6236` convention (see",
    "`packages/quran-data/src/numbering.ts`) it is not part of those verses, so the Bismillah and the single space after it",
    `are removed from ayah 1 of ${stripped.length} surahs (2-114 except 9). No other character of any verse is touched.`,
    "",
    `In surahs ${variants.join(" and ")} Tanzil's prefix carries one extra shadda on the first letter; it is removed with the rest of the`,
    "prefix and is not carried into the dataset. Any other deviation makes the importer fail instead of guessing.",
    "",
    "`npm run import:tanzil` regenerates every file here; `scripts/import-tanzil/import.test.ts` fails if any of them differs.",
    "",
    "## Terms (from the Tanzil copyright block, also in COPYRIGHT-TANZIL.txt)",
    "",
    "Verbatim copies only, source (Tanzil Project) clearly indicated with a link to tanzil.net, copyright block reproduced in derived files.",
    "",
  ].join("\n");
  const qFiles: Record<string, string> = {
    "ayahs.json": jsonRows(ayahs),
    "surahs.json": jsonRows(surahs),
    "ayah_meta.json": jsonRows(ayahMeta),
    "COPYRIGHT-TANZIL.txt": qCopyright,
    "PROVENANCE.md": qProvenance,
  };
  for (const [name, content] of Object.entries(qFiles)) out.set(`${qDir}/${name}`, content);
  out.set(`${qDir}/manifest.json`, pretty(manifest({
    id: "tanzil-uthmani", kind: "quran", version: "1.1", language: "ar", languageName: "Arabic", direction: "rtl",
    source: { name: "Tanzil Project: Quran text, Uthmani, Version 1.1", url: TANZIL_TERMS },
    license: { name: "Creative Commons Attribution 3.0, under Tanzil's terms of use (verbatim copies only; credit Tanzil and link to tanzil.net)", url: TANZIL_TERMS },
    copyright: "Copyright (C) 2007-2026 Tanzil Project",
    attribution: "Quran text (Uthmani, version 1.1) from the Tanzil Project, https://tanzil.net",
  }, hashes(qFiles))));

  // ------------------------------------------------------------- translations
  const translations = [
    {
      text: src.bn, file: SOURCE_FILES.bn, dir: "translations/bn-muhiuddin-khan", tanzilId: "bn.bengali",
      id: "bn-muhiuddin-khan", language: "bn", languageName: "Bengali", translator: "Muhiuddin Khan", nameNative: "মুহিউদ্দীন খান",
    },
    {
      text: src.en, file: SOURCE_FILES.en, dir: "translations/en-saheeh-international", tanzilId: "en.sahih",
      id: "en-saheeh-international", language: "en", languageName: "English", translator: "Saheeh International", nameNative: "Saheeh International",
    },
  ];
  for (const t of translations) {
    expectHeader(t.text, t.file, "ID", t.tanzilId);
    expectHeader(t.text, t.file, "Translator", t.translator);
    const updated = headerField(t.text, "Last Update");
    if (!updated) throw new Error(`${t.file}: no "Last Update" header`);
    const version = isoFromTanzilDate(updated);
    const rows = parseVerseLines(t.text);
    const rep = validateAyahs(rows, HAFS_6236, t.id);
    if (!rep.ok) throw new Error(`${t.file} failed validation: ${rep.issues.map((i) => i.message).join("; ")}`);
    const copyright = commentBlock(t.text);
    const provenance = [
      `# Provenance: ${t.id}`,
      "",
      `- Source: Tanzil Project translations (https://tanzil.net/trans/), id \`${t.tanzilId}\`, last update ${updated}.`,
      `- Source file: data/${SOURCE_DIR}/${t.file} (sha256 ${sumsOf[t.file]}), kept byte for byte with its header.`,
      "- `ayahs.json` has exactly one row per source row, text unchanged.",
      "- Licence: Tanzil publishes its translations for non-commercial use; use beyond that needs the translator's or publisher's permission.",
      "  `redistributionPermitted: true` in manifest.json is the project owner's decision on that basis: see docs/licensing/INVENTORY.md.",
      "",
      "`npm run import:tanzil` regenerates every file here; `scripts/import-tanzil/import.test.ts` fails if any of them differs.",
      "",
    ].join("\n");
    const files: Record<string, string> = { "ayahs.json": jsonRows(rows), "COPYRIGHT-TANZIL.txt": copyright, "PROVENANCE.md": provenance };
    for (const [name, content] of Object.entries(files)) out.set(`${t.dir}/${name}`, content);
    out.set(`${t.dir}/manifest.json`, pretty(manifest({
      id: t.id, kind: "translation", version, language: t.language, languageName: t.languageName, direction: "ltr", translator: t.translator,
      source: { name: `Tanzil Project: Quran translations, ${t.tanzilId}`, url: "https://tanzil.net/trans/" },
      license: { name: "Tanzil translation terms: non-commercial use; otherwise permission from the translator or publisher is required", url: "https://tanzil.net/trans/" },
      copyright: `${t.translator} (translator); text as compiled by the Tanzil Project. Rights remain with the translator and publisher.`,
      attribution: `${t.languageName} translation by ${t.nameNative}, via the Tanzil Project, https://tanzil.net/trans/ (last update ${updated})`,
    }, hashes(files))));
  }

  return { files: out, report: { ayahs: ayahs.length, stripped, variants } };
}

function hashes(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([n, c]) => [n, sha256(c)]));
}
