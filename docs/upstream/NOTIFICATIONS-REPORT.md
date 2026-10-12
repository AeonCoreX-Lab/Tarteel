# Adhan / notifications: what Mihrab has and what we can reuse

Study of the Mihrab snapshot, then the Phase 2 proof of concept built from it (see section 7). Numbers are real line counts.

## 1. How Mihrab does it (Android)
Three layers:

| Layer | What | Size |
|---|---|---|
| JS scheduling | `src/notifications/*`: builds the notification list for the coming days, ids, snooze, mute, safety controls, reminders for dua/dhikr/fasting/khatmah/ayah-of-day | ~7k lines (adhan core ~3k) |
| Library | **`@notifee/react-native`**: timestamp trigger notifications with `AlarmManager` exact alarms, channels, categories (19 imports, 20 distinct API calls) | external |
| Kotlin | classic-bridge modules + services + receivers + one full-screen activity, registered by hand in `MainApplication` | ~85 files in total; adhan core ≈ 1.5k lines |

Adhan-core Kotlin: `PrayerAlarmActivity` (384, full-screen alert), `CustomAdhanModule` (442, own adhan sound/picker),
`PrayerSilence` + module + receiver (~450, Do-Not-Disturb during prayer), `FullScreenAlarmModule` (73), two headless
services (28 each, run JS when an action is tapped), `MihrabRestartReceiver` (79, re-arm after boot).
iOS uses a separate native `PrayerAlarms` module (AlarmKit); Android ignores it.

Android permissions the adhan core needs: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`,
`ACCESS_NOTIFICATION_POLICY`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` (+ `SPECIAL_USE`). Store policy on exact alarms
and full-screen intents is strict: check Google Play's current rules before choosing a distribution channel.

## 2. Findings that change the plan
1. **Notifee is archived.** Invertase archived it on 2026-04-07 (last release 9.1.8, Dec 2024). Its README points to
   `expo-notifications` or the community fork **`react-native-notify-kit`**, which claims a drop-in API, New Architecture
   support, RN >= 0.73 and Expo CNG development builds. Mihrab itself still depends on the archived package, so it carries this risk too.
   Both facts are the fork authors' claims; we must verify them on a device.
2. **`prayerNotifications.ts` cannot be vendored.** Its runtime import closure is **128 files** (dhikr, fasting, journal,
   practice, khatmah, widgets, all 13 locale files, Quran data...). It is Mihrab's integration hub, not a library.
   `scheduling.ts` (117 lines: exact-alarm trigger builder, id scheme, minute clamps) *is* self-contained, one file, only notifee + React Native.
3. **Kotlin porting is cheaper than expected.** In the adhan-core files the only app-level coupling is one line:
   `PrayerSilence.kt` references `MainActivity`. Resource use is a single drawable (`ic_stat_prayer`). No `BuildConfig`.
4. **The package name does not have to change.** A library's Kotlin namespace is independent of the app's applicationId,
   so the Kotlin can stay byte-identical (`com.prayer_times`) inside a local library: pristine, hash-locked, same as `third_party/mihrab/src`.
5. **Expo regenerates `MainApplication`**, so we must not patch it. A local React Native library is autolinked instead,
   and its `AndroidManifest.xml` (activities, services, receivers, permissions) merges into the app automatically.
6. **Headless tasks need a JS entry.** Mihrab registers `PrayerAlarmAction` and `AdhanMuteToggle` in `index.js`. Tarteel uses
   `expo-router/entry`, so it needs a tiny custom entry that imports it and then registers the tasks.
7. **The 17 bundled adhan recordings (3.2 MB, `res/raw/adhan_*.mp3`) have no licence or attribution anywhere in the
   repository** (searched README, NOTICE, docs, changelog). We cannot verify them, so **we do not copy them.**

## 3. Verdicts
| Piece | Verdict |
|---|---|
| `scheduling.ts` | Vendor (pristine), once the notification library question is settled |
| `prayerNotifications.ts`, `adhanMute.ts`, `endOfDayLog`, reminders | **Ideas only**: write Tarteel's own scheduler on a small interface; port reminder types one by one in later phases |
| Kotlin adhan core (alarm activity, silence/DND, full-screen check, headless services, boot receiver) | **Vendor into a local library**, plus a small shim `MainActivity` that opens the app's real launcher activity |
| `CustomAdhanModule` | Vendor later (custom adhan picker); needs a SAF/file-picker review |
| Adhan audio files | **Do not reuse.** Source recordings with a verified licence; log in `docs/licensing/INVENTORY.md` |
| Live activity / widgets | Separate phase |
| iOS `PrayerAlarms` | Out of scope (Android first) |

