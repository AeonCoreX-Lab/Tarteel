# Staying in sync with Mihrab (without forking)

Tarteel vendors a **curated, hash-locked** subset of [Mihrab](https://github.com/MihrabHQ/Mihrab)
(AGPL-3.0-or-later) in `third_party/mihrab/`. It is not a fork and not a subtree: only the files Tarteel
actually needs (plus their import closure) are copied, so the repo stays small enough for phone development.

| File | Role |
|---|---|
| `upstream.config.json` | upstream repo + the **entry files** we want. Everything they import is pulled in automatically |
| `third_party/mihrab/src/**` | pristine copies, never edited. A file outside `src/` that a vendored file imports (e.g. `data/hijri/v1/overrides.json`) is kept at the same relative place, in `third_party/mihrab/data/**`, so relative imports keep resolving |
| `third_party/mihrab/UPSTREAM.lock.json` | commit SHA, sha256 of every file, upstream licence hashes, external dependency versions |
| `third_party/mihrab/UPSTREAM-LICENSES/` | upstream LICENSE, NOTICE, TRADEMARK.md (shipped with our source) |

## Commands
```sh
npm run upstream:verify                           # CI runs this: fails if any vendored byte differs from the lock
npm run upstream:diff -- --from ../Mihrab         # what would change (added/removed/changed files, dep bumps)
npm run upstream:sync -- --from ../Mihrab         # import; SHA is read from the checkout's .git
```
The **Upstream sync** workflow does this weekly against `MihrabHQ/Mihrab@main` and opens a PR. Nothing auto-merges.

## Rules
1. Never edit `third_party/**`. Wrap it in `packages/*` instead (see below).
2. A sync **refuses** to run if upstream's LICENSE/NOTICE/TRADEMARK changed; read them, then pass `--accept-license-change`.
3. To vendor more, add its entry file to `upstream.config.json` and run a sync. Keep the list small.
4. Keep the AGPL source-offer: Settings -> About links to this repo (`extra.sourceUrl`).
5. Tarteel's name, icon and visuals must stay its own (Mihrab's TRADEMARK.md).

## Wrapping, not patching
Tarteel code calls vendored modules only through a thin `packages/prayer` API (next step), so a defect or an
upstream API change is fixed in one place. This is already needed:

- **Hijri conversion defect.** `hijri/convert.ts` is a tabular calendar that repeats or skips a day near the end of
  Dhu al-Hijjah (e.g. 1446-12-27 on two consecutive days, 2025-06-23/24; 8 glitches in 2020-2031). The test
  `CANARY known upstream issue` documents it and will fail when upstream fixes it. Tarteel's calendar must not
  display dates straight from `convert.ts`; it also differs by up to a day from Umm al-Qura and from local moon sighting,
  so a user-adjustable day offset is required.
- **"Automatic" calculation method.** Upstream's on-device auto method only special-cases Morocco and otherwise returns
  Muslim World League (3). For Bangladesh the wrapper must choose the method/Asr school itself (expected: Karachi
  method with Hanafi Asr, to be checked against the Islamic Foundation Bangladesh timetable).

## What is NOT vendored (and why)
Screens (written against Mihrab's contexts/react-navigation), native Android/iOS code (widgets, live activity, alarms),
its Quran/tafsir/translation content and audio sources (their licences are Mihrab's claims; verify per
`docs/licensing/INVENTORY.md`), and all of `branding/`.

## If you ever want more than a subset
`git subtree add --prefix=upstream/mihrab https://github.com/MihrabHQ/Mihrab main --squash` works too (130 MB, so heavy
on a phone), but features still do not appear in the app by themselves: the app must import them.
