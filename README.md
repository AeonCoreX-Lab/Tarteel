# Tarteel (تَرْتِيل)

Free, open-source, offline-first Quran app for Android and Web.
No ads, no mandatory account, no mandatory internet, no tracking.

> Status (2026-10): **Quran reader, prayer times and alerts, qibla, tasbih, recitation, and the history and sources screens are built;
> most of them have not yet been run on a device** (see [device checklist](docs/testing/KNOWLEDGE-DEVICE-CHECKLIST.md)).
> The Quran text (Tanzil Uthmani 1.1) and seven translations are committed under `data/` with hash-checked manifests and
> are built into `content.db` at release time. Nothing was typed or edited by AI: the files are the publisher's own.

## What the app does

| Area | State |
|---|---|
| Quran reading, search, bookmarks, notes, last-read | Built, offline. Bengali, English, French, Indonesian, Russian, Chinese and Filipino translations |
| Prayer times, Hijri calendar, qibla, adhan alerts | Built, offline (on-device calculation); alerts need a device test |
| Tasbih counter | Built, offline, Tarteel's own code |
| Recitation (Listen page, reader follows the recitation) | Built. Two reciters, Mishary Alafasy and Mahmoud Khalil Al-Husary, from the Islamic Network CDN, with the host's written confirmation (see [docs/audio](docs/audio/README.md)). Downloads are opt-in; streaming is off by default |
| History, Library, Timeline (signed offline packs) | Built; the shipped packs are small, content is still being cleared and reviewed |
| Online sources: HadeethEnc, Wikipedia, QuranEnc tafsir, Quranpedia classical tafsir | Live, opt-in (all off by default), nothing stored, each credited. See [ONLINE-SOURCES](docs/architecture/ONLINE-SOURCES.md) |
| Sunnah.com (and anything that is its data) | **Off** until Sunnah.com agrees in writing |

The app has a brand header (`AppBar`) on the main tabs, a splash that is held long enough to read, and a first-run setup flow.
The core reading flow makes no network request; every network use is listed in [docs/privacy](docs/privacy/README.md).

## Architecture in one picture

```
UI (Expo Router)  ->  Zustand (UI state)  ->  repositories  ->  storage abstraction
                                                                   |-- SQLite  content.db  (Quran, translations, FTS5)  read-only, shipped
                                                                   |-- SQLite  user.db     (bookmarks, notes, history)  private, migrated
                                                                   |-- MMKV                (theme, fonts, last-read pointer)
                                                                   `-- Filesystem          (audio, fonts, large assets)