## 4. Proposed Phase 2 shape (for approval)
- `packages/prayer` gets a pure **alert planner**: given the day's times, offsets and user settings, returns the list of
  alerts (id, time, kind, sound) for the next N days. Unit-tested without any native code. This is the part Mihrab does not isolate.
- `apps/mobile/src/platform/alerts.ts`: thin adapter from planner output to the notification library (notify-kit first,
  `expo-notifications` as the fallback behind the same interface).
- `native/tarteel-android/` (local RN library): vendored Kotlin + merged manifest + shim. Locked by `UPSTREAM.lock.json`.
- Custom entry file to register headless tasks.
- Setup flow gets a notifications step; Settings gets exact-alarm, full-screen and DND status rows with the system-settings shortcuts.

## 5. One-week proof of concept (success criteria)
1. GitHub Actions builds an APK with the local library autolinked (no manual `MainApplication` edit).
2. A test alert fires on a real Android device at an exact time with the screen off and the app swiped away.
3. It survives a reboot.
4. Full-screen alert shows on a locked device where the permission is granted, and degrades to a heads-up where it is not.
5. DND toggle works and restores the previous state.
6. If (1)-(3) fail with notify-kit, repeat with `expo-notifications` before touching Kotlin further.

## 6. Risks
- Single-maintainer fork dependency (notify-kit) vs. Expo's own library with fewer alarm features.
- Android 14+ revokes/limits full-screen intents and exact alarms: UX must handle "off" gracefully.
- Vendor-locked Kotlin compiled against Mihrab's SDK levels (compileSdk 37, Kotlin 2.2, New Architecture on): our Expo SDK 57 toolchain must be compatible.
- Play Store declarations for exact alarms / full-screen intents.

## 7. Proof of concept as built (Android only, not yet run on a device)
Decisions that differ from the proposal above, and why:
- **Notification library: `react-native-notify-kit` ^10.4.0**, imported directly (no `@notifee/react-native` alias: an npm alias could
  confuse native autolinking, and the only file it would have saved, `scheduling.ts`, is 117 lines). Its README documents:
  `AlarmType.SET_ALARM_CLOCK`, exact-alarm fallback, reboot re-arming, OEM autostart helpers, New Architecture only, Expo CNG dev builds.
  It does NOT add `USE_FULL_SCREEN_INTENT` or `USE_EXACT_ALARM`: our library manifest adds the permissions.
- **Vendored Kotlin = 3 files** (`PrayerAlarmActivity`, `FullScreenAlarmModule`+package, `PrayerAlarmHeadlessService`; ~485 lines) in `third_party/mihrab-android`.
  Left out on purpose: `PrayerSilence*` (DND) because it hard-codes the user-visible rule name "Mihrab · prayer";
  `CustomAdhanModule` (needs a FileProvider/picker review); `MihrabRestartReceiver` (it only restarts Mihrab widgets and live activity: notify-kit re-arms alarms after reboot itself).
- **`ic_stat_prayer.xml` is Mihrab's logo glyph** (derived from its launcher icon), so it is *not* vendored: Tarteel supplies a generic Material crescent.
- The full-screen screen's **layout is Mihrab's**; only colours and labels come from Tarteel (`fsSky*`, `fs*` data keys). Re-skinning it needs our own activity later.
- Vendored code stays in package `com.prayer_times`; the library namespace is the same, so `R.drawable.ic_stat_prayer` resolves to our drawable.
- `packages/prayer` now has the pure alert planner (`planAlerts`, `diffAlerts`) with tests; the platform adapter is `apps/mobile/src/platform/alerts.ts`.
- `android-poc.yml` builds an installable APK **without a Quran dataset** (`build:db -- --empty`).
Test plan and success criteria: `docs/roadmap/ALERTS-POC-TEST-PLAN.md`.
