# Quran audio (`@tarteel/audio`)

Tarteel's own recitation implementation. It follows the *ideas* of Mihrab's audio design (per-ayah files, a resumable
download queue, a rolling playback queue) but is written from scratch against Tarteel's storage interfaces. No Mihrab
audio code is vendored.

## Offline-first policy

- **Nothing is fetched unless the user asks.** A reciter's audio comes from (a) an explicit download of a surah or the
  whole reciter, or (b) streaming, which is **off by default** (Settings -> Recitation -> Reciters).
- With streaming off, playback **stops at the first ayah that is not downloaded** and says which one
  (`blocked` / `gap` status, shown by `AudioNotice`). It never silently skips and never silently goes online.
- **Two reciters ship**: Mishary Rashid Alafasy and Mahmoud Khalil Al-Husary (128 kbps, Hafs), both from the Islamic Network CDN
  (`apps/mobile/assets/audio/reciters.json`). With an empty or fully disabled catalogue the Listen page, the reader's audio
  controls and the Quran tab's Listen button are hidden; the rest of the app is unchanged.
- A reciter is only offered when `enabled` **and** `verification.licenseVerified` are true
  (`offeredReciters`). `npm run validate:audio` (also in CI) rejects malformed or unverified-but-enabled entries.

## Architecture

```
reciters.json --parseCatalog--> Reciter[]            (packages/audio/catalog.ts)
FileStore (expo-file-system) --> AudioStore          (store.ts: {reciter}/{SSS}{AAA}.mp3, .part then move)
AudioHttp (fetch)  --> download.ts / manager.ts      (3 workers, resume = skip valid files, 8 consecutive failures
                                                      -> "interrupted", one job at a time, stall watchdog, space check)
PlayerPort (react-native-track-player) --> controller.ts + queue.ts
                                                     (rolling window of 200 ayahs refilled at 60, prefetch 3 ahead,
                                                      repeat / pause-between-repeats, next/previous by surah)
timing.ts                                            (optional word timings; ayah-level fallback when absent)
```

`packages/audio` is pure TypeScript with injected ports, so everything above the three ports is unit-tested under
Node (`npm test`). The Expo adapters live in `apps/mobile/src/audio/`.

Integrity: every downloaded file must look like an MP3 (ID3 tag or frame sync, at least 1000 bytes). A captive-portal
HTML page saved as `.mp3` is rejected and never counted as downloaded. 404/403/410 are not retried.

## Source: Islamic Network CDN (approved 2026-10-26)

`reciters.json` holds two enabled reciters (Alafasy, Husary at 128 kbps) pointing at
`https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{ayah}.mp3`. Why this host: key-less, per-ayah MP3, written
terms (<https://alquran.cloud/terms-and-conditions>, section IV: recitations are "licensed to us by the reciters or their
estates for free, non-commercial redistribution" and "you may stream, embed and download them for personal and educational
use"), and now a direct answer from the host.

**Permission on record.** Tarteel asked on the Islamic Network community forum whether a per-user download of a whole
reciter's ayah files from the audio CDN is acceptable ("option b"). Thread:
<https://community.islamic.network/d/310-confirming-acceptable-use-of-per-user-full-reciter-downloads-from-the-audio-cdn>.
The reply, by meezaan (Islamic Network), read 2026-10-26:

> There are no restrictions for option b, but please be mindful of the rate limits if downloads will be multi-threaded.

What this covers: each person downloading a reciter's files to their own device. What it does **not** say (so the app does
not assume it): anything about attribution, about hosting the files ourselves or in a pack, or about commercial use. The thread
page shows no dates, so the date above is when it was read. Keep this link; if the reply is ever withdrawn or the thread moves,
the reciters are switched off (`enabled: false`) until it is settled again.

**What the app does about it**
- **Rate limits:** 3 download workers (`DEFAULT_WORKERS` in `packages/audio/src/download.ts`, down from 4). A 429 or 503 is a
  `RateLimitedError` and the worker pauses 2 s times the attempt number (`RATE_LIMIT_PAUSE_MS`) before it retries, instead of the usual 400 ms.
  A reciter download is a person's own tap, one job at a time, never in the background and never started by the app.
- **Credit:** the reciter and Islamic Network are credited on the reciter screen (Settings -> Recitation -> Reciters, the `attribution` line of each reciter).
- **Nothing is mirrored:** files are fetched from the CDN into the person's own storage; Tarteel hosts no audio.
- **Privacy:** the CDN sees the IP address and the reciter and ayah requested ([docs/privacy](../privacy/README.md)).

**Still open**
1. The file URLs were not fetched from the build sandbox (it cannot reach the host). Test each reciter's `{ayah}` URL and its
   bitrate on a device (checklist below). The CDN page and the API list some identifiers differently (e.g. `ar.sudais` vs `ar.abdurrahmaansudais`),
   so check the edition id before adding a reciter.
2. The approximate size shown before a download (`APPROX_RECITATION_HOURS`) is an estimate; compare it with a real download.

