# Mihrab-derived code (maintained by Tarteel)

Status 2026-10-20: **Tarteel maintains this code itself. There is no sync from Mihrab any more.**

Tarteel took a curated subset of [Mihrab](https://github.com/MihrabHQ/Mihrab) (AGPL-3.0-or-later, Copyright (C) 2026 Hassan El Ghamri)
into `third_party/mihrab/` (prayer times, Hijri calendar; TypeScript) and `third_party/mihrab-android/` (full-screen prayer alarm; Kotlin).
Mihrab changes on its own schedule and its changes kept colliding with ours, so the files are now Tarteel's own to edit, fix and extend.
The folders keep their names and paths on purpose: they are npm workspaces (`third_party/*`) and the Android build points at them, so
moving them would break `npm ci` until the lockfile is regenerated. They can be renamed later in a change that also regenerates the lockfile.

| Where | What |
|---|---|
| `third_party/<name>/src/**`, `data/**`, `files/**` | the code. Edit it directly |
| `third_party/<name>/CHANGES.md` | **the change log. Add a line (with the date) for every change.** AGPL-3.0 section 5(a) requires a notice of what was modified, with a date |
| `third_party/<name>/UPSTREAM-LICENSES/` | Mihrab's LICENSE, NOTICE and TRADEMARK.md. They stay with the code, unmodified |
| `third_party/<name>/UPSTREAM.lock.json` | where the code came from (Mihrab commit, `detached.baselineSha`) and the hashes of the files at takeover (the baseline) |
| `upstream.config.json` | `"detached": true` for both folders |

## Commands
```sh
npm run upstream:verify    # CI runs this: the upstream licence files are unmodified and CHANGES.md exists
npm run upstream:status    # which files differ from the baseline (modified / added / deleted): the list that CHANGES.md must cover
npm run upstream:diff -- --from ../Mihrab   # read-only: what Mihrab changed since our baseline (our own edits do not show)
```
`upstream:sync` is gone, and the CLI refuses to sync a detached folder, because it would overwrite Tarteel's changes. The weekly
"Upstream sync" workflow was removed.

## If Mihrab fixes something we want
Run `upstream:diff`, read the change, and port it by hand into our file. Add a line to `CHANGES.md` saying it was ported from Mihrab
and from which commit. Nothing arrives by itself.

## Rules
1. Keep Mihrab's copyright notice and licence files. The code stays AGPL-3.0-or-later. Do not delete `UPSTREAM-LICENSES/`.
2. Log every change in `CHANGES.md` with the date. Run `npm run upstream:status` before a release to check the log covers every file it lists.
3. Never use Mihrab's name, icon, `branding/`, store text or screenshots (Mihrab's TRADEMARK.md). Check any file you add or port for Mihrab branding in user-visible strings.
4. Keep the AGPL source offer: Settings -> About links to this repo (`extra.sourceUrl`).
5. New Tarteel logic that is not a change to a Mihrab file goes in `packages/*` (for example `packages/prayer`), not in `third_party/`. Fixes to Mihrab's own behaviour go in the file that is wrong.

## Known issues we can now fix in place
These were documented while the files were pristine and worked around outside; now they can be fixed at the source.
- **Hijri conversion defect.** `hijri/convert.ts` is a tabular calendar that repeats or skips a day near the end of Dhu al-Hijjah (for example 1446-12-27 on two consecutive days, 2025-06-23/24; 8 glitches in 2020-2031). The test `CANARY known upstream issue` in `tests/mihrab-vendored.test.ts` documents it and will fail when it is fixed: when that happens, turn the canary into a normal test. The calendar also differs by up to a day from Umm al-Qura and from local moon sighting, so a user-adjustable day offset is still required.
- **"Automatic" calculation method.** The auto method special-cases only Morocco and otherwise returns Muslim World League. For Bangladesh the app chooses the method and Asr school itself (expected: Karachi with Hanafi Asr, to be checked against the Islamic Foundation Bangladesh timetable).
- `PrayerSilence.kt` was left out because it hard-codes the user-visible rule name "Mihrab · prayer". If it is ever added, change the name first.

## What was never taken from Mihrab (and why)
Screens (written against Mihrab's contexts/react-navigation), most native code (widgets, live activity), its Quran/tafsir/translation content and audio sources (their licences are Mihrab's claims; verify each in `docs/licensing/INVENTORY.md`), and all of `branding/`.

Older notes: `REUSE-REPORT.md` and `NOTIFICATIONS-REPORT.md` record what was checked in Mihrab before the takeover. Where they say "pristine", read "as it was at takeover".
