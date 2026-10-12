# Phase 2 alerts: proof of concept test plan

Build: GitHub Actions -> **Android PoC build (no Quran data)** -> download the APK artifact -> install. The app has no Quran
text in this build (the Quran tab says so). Open **Today -> Alerts (test)**.

## Before testing
1. Setup: allow location (or enter coordinates). Tap **Allow** for Notifications, and open **Exact alarms** and **Full-screen alerts** and turn them on.
2. Note your phone model and Android version (OEMs differ a lot).

## Tests (write down pass/fail and anything odd)
| # | Test | Pass if |
|---|---|---|
| 1 | Test alert **in 10 seconds**, app open | Alert appears; full-screen screen shows if the phone is locked, heads-up if unlocked |
| 2 | Test alert **in 60 seconds**: swipe the app away from recents, lock the phone, put it down | Fires on time (+-5 s), screen turns on, sound plays |
| 3 | Same with **Alarm-clock mode** on | Fires on time; note whether an alarm icon appears in the status bar |
| 4 | Test alert in 60 s, then **restart the phone** before it fires (use a 5-minute wait by scheduling twice) | Still fires after reboot, or note what happens |
| 5 | **Snooze** on the full-screen alert | A new alert arrives after the chosen minutes |
| 6 | **Stop** on the full-screen alert | Alert and sound stop |
| 7 | Turn Full-screen off in system settings, repeat test 2 | Falls back to a normal heads-up notification, no crash |
| 8 | **Schedule prayer alerts** | Status shows planned/created counts; the list shows the next prayers at the right times |
| 9 | Phone with battery saver on / (Xiaomi, Infinix, Tecno, Samsung): repeat test 2 | Note whether it needs the **Background / autostart settings** change to work |

## What to send back
Pass/fail per row, phone model + Android version, and for any failure the exact message shown on the screen.
If the **Actions build itself fails**, send the red step name and the last ~30 lines of its log: that tells us whether notify-kit,
the local library autolinking, or the vendored Kotlin is the problem.

## Decision after the test
- Rows 1-3 pass: keep notify-kit, build the real Phase 2 (settings UI, per-prayer toggles, Bangla strings, own adhan audio).
- Rows 1-3 fail with notify-kit but pass with plain `expo-notifications`: switch the adapter (the planner stays).
- Row 4 fails: investigate boot re-arming; do not ship alerts without it.
