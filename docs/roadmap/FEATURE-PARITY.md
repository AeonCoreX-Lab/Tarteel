# Mihrab feature parity plan

Goal: every Mihrab feature exists in Tarteel, with Tarteel's own design and identity, built on Tarteel's architecture
(Expo, SQLite `content.db`/`user.db`, MMKV, offline-first). Sizes below are real line counts of the Mihrab snapshot
(non-test TypeScript) and show where the effort is. "Reuse" = vendor logic through `upstream.config.json` (AGPL; the vendored files are now Tarteel-maintained);
UI is always written fresh in Tarteel's design system.

| # | Feature area (Mihrab module) | LOC | Tarteel approach | Native work |
|---|---|---|---|---|
| 1 | **Prayer times** (`providers`, `prayer`, `utils/prayerTimes`) | 6k | Vendored (done) behind a `packages/prayer` wrapper | none |
| 2 | **Today / Home** (`screens/home`: hero, prayer rows, status band, location, qibla chip, Ramadan countdown) | ~10k | New UI, Mihrab layout as reference | none |
| 3 | Location + geocoding (`geocoding`, `hooks`) | 1.5k | `expo-location`; city search is the only online call and is opt-in | none |
| 4 | Month times, share month (`MonthTimes`, `ShareMonth`, `share`) | 3k | New UI; image export via view-shot | none |
| 5 | **Hijri calendar + events** (`hijri`) | 0.6k | Wrapper fixes upstream day-repeat defect; user day offset | none |
| 6 | **Qibla / compass** (`CompassScreen`, `native/Compass*`) | 2k | `expo-sensors` first; port Kotlin module only if needed | maybe |
| 7 | **Adhan alerts** (`notifications` 5.4k, `native/PrayerAlarms`, `CustomAdhan`, `FullScreenAlarm`, `PrayerSilence`) | 7k + Kotlin | Notification scheduling logic vendored; Android alarm/full-screen/DND via Kotlin copied in by an Expo config plugin | **yes (largest risk)** |
| 8 | **Quran reader** (`quran` 35k, `QuranScreen`, `QuranSurahScreen`) | 40k | Tarteel text reader exists; add mushaf pages, riwayat, word-by-word, tajweed in stages | mushaf line view (Kotlin) |
| 9 | Quran audio (`quran/audio` 5k, `WordPlayer`, track-player) | 5k | **Built (own implementation, `packages/audio`):** per-ayah download manager, rolling queue, Listen page, MiniPlayer, reciter picker. Reader follows the recitation (ayah highlight, auto-scroll, word highlight when timings exist). Two reciters (Alafasy, Husary, Islamic Network CDN) are enabled since 2026-10-26, after the host's written reply on its forum; file URLs still to be tested on a device; no timing source chosen yet; tap-a-word-to-hear not built. See [docs/audio](../audio/README.md) | none |
| 10 | Khatmah, resume doors, downloads (`QuranDownloads`, `Khatmah*`) | 3k | New UI; progress in `user.db` | none |
| 11 | **Prayer log, practice, journal, fasting** (`journal`, `practice`, `fasting`, `LogScreen`) | 6k | Logic vendored where pure; storage on `user.db` | none |
| 12 | Tasbih + dhikr + duas (`tasbih`, `dhikr`, `duas`, `TasbihScreen`) | 3k | **Tasbih: done, Tarteel's own implementation** (`packages/core/src/tasbih.ts`, `app/tasbih.tsx`; it does not use Mihrab's tasbih code). Dhikr reminders and duas: not started; **dua content licence verified before shipping** | none |
| 13 | **Widgets** (`widget` 4k + 9 Glance Kotlin files) | 4k + Kotlin | Kotlin copied via config plugin; payload contract vendored | **yes** |
| 14 | Live activity / ongoing notification (`liveActivity`, Kotlin service) | 0.6k + Kotlin | Android only first | **yes** |
| 15 | **Encrypted sync + backup** (`sync` 5k, `backup`, QR scan) | 5.4k | Vendored crypto/format; stays opt-in, off by default | QR scanner |
| 16 | Onboarding, settings, theme, i18n (13 languages), polish | 10k | New UI + design system; locale JSON vendored | none |

## Phases (each ends in an installable APK from GitHub Actions)
- **P1 Prayer core (current):** DONE: `packages/prayer`, location, Today screen, method/Asr/Hijri settings. Month times, Qibla compass (with smoothing) and the Setup flow DONE. Brand UI pass DONE across all current screens (waqt arc, tabs with icons, see `docs/design/UI-KIT.md`). School (madhab) picker with per-school Asr times, in Setup and Settings, and Today's chips that open the right block of Settings with a highlight: DONE 2026-10-27 (not yet run on a device; no Subh naming or second times for the Maliki school). TODO: share-month image. Reuse decisions are logged in `docs/upstream/REUSE-REPORT.md`.
- **P2 Alerts:** scheduling + Android native alarm plugin. Do a one-week proof of concept first: the config-plugin
  approach (copy Mihrab's Kotlin into the generated `android/`, rename package) decides how P7/P8 widgets are built.
- **P3 Quran depth:** audio, khatmah, downloads, riwayat, then mushaf pages, then word-by-word and tajweed.
- **P4 Practice:** log, journal, fasting, tasbih, duas.
- **P5 Widgets + ongoing notification.**
- **P6 Sync/backup, share, polish, remaining languages.**

## Conflicts with the Tarteel spec (need a decision; defaults chosen)
1. **Streaks / practice grid / streak widget.** Spec: "avoid streak pressure, leaderboards, manipulative notifications".
   Default: build logging and history, show streaks **only if the user turns them on**, never send streak reminders.
2. **Network use.** Spec: core offline, no tracking. Default: on-device `adhan` calculation (no API), no AlAdhan calls,
   only opt-in city search and optional downloads (audio, riwayat, translations).
3. **"Help Mihrab" chip, donation prompts, Mihrab branding:** not copied.
4. **Content licences.** Mihrab's claims about translations, tafsir, fonts, audio are not trusted; each asset is verified
   and logged in `docs/licensing/INVENTORY.md` before bundling.
5. **Dual database design.** Anything user-generated (log, journal, khatmah, tasbih counts) goes to `user.db` migrations.

## Known upstream defects handled in wrappers
- Hijri tabular conversion repeats/skips a day near year end (canary test in `tests/mihrab-vendored.test.ts`).
- On-device "Automatic" method = MWL except Morocco; Tarteel chooses method/Asr school by country with user override.
