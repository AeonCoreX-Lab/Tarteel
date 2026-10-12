import { createHash } from "node:crypto";
import { HAFS_6236, validateAyahs } from "@tarteel/quran-data";
import type { AyahRecord, DatasetManifest } from "@tarteel/types";
import { footnoteLabels, parseQuranEncCsv, textMarkers } from "./parse.ts";

// Deterministic: the same QuranEnc CSV always produces byte-identical datasets, so scripts/import-quranenc/import.test.ts
// can prove that nothing under data/translations/tl-rowwad was edited by hand.
//
// QuranEnc's terms (https://quranenc.com/en/browse/tagalog_rwwad, "Terms and Policies") allow re-publishing the download if
// the content is not modified, added to or deleted from, the source (QuranEnc.com) and the version number are named, and the
// translation info block is kept. So: the text is copied verbatim, the footnotes it refers to are kept in footnotes.json,
// and the info block is kept in QURANENC-INFO.txt.

export const IMPORTED_AT = "2026-10-12";
export const SOURCE_DIR = "sources/quranenc";
export const SOURCE_FILE = "tagalog_rwwad.csv";
export const DATASET_ID = "tl-rowwad";
export const DATASET_DIR = `translations/${DATASET_ID}`;

export interface BuildReport { ayahs: number; withFootnotes: number; version: string; updatedAt: string; markerMismatches: string[] }
export interface Built {
  /** path relative to data/ -> file content (UTF-8) */
  files: Map<string, string>;
  report: BuildReport;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const jsonRows = (rows: readonly object[]): string => "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
const pretty = (o: unknown): string => JSON.stringify(o, null, 2) + "\n";

function hashes(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([n, c]) => [n, sha256(c)]));
}

export function buildAll(csv: string): Built {
  const { info, rows } = parseQuranEncCsv(csv);
  if (info.id !== "tagalog_rwwad") throw new Error(`${SOURCE_FILE}: header says translation "${info.id}", expected "tagalog_rwwad": wrong file?`);

  const ayahs: AyahRecord[] = rows.map((r) => ({ surah: r.surah, ayah: r.ayah, text: r.text }));
  const report = validateAyahs(ayahs, HAFS_6236, DATASET_ID);
  if (!report.ok) throw new Error(`${SOURCE_FILE} failed validation: ${report.issues.map((i) => i.message).join("; ")}`);

  const footnotes: AyahRecord[] = rows.filter((r) => r.footnotes !== "").map((r) => ({ surah: r.surah, ayah: r.ayah, text: r.footnotes }));
  // Every "[n]" in a verse points at a footnote of the same ayah. A difference is reported, not "fixed".
  const markerMismatches = rows
    .filter((r) => textMarkers(r.text).sort().join() !== footnoteLabels(r.footnotes).sort().join())
    .map((r) => `${r.surah}:${r.ayah}`);

  const sourceSum = sha256(csv);
  const infoText = info.lines.join("\n") + "\n";
  const provenance = [
    `# Provenance: ${DATASET_ID}`,
    "",
    `- Source: QuranEnc.com, "Filipino Translation (Tagalog) - Rowwad Translation Center", key \`${info.id}\`, version ${info.version}, last update ${info.updatedAt}.`,
    `- Page and terms: ${info.url}`,
    `- Source file: data/${SOURCE_DIR}/${SOURCE_FILE} (sha256 ${sourceSum}), the CSV download kept byte for byte with its info block.`,
    "- `ayahs.json` has exactly one row per source row, text unchanged (including the [n] footnote markers inside it).",
    "- `footnotes.json` has the footnotes of the ayahs that have any, unchanged, one row per such ayah. The reader does not show them yet.",
    "- `QURANENC-INFO.txt` is the info block from the top of the CSV, as QuranEnc asks it to be kept.",
    `- Updates: ${info.checkUrl}`,
    "",
    "## Terms (QuranEnc \"Terms and Policies\", read 2026-10-12; redistributionPermitted: true is the project owner's decision on that basis, see docs/licensing/INVENTORY.md)",
    "",
    "1. No modification, addition or deletion of the content.",
    "2. Refer clearly to the publisher and the source (QuranEnc.com): Settings -> Sources shows the attribution from manifest.json.",
    "3. Mention the version number when re-publishing: it is in manifest.json (`version`) and in the attribution.",
    "4. Keep the transcript (info) information inside the document: QURANENC-INFO.txt and the untouched CSV in data/sources/quranenc.",
    "5. Tell QuranEnc.com about any note on the translation.",
    "6. Update to the latest version issued by QuranEnc.com (see the update link above).",
    "7. No inappropriate advertisements next to the translation: the app has no ads.",
    "",
    "`npm run import:quranenc` regenerates every file here; `scripts/import-quranenc/import.test.ts` fails if any of them differs.",
    "",
  ].join("\n");

  const files: Record<string, string> = {
    "ayahs.json": jsonRows(ayahs),
    "footnotes.json": jsonRows(footnotes),
    "QURANENC-INFO.txt": infoText,
    "PROVENANCE.md": provenance,
  };
  const out = new Map<string, string>();
  out.set(`${SOURCE_DIR}/SHA256SUMS`, `${sourceSum}  ${SOURCE_FILE}\n`);
  for (const [name, content] of Object.entries(files)) out.set(`${DATASET_DIR}/${name}`, content);

  const manifest: DatasetManifest = {
    id: DATASET_ID, kind: "translation", version: info.version, language: "tl", languageName: "Filipino (Tagalog)", direction: "ltr",
    translator: "Rowwad Translation Center",
    source: { name: `QuranEnc.com: Filipino Translation (Tagalog), Rowwad Translation Center (${info.id})`, url: info.url },
    license: { name: "QuranEnc terms: may be downloaded and re-published unmodified, naming QuranEnc.com and the version (see PROVENANCE.md)", url: info.url },
    copyright: "Rowwad Translation Center (translation); published by QuranEnc.com. Rights remain with the translator and publisher.",
    attribution: `Filipino (Tagalog) translation by Rowwad Translation Center, via QuranEnc.com, ${info.url} (version ${info.version}, last update ${info.updatedAt})`,
    numberingConvention: HAFS_6236.id, redistributionPermitted: true, importedAt: IMPORTED_AT, files: hashes(files),
  };
  out.set(`${DATASET_DIR}/manifest.json`, pretty(manifest));

  return { files: out, report: { ayahs: ayahs.length, withFootnotes: footnotes.length, version: info.version, updatedAt: info.updatedAt, markerMismatches } };
}
