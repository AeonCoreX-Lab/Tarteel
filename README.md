# Tarteel (تَرْتِيل)

Free, open-source, offline-first Quran app for Android and Web.
No ads, no mandatory account, no mandatory internet, no tracking.

> Status: **foundation + Quran core**. The app cannot run until a verified Quran dataset is added
> (see [docs/data-sources](docs/data-sources/README.md)). This repository deliberately contains **no Quran text**.

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
| `packages/core` | Preference schema, last-read logic, go-to parsing |
| `apps/mobile` | Expo / React Native app (Android first) |
| `scripts/` | `validate-quran`, `validate-translations`, `build-database`, `upstream` (sync/verify/diff) |
| `native/tarteel-android` | Local Android library: autolinked glue for the vendored Kotlin full-screen alert |
| `third_party/mihrab-android` | pristine, hash-locked Kotlin from Mihrab (full-screen alert) |
| `third_party/mihrab` | pristine, hash-locked subset of Mihrab (AGPL) — see [docs/upstream](docs/upstream/README.md) |

## Build (everything runs in GitHub Actions; nothing is built on the phone)
1. **Push the repository.** The *Bootstrap dependencies* workflow starts by itself: with no `package-lock.json` yet it installs
   Expo-matched versions and **commits the lockfile back to your branch** (`[skip ci]`, no loop). Later pushes that change a
   `package.json` refresh the lockfile the same way. Every other workflow then installs with `npm ci` from that lockfile.
   If your branch is protected and the push is refused, the lockfile is attached to the run as an artifact: commit it yourself.
2. Actions -> **Android PoC build (no Quran data)** -> Run workflow -> download the APK artifact. It calls the bootstrap step first
   if the lockfile is still missing, so it also works on the very first run. (The release build `android.yml` needs a validated Quran dataset.)
3. To re-align all dependencies with the Expo SDK later: Actions -> *Bootstrap dependencies* -> Run workflow.

## Develop (optional, e.g. from Termux)

```sh
sh scripts/bootstrap-mobile.sh     # once: installs deps with SDK-matched versions, commit the lockfile
npm run check                      # typecheck, lint, tests, data validation
npm run validate:quran             # strict: fails without a valid dataset
npm run build:db                   # builds apps/mobile/assets/db/quran.db
```

Tests use Node's built-in runner and SQLite (Node >= 22.18). Android APKs are built by
`.github/workflows/android.yml` (manual dispatch or `v*` tag).

## Licensing

Source code: **AGPL-3.0-or-later** (see `LICENSE` and `NOTICE`). It includes code derived from
[Mihrab](https://github.com/MihrabHQ/Mihrab) (AGPL-3.0-or-later, (C) Hassan El Ghamri) under `third_party/mihrab/`.
Tarteel is an independent app: it does not use Mihrab's name, icon or store assets. **Content is licensed separately**: every Quran text, translation, font and audio
asset has its own entry in [docs/licensing](docs/licensing/INVENTORY.md). Never add an asset without one.
