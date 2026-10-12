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