```

`SQLite = structured data` · `MMKV = small preferences` · `Filesystem = large binaries`.
Details and the reasons for two SQLite files: [docs/architecture](docs/architecture/README.md).

Historical knowledge (optional, signed offline packs): [docs/architecture/KNOWLEDGE.md](docs/architecture/KNOWLEDGE.md) · status against the plan: [KNOWLEDGE-SPEC-STATUS](docs/roadmap/KNOWLEDGE-SPEC-STATUS.md) · plan for History: [HISTORY-PLAN](docs/roadmap/HISTORY-PLAN.md) · authoring format: [data/knowledge](data/knowledge/README.md) · device tests: [checklist](docs/testing/KNOWLEDGE-DEVICE-CHECKLIST.md)

Online sources: [ONLINE-SOURCES](docs/architecture/ONLINE-SOURCES.md) · hadith: [HADITH](docs/architecture/HADITH.md) · what is enabled, waiting or rejected: [data-sources/RECOMMENDATIONS](docs/data-sources/RECOMMENDATIONS.md) · recitation: [docs/audio](docs/audio/README.md) · privacy: [docs/privacy](docs/privacy/README.md) · licences: [INVENTORY](docs/licensing/INVENTORY.md)

Brand: [BRAND](docs/design/BRAND.md) · UI kit: [UI-KIT](docs/design/UI-KIT.md) · Roadmap: [Mihrab feature parity](docs/roadmap/FEATURE-PARITY.md) · Design: [direction](docs/design/DESIGN-DIRECTION.md)

## Layout

| Path | Purpose |
|---|---|
| `packages/types` | Shared domain types |
| `packages/storage` | `SqlDriver`, `PreferencesStore`, `FileStore` interfaces + memory/web adapters |
| `packages/quran-data` | Numbering convention + dataset/manifest/checksum validation |
| `packages/database` | Migrations, repositories, dataset importer |
| `packages/search` | Arabic/translation normalisation + safe FTS5 query builder |
| `packages/prayer` | Method defaults, Hijri calendar (Umm al-Qura + tabular + offset), next-prayer/countdown logic. Calculator injected |
| `packages/audio` | Recitation: reciter catalogue, per-ayah download manager, playback queue/controller. Pure TS, ports injected. Reciter catalogue: `apps/mobile/assets/audio/reciters.json` |
| `packages/core` | Preference schema, last-read logic, go-to parsing, tasbih, the online-source clients (HadeethEnc, Wikipedia, QuranEnc, Quranpedia, Hadith) and the provider registry |
| `apps/mobile` | Expo / React Native app (Android first) |
| `scripts/` | `validate-quran`, `validate-translations`, `validate-audio`, `validate-knowledge`, `build-database`, `build-pack`, importers (`import-tanzil`, `import-quranenc`, `import-quranpedia`, `import-wikidata`), `upstream` (verify/status/diff) |
| `data/` | Committed datasets: `quran/`, `translations/`, `knowledge/` (pack sources), `sources/` (raw publisher files). Each has a manifest with sha256 hashes |
| `native/tarteel-android` | Local Android library: autolinked glue for the vendored Kotlin full-screen alert |
| `third_party/mihrab-android` | Kotlin that came from Mihrab (full-screen alert); maintained by Tarteel, changes in `CHANGES.md` |
| `third_party/mihrab` | code that came from Mihrab (AGPL), maintained by Tarteel, changes in `CHANGES.md` — see [docs/upstream](docs/upstream/README.md) |

## Build (everything runs in GitHub Actions; nothing is built on the phone)
1. **Push the repository.** The *Bootstrap dependencies* workflow starts by itself: with no `package-lock.json` yet it installs
   Expo-matched versions and **commits the lockfile back to your branch** (`[skip ci]`, no loop). Later pushes that change a
   `package.json` refresh the lockfile the same way. Every other workflow then installs with `npm ci` from that lockfile.
   If your branch is protected and the push is refused, the lockfile is attached to the run as an artifact: commit it yourself.
2. Actions -> **Android build** (`android.yml`) -> Run workflow -> download the APK artifact. It runs the quality gates, builds `content.db` from the committed
   datasets and signs with your release key if the secrets exist (otherwise the debug key: fine for testing). **Android PoC build (no Quran data)** is a
   lighter build for the alerts proof of concept only; it has no Quran text. Both call the bootstrap step first if the lockfile is missing.
3. To re-align all dependencies with the Expo SDK later: Actions -> *Bootstrap dependencies* -> Run workflow.

## Develop (optional, e.g. from Termux)

```sh
sh scripts/bootstrap-mobile.sh     # once: installs deps with SDK-matched versions, commit the lockfile
npm run check                      # typecheck, lint, tests, data validation
npm run validate:quran             # strict: fails without a valid dataset
npm run validate:audio             # reciter catalogue: https only, enabled needs a recorded licence check
npm run build:db                   # builds apps/mobile/assets/db/quran.db
```

Tests use Node's built-in runner and SQLite (Node >= 22.18). Android APKs are built by
`.github/workflows/android.yml` (manual dispatch or `v*` tag).

## Licensing

Source code: **AGPL-3.0-or-later** (see `LICENSE` and `NOTICE`). It includes code derived from
[Mihrab](https://github.com/MihrabHQ/Mihrab) (AGPL-3.0-or-later, (C) Hassan El Ghamri) under `third_party/mihrab/`.
Tarteel is an independent app: it does not use Mihrab's name, icon or store assets. **Content is licensed separately**: every Quran text, translation, font and audio
asset has its own entry in [docs/licensing](docs/licensing/INVENTORY.md). Never add an asset without one.
