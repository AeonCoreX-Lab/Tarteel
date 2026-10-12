# Provenance: tanzil-uthmani

- Text: Tanzil Project, Quran text, Uthmani, Version 1.1 (https://tanzil.net/download/).
- Source file: data/sources/tanzil/quran-uthmani.txt (sha256 82f33ac6a87df2698fe84a96e1f8a31ba03b6076553ceaf481066f45e9ae4d0e), kept byte for byte with its copyright block.
- Metadata: data/sources/tanzil/quran-data.xml (sha256 8867c1d88191472adec9db694b3cd9f135b1a2ef580574d32cf888dcb22c5c7a) -> surahs.json, ayah_meta.json.
- Download options: Uthmani, "Text (with aya numbers)", pause marks ON, sajdah signs OFF, rub-el-hizb signs OFF, tatweel below superscript alefs ON, sequential tanweens OFF.

## The one change made to the text

`ayahs.json` has exactly one row per source row. Tanzil prepends the Bismillah to the first ayah of every surah except
Al-Fatihah (where it is ayah 1) and At-Tawbah (which has none). Under the `hafs-6236` convention (see
`packages/quran-data/src/numbering.ts`) it is not part of those verses, so the Bismillah and the single space after it
are removed from ayah 1 of 112 surahs (2-114 except 9). No other character of any verse is touched.

In surahs 95 and 97 Tanzil's prefix carries one extra shadda on the first letter; it is removed with the rest of the
prefix and is not carried into the dataset. Any other deviation makes the importer fail instead of guessing.

`npm run import:tanzil` regenerates every file here; `scripts/import-tanzil/import.test.ts` fails if any of them differs.

## Terms (from the Tanzil copyright block, also in COPYRIGHT-TANZIL.txt)

Verbatim copies only, source (Tanzil Project) clearly indicated with a link to tanzil.net, copyright block reproduced in derived files.
