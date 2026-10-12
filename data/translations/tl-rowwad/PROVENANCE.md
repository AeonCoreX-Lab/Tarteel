# Provenance: tl-rowwad

- Source: QuranEnc.com, "Filipino Translation (Tagalog) - Rowwad Translation Center", key `tagalog_rwwad`, version 1.1.4, last update 2025-02-05.
- Page and terms: https://quranenc.com/en/browse/tagalog_rwwad
- Source file: data/sources/quranenc/tagalog_rwwad.csv (sha256 22e27b30d94826f9d826a08c8327751a403d80bd5615fa9ef86a98ee5ad25647), the CSV download kept byte for byte with its info block.
- `ayahs.json` has exactly one row per source row, text unchanged (including the [n] footnote markers inside it).
- `footnotes.json` has the footnotes of the ayahs that have any, unchanged, one row per such ayah. The reader does not show them yet.
- `QURANENC-INFO.txt` is the info block from the top of the CSV, as QuranEnc asks it to be kept.
- Updates: https://quranenc.com/check/tagalog_rwwad/v1.1.4-csv.1

## Terms (QuranEnc "Terms and Policies", read 2026-10-12; redistributionPermitted: true is the project owner's decision on that basis, see docs/licensing/INVENTORY.md)

1. No modification, addition or deletion of the content.
2. Refer clearly to the publisher and the source (QuranEnc.com): Settings -> Sources shows the attribution from manifest.json.
3. Mention the version number when re-publishing: it is in manifest.json (`version`) and in the attribution.
4. Keep the transcript (info) information inside the document: QURANENC-INFO.txt and the untouched CSV in data/sources/quranenc.
5. Tell QuranEnc.com about any note on the translation.
6. Update to the latest version issued by QuranEnc.com (see the update link above).
7. No inappropriate advertisements next to the translation: the app has no ads.

`npm run import:quranenc` regenerates every file here; `scripts/import-quranenc/import.test.ts` fails if any of them differs.
