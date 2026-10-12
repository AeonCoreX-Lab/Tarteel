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

## Upstream code (third_party/)
- Files under `third_party/*/src` are PRISTINE copies of upstream. Never edit them by hand: `npm run upstream:verify`
  (and CI) fails on any difference. Need a change? Wrap the module in `packages/*` (or send it upstream).
- Update only through `npm run upstream:sync -- --from <upstream checkout>`; review the diff and the licence check it prints.
- Never copy Mihrab's name, icon, `branding/`, store text or screenshots. Tarteel has its own identity.
- Do not trust upstream's content-licence claims (translations, tafsir, fonts, audio); verify each ourselves.
- Native Android code lives in `native/tarteel-android` (our glue) and `third_party/mihrab-android/files/**` (vendored Kotlin, pristine).
  Never edit the vendored Kotlin. Check any vendored file for Mihrab branding (names, icons, strings) before adding it:
  `PrayerSilence.kt` was left out because it hard-codes the user-visible Do-Not-Disturb rule name "Mihrab · prayer".

## Brand
- Official logo files are in `brand/source/` and must not be edited, redrawn or recoloured. Regenerate derived assets with
  `python3 scripts/brand/build_assets.py` and commit the result. Colours/usage: `docs/design/BRAND.md`.
- Use theme tokens from `apps/mobile/src/theme.ts`. Gold/green as TEXT must use `brassText` / `accentText` (contrast).
