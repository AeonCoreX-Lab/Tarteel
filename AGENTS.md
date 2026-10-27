# Tarteel — rules for AI assistants and contributors

These are hard rules. They come from the project spec.

## Religious content
- NEVER generate, edit, "fix", paraphrase or normalise Quran text. NEVER invent translations, rulings, sources or licenses.
- Quran/translation data enters ONLY through `data/<kind>/<id>/` with a complete `manifest.json` + sha256 hashes,
  and must pass `npm run validate:quran` / `validate:translations`.
- Test fixtures must use clearly synthetic placeholder text, never real verses.
- Arabic normalisation (`packages/search`) is for the derived search column only; displayed text is never modified.

## Architecture
- SQLite = structured data. MMKV = small preferences/pointers. Filesystem = large binaries. Do not cross these.
- UI never touches SQL or platform storage: go through `repositories` and `@tarteel/storage` interfaces.
- `content.db` is read-only and replaceable; `user.db` is private and only ever migrated (never recreated, never destroyed).
- Platform adapters live in `apps/*`. `packages/*` must stay free of native/DOM dependencies.
- Core reading, search, bookmarks and notes must work offline with no account. Cloud is optional and later.

## Privacy
- No ads, analytics, trackers or telemetry. No network calls in the core flow. Notes and history stay local.
- Never commit secrets (keystores, B2/Cloudflare keys). Use GitHub Actions secrets.

## Code
- TypeScript strict. Node-runnable packages use explicit `.ts` import extensions and `import type`; no enums or
  constructor parameter properties (Node type-stripping).
- Schema changes = a new numbered migration, never an edit to an applied one. Add a test.
- Every new asset gets an entry in `docs/licensing/INVENTORY.md` in the same PR.

## Historical knowledge (packs, claims, sources)
- NEVER invent a claim, source, citation, locator, quotation, date, hadith grading, asbab report or scholarly agreement. A statement with no
  real source stays a `draft` in `data/knowledge/<pack>/`; the app shows "no report" states, never a guess. Do not write or machine-translate
  religious claims; `machine_draft` text is for human translators to review, never for release.
- Source content enters ONLY through `data/knowledge/<pack-id>/` (format: `data/knowledge/README.md`) and must pass `npm run build:pack` (release validation).
  Production packs contain only `published`, evidence-backed, licence-cleared claims. A licence with `redistribution` other than `yes` ships no quotation.
- Read the real licence and terms of a source before adding it (web pages, LICENSE files), record the result in `docs/licensing/INVENTORY.md`, and
  treat APIs, datasets, translations, scans and annotations as separate rights-bearing materials. Unclear permission = exclude and document.
- Never commit a signing private key (`TARTEEL_PACK_SIGNING_KEY` is a GitHub Actions secret). Only the PUBLIC key is committed.
  `apps/mobile/src/knowledge/config.json` must never hold a test or demo key (`npm run pack:demo` output is for device tests only).
- Synthetic test fixtures must say "Synthetic" and must never look like real history. Do not present them as facts anywhere in the app.

## Audio
- A reciter is offered only with `enabled` and `licenseVerified` true and a `verifiedBy` that says who confirmed what, with the link and the date. The Islamic Network CDN reply (forum thread #310, 2026-10-26) covers per-person downloads from that CDN only: not hosting or bundling files, not another host. Keep downloads polite: few workers, pause on 429/503. Details: `docs/audio/README.md`.

## Upstream code (third_party/)
- Files under `third_party/*` came from Mihrab and are now **Tarteel's own code**: edit them directly. There is no sync from Mihrab.
  Every change must be logged with its date in that folder's `CHANGES.md` (AGPL-3.0 section 5(a)); `npm run upstream:status` lists
  what differs from the takeover baseline. Never delete or edit `UPSTREAM-LICENSES/`. CI runs `npm run upstream:verify` for both.
  See `docs/upstream/README.md`.
- Never copy Mihrab's name, icon, `branding/`, store text or screenshots. Tarteel has its own identity.
- Do not trust upstream's content-licence claims (translations, tafsir, fonts, audio); verify each ourselves.
- Native Android code lives in `native/tarteel-android` (our glue) and `third_party/mihrab-android/files/**` (Kotlin that came from Mihrab, ours to maintain).
  Log changes in its `CHANGES.md`. Check any file for Mihrab branding (names, icons, strings) before adding it:
  `PrayerSilence.kt` was left out because it hard-codes the user-visible Do-Not-Disturb rule name "Mihrab · prayer".

## Brand
- Official logo files are in `brand/source/` and must not be edited, redrawn or recoloured. Regenerate derived assets with
  `python3 scripts/brand/build_assets.py` and commit the result. Colours/usage: `docs/design/BRAND.md`.
- Use theme tokens from `apps/mobile/src/theme.ts`. Gold/green as TEXT must use `brassText` / `accentText` (contrast).
