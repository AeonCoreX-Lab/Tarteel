# Adding datasets

No Quran or translation data is committed by AI. You choose a trusted source, verify its license and numbering,
then place it here. Exactly one Quran dataset in `data/quran/`, any number of translations in `data/translations/`.

```
data/quran/<id>/
  manifest.json     provenance + license + sha256 of every file below
  ayahs.json        [{ "surah": 1, "ayah": 1, "text": "..." }, ...]   in order, 6,236 rows for hafs-6236
  surahs.json       [{ "id": 1, "name_ar": "...", "name_translit": "...", "name_en": "...", "revelation": "makkah" }, ...]
  ayah_meta.json    optional [{ "surah": 1, "ayah": 1, "juz": 1, "hizb_quarter": 1, "page": 1, "sajdah": "recommended" }, ...]
data/translations/<id>/
  manifest.json, ayahs.json   same shape; manifest needs "translator" and "redistributionPermitted": true
```

`manifest.json` fields: `id, kind, version, language, languageName, direction, translator (translations), source{name,url},
license{name,spdx?,url?}, copyright, attribution, numberingConvention ("hafs-6236"), redistributionPermitted,
importedAt, files{ "<file>": "<lowercase sha256>" }`.

Generate hashes with `sha256sum ayahs.json`. Any later change to a file fails validation until the manifest is
deliberately updated, which makes silent text changes impossible.

## Checklist before committing a dataset
- [ ] Source and exact version recorded; verse numbering matches `hafs-6236` (validation enforces the counts)
- [ ] License read by a human; redistribution inside an app is permitted; attribution text copied exactly
- [ ] Entry added to `docs/licensing/INVENTORY.md`
- [ ] `npm run validate:quran && npm run validate:translations && npm run build:db` pass

## What is committed now: Tanzil
Quran text (Uthmani v1.1), Bengali (Muhiuddin Khan) and English (Saheeh International) come from https://tanzil.net.
The four downloads are kept untouched in `data/sources/tanzil/` (hashes in `SHA256SUMS`); everything under
`data/quran/tanzil-uthmani/` and `data/translations/*/` is generated from them by:

```
npm run import:tanzil
npm run validate:quran && npm run validate:translations && npm run build:db
```

Do not edit the generated files by hand: `scripts/import-tanzil/import.test.ts` fails if they differ from what the importer
produces. Each dataset folder has a `PROVENANCE.md` (what was done, download options used) and `COPYRIGHT-TANZIL.txt`
(the copyright block Tanzil asks to keep with every derived file).

Download options used for the Quran text: Uthmani, "Text (with aya numbers)", pause marks ON, sajdah signs OFF,
rub-el-hizb signs OFF, tatweel below superscript alefs ON, sequential tanweens OFF. Metadata: `quran-data.xml` (Tanzil Quran
Metadata). Translations: "Text (with aya numbers)".

The only change to the Quran text is removing the Bismillah that Tanzil prepends to ayah 1 of surahs 2-114 (except 9), so verse
numbering matches `hafs-6236`. Changing the downloads (other text type or options) means re-running the import and re-reading
the importer's checks: it refuses to guess when a file does not look as expected.

## Also committed: QuranEnc (Filipino / Tagalog)
`data/translations/tl-rowwad/` (Rowwad Translation Center, via https://quranenc.com/en/browse/tagalog_rwwad) is generated the same way
from the untouched CSV download in `data/sources/quranenc/` (hash in `SHA256SUMS`):

```
npm run import:quranenc
npm run validate:translations && npm run build:db
```

QuranEnc's terms allow re-publishing only without modification, naming QuranEnc.com and the version, and keeping the info block
(`QURANENC-INFO.txt`). So `ayahs.json` is the text verbatim, including the `[n]` footnote markers inside it, and the footnotes
they point at are kept in `footnotes.json`. To update: download the CSV again from the translation page ("CSV" button), replace
`data/sources/quranenc/tagalog_rwwad.csv` without opening or editing it, and re-run the commands above. Do not edit the generated
files by hand: `scripts/import-quranenc/import.test.ts` fails if they differ from what the importer produces.