Device test: Settings -> Recitation -> Reciters -> download one short surah (e.g. 112), play it offline, then pause the network
in the middle of a larger download and check that it resumes and that a 429 (if seen) shows as a pause, not as a failure.

## Adding a reciter (licence procedure)

1. Find the audio **and its terms**. Redistribution/streaming by a free app must be permitted in writing
   (licence text, or the host's terms page). "Publicly reachable" is not a licence.
2. Add an entry to `apps/mobile/assets/audio/reciters.json`:
   `id`, `name`, `arabicName`, `urlTemplate` (https only; `{surah3}{ayah3}` for hosts that number files by surah and
   ayah, e.g. `https://host/path/{surah3}{ayah3}.mp3`, or `{ayah}` for the 1..6236 number, e.g. `https://host/128/ed/{ayah}.mp3`), `bitrateKbps`, `riwayah`, `attribution`,
   `verification { licenseVerified, verifiedOn, verifiedBy, termsUrl }`, `enabled`, optional `timings { url, attribution }`.
3. Keep `licenseVerified: false` / `enabled: false` until step 1 is done and recorded. A reciter that is not one of the Islamic Network ones needs its own permission: the forum answer above covers only that host's CDN.
4. Add a row to [`docs/licensing/INVENTORY.md`](../licensing/INVENTORY.md) in the same change.
5. Run `npm run validate:audio`. Check the file size estimate (`APPROX_RECITATION_HOURS`) against reality for the chosen bitrate.
6. Update [`docs/privacy/README.md`](../privacy/README.md) with the host's name (it sees the IP address and the reciter/surah requested).

## Following the recitation in the reader

Mihrab's surah reader does three things while a recitation plays: the recited ayah's card gets an accent background,
the list scrolls to it (`scrollToIndex`, 30% down the viewport), and the recited word is lit from timing data.
Tarteel does the same, written for its own list (`apps/mobile/app/surah/[id].tsx`), with these differences:

- **Bismillah**: under `hafs-6236` the Bismillah is not an ayah of surahs 2-114 (except 9), and the dataset does not carry it. The reader
  shows it as a heading (`BismillahHeading`, rule `opensWithBismillahHeading`); the player recites it too. It is queued as ayah 0 of the
  surah it opens (`withBasmalah` in `packages/audio/src/refs.ts`) and plays the recording of **1:1** (`audioRefOf`), so a surah always
  starts Bismillah, then ayah 1. One per entry into a surah: not repeated with a repeated ayah 1, but again at the start of each repeated
  pass. No "recite it back" pause after it. A surah download also fetches 1:1. Set `bismillahInFirstAyah: true` on a reciter whose ayah-1
  files already begin with the Bismillah, so it is not played twice.
- **Ayah highlight**: the recited row gets a brass edge and a tinted background. It stays while paused, so the reader
  can see where the recitation is.
- **Follow-scroll** (`followTarget` in `packages/audio/src/follow.ts`): scrolls once per ayah, only while a recitation
  of *this* surah plays. A hand scroll (`onScrollBeginDrag`) stops following and shows a "Follow recitation" button;
  pressing it, or playing an ayah, resumes. (Mihrab keeps scrolling after the reader has scrolled away.)
- **Word highlight** (`RecitedArabic`, `words.ts`, `timing.ts`): only the recited row subscribes to playback progress,
  so the list does not re-render four times a second. A segment may cover several words and the whole run is lit.
- **Counting words**: timing data counts words like a printed mushaf, while the Tanzil text has a separate token for
  every pause sign (4,364 of them, in 2,640 ayahs of this dataset). `countedTokenIndices` skips them. Mihrab also has
  to skip the basmalah Tanzil prepends to ayah 1; Tarteel's dataset has it removed at import (0 such ayahs), so no
  skip is needed.
- **Never a wrong word**: if a timing table counts more words than the text has (`timingsFitText`, `tokenRangeForSpan`),
  that ayah is not lit at all. With no timing data the reader shows the ayah highlight only.
- **Offline**: timings are read from the device. They are fetched only when a surah/reciter download starts or when
  streaming is allowed; the reader never fetches them on its own. A failed load is retried after 30 s
  (`createTimingCache`), because caching a failure for the whole session would leave the words dark until the app restarts.

Needs a verified **timing source** before it does anything: set `timings: { url, attribution }` on a reciter. The file
must be a JSON object `{"surah:ayah": [[firstWord, lastWordExclusive, startMs, endMs], ...]}` for that same recording
(another reciter's timings highlight the wrong word). The Islamic Network CDN publishes audio only, no timings. Not yet
built: tapping a word to hear it (Mihrab's word reader), and keeping the screen awake while reading along.

## Known limits

- Downloads run in the app process. If Android kills the app, the job stops as "interrupted" and resumes on the next
  tap (files already complete are kept). A foreground-service notification for long downloads is not implemented.
- `react-native-track-player` 4.1.2 needs `patches/react-native-track-player+4.1.2.patch` to run on the New
  Architecture (see the inventory). `patch-package` applies it on install, so installs must not use `--ignore-scripts`
  for builds.
