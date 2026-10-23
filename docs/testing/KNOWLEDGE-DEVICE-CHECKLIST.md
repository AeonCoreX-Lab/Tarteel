# Knowledge packs: device test checklist

Steps 6 and 7 (Library screen, pack install, History and context screen) are covered by automated tests of the logic, but have
**not been run on a phone**. Do this once on a real Android device before the first real pack ships. The packs below are
synthetic ("Synthetic claim one."): they contain no real religious content, and must never be published as real packs.

## 0. Prerequisites
1. `package-lock.json` must include `@noble/curves` and `@noble/hashes` (added to `apps/mobile/package.json`). Pushing to `main`
   runs the *Bootstrap dependencies* workflow, which refreshes the lockfile and commits it with `[skip ci]`; then **re-run CI**.
   On a branch or pull request, run `npm install` once and commit `package-lock.json`, otherwise `npm ci` fails.
2. An https place to put a few static files (a throwaway GitHub Pages site or a private test repository's Pages, any static host).

## 1. Build the test packs
```
npm run pack:demo -- --base-url https://<your-host>/tarteel-demo/
```
Upload everything in `build/demo-packs/` to that address. The private key is thrown away; `demo-publisher-key.pub.pem` is the matching public key.

## 2. Build a TEST app
```
npm run pack:configure -- --catalog-url https://<your-host>/tarteel-demo/catalog.json --key build/demo-packs/demo-publisher-key.pub.pem
```
Then build the APK as usual (the *Android build* workflow, or locally). **Do not commit the resulting `config.json`.**
Revert it with `git checkout apps/mobile/src/knowledge/config.json` afterwards.

## 3. Checks (tick each on the phone)
Setup: fresh install, no packs. Airplane mode off.

- [ ] **Off by default.** With the original `config.json` (empty), Settings shows no "Knowledge library" group, and the surah screen has no History button.
- [ ] **Settings** (test app) shows "Knowledge library". The Library opens **without any network use** (check with airplane mode on: the screen opens and says "No packs yet").
- [ ] **Check for packs** (airplane mode off) lists one pack, "Synthetic example pack", status not installed, version 1, size, languages `bn, en`.
- [ ] **Install.** Progress text appears, then "Installed." and the row shows "Installed", version 1, and the licence credit ("Synthetic attribution line").
- [ ] **Surah screen, Al-Fatiha.** A "History and context" button appears; ayah 1 has a "Context" link; other ayahs do not.
- [ ] **History screen.** Shows three claims: "Synthetic disputed claim." (label "Disputed", with its uncertainty note, one supporting source and one source that disagrees), "Synthetic claim one." (in Bengali when the app language is Bengali) and "Synthetic claim two.", each with an evidence label and sources where it has them (volume and page), and the closing note that these are not rulings.
- [ ] **Ayah context** (ayah 1:1). Shows the report with its source and the quote "synthetic quotation".
- [ ] **Offline.** Airplane mode on, force-stop and reopen the app: the History screen still works.
- [ ] **Update.** Replace `catalog.json` on your host with `catalog-v2.json` (same name). In the Library tap "Check for packs": status "Update available" with the changelog. Tap Update. Afterwards "Synthetic claim one, edited in version 2." is shown and "Synthetic claim two." is gone (two claims remain).
- [ ] **Interrupted install.** Start an update and switch airplane mode on mid-download (or cancel). A failure message appears and version 1 still works.
- [ ] **Repair.** With a file manager or `adb`, truncate the pack file under the app's `tarteel/packages/knowledge-packs/` directory, reopen the Library: "This pack's file is missing or damaged", then Repair restores it.
- [ ] **Remove.** Two taps. The History button disappears from Al-Fatiha. Bookmarks and notes are untouched.
- [ ] **Wrong key.** Install a normal release build (different key) and point it at the demo catalogue address: the pack list stays empty.
- [ ] **Content update.** Install a newer app build (new `contentVersion`) over the old one: the installed pack is still there.

## 4. If something fails
Note the step, the message shown, and `adb logcat | grep -i tarteel`. The most likely trouble spots, in order:
1. `expo-sqlite` opening a database outside its default directory (`openExpoDbAtUri` in `apps/mobile/src/platform/expo-sqlite-driver.ts`).
2. The `@noble` imports under Metro (`apps/mobile/src/knowledge/crypto.ts`): a package-exports resolution error at launch.
3. File moves inside the app's documents directory (`apps/mobile/src/audio/fileStore.ts`, `move`).
4. SHA-256 speed in JavaScript for larger packs.

## Install and close on Android (regression for the expo-sqlite close crash)
Needs a build made after the fix (a new native build is not required, the fix is JavaScript, but the app must be rebuilt) and a pack built after the fix.
1. Install the app, open Settings -> Knowledge library -> Check for packs.
2. Install "Occasions of revelation: al-Wahidi" once. Expect: "Installing..." then the installed message. The app must stay open.
3. Repeat with airplane mode on after the download starts (expect a download error, no crash), then again normally.
4. Tap Install twice quickly: only one install runs.
5. Tap Cancel while "Installing..." shows: expect "Cancelled", no crash, and the pack is not installed.
6. Remove the pack, install it again, then open a surah with the pack and an ayah that has a report (for example 105:1). Expect the source passage.
7. Force-stop the app during "Installing...", reopen the Library: expect no stuck card and no leftover pack.
8. While it runs, `adb logcat | grep -E "Scudo|SIGABRT|libexpo-sqlite"` must print nothing.
If step 2 still crashes, send the logcat lines around `Fatal signal 6`: the trace tells whether it is still the close path.

## Knowledge tab (added 2026-10-18; not yet run on a device)
With a test app that has a catalogue address and key, and the Wahidi pack (or a demo pack) installed:
- [ ] **Tab.** A "Knowledge" tab sits between Quran and Bookmarks. With the original empty `config.json` there is **no** such tab.
- [ ] **Empty.** With no pack installed the tab says "No knowledge packs installed" and its button opens the Library.
- [ ] **Browse.** After installing a pack and coming back to the tab (no restart), the surahs with context are listed in surah order, each with the number of ayahs; tapping one opens its History screen.
- [ ] **Search.** Typing two letters or more shows results after a short pause; one letter shows the surah list. An Arabic word typed with and without vowel marks finds the same passages. Nothing found says so. Clearing the box brings the list back.
- [ ] **Result.** Tapping a result opens the ayah's context (or the source page for a passage that no ayah links to).
- [ ] **Ayah with nothing.** Open the History screen for an ayah with no pack content (`/history/1?ayah=1` style): it says nothing is installed for it, and does **not** say nothing is known.
- [ ] **Failure.** With a pack file deleted by hand (Library shows it damaged), the tab shows either the list without it or "could not be read" with a working "Try again".
- [ ] **Checksum error detail.** A failed install shows a small grey line under the message (error code, and for a checksum failure both digests).

## Timeline (events, people, places). Needs a pack with entities: the demo packs from `npm run pack:demo` have a few synthetic ones
- [ ] With no pack installed: the Knowledge tab has no Timeline card; opening `/timeline` shows the empty state with a Library button.
- [ ] Install the demo pack: the Knowledge tab shows a "Timeline" card. Open it. Events are listed oldest first; the undated event is last and says "Date unknown".
- [ ] Dates read as exactly as the source: "2–3 AH", "c. 610 CE", never a more exact year. People show birth–death; places show no date.
- [ ] Switch Events / People / Places. A disputed entry shows the "Disputed" label. Bengali UI: dates, kinds and subtypes are in Bengali.
- [ ] Open an entry: date card with its note, summary, links to related events / people / places (they open), "In the Quran" links open the History screen on the right surah or ayah, claims show their sources, sources open the Source screen.
- [ ] The History screen of surah 1 (and the ayah) lists the linked events, people and places under "Events, people and places".
- [ ] Search for a word from an entry's name: a "Timeline entry" result opens it.
- [ ] Install an older pack file (built before migration 3, if you have one) next to a new one: both still work, and the old one adds no entries.
- [ ] Remove the pack while the Details screen is open elsewhere in the stack: it says the entry is not available.

## Online Hadith (only after `apps/mobile/src/hadith/config.json` is set to `true` in a test build)
- [ ] With the flag `false`: no Hadith row in the Knowledge tab, no Settings group, no request to api.islamic.app (check with a network monitor).
- [ ] With the flag `true`, setting off: opening Hadith shows the consent card and makes no request.
- [ ] Turn on: collections load; open a collection, a book, a hadith. Arabic is right-to-left and readable; English is labelled as given by Sunnah.com.
- [ ] Grading shows the grader's name, or "grader not named"; the note that the chain of narrators is missing is visible.
- [ ] Search in English and Arabic: matched words are bold; results open the hadith; under two characters nothing is requested.
- [ ] Airplane mode: a clear "could not reach" message and a working retry.
- [ ] "Open on Sunnah.com" appears only for Bukhari, Muslim, Nasai, Abu Dawud, Tirmidhi, Ibn Majah and the Forty, and opens the right hadith.
- [ ] Credit and "not reviewed by Tarteel" are on every hadith screen. Bengali UI shows the Arabic/English-only note on a hadith.
- [ ] Nothing hadith-related is on disk after use (app storage shows no new files).

## Online Hadith, HadeethEnc (flag `hadeethenc` is `true` in the repository build)
- [ ] Knowledge tab shows "Hadith (HadeethEnc)". With the flag `false` there is no row, no Settings group, and no request to hadeethenc.com.
- [ ] Setting off: opening it shows the consent card (names hadeethenc.com) and makes no request.
- [ ] Turn on: topics load in the app language (check Bengali). Open a topic: subtopics (if any) and a list; "Show more" adds the next page without repeating rows.
- [ ] Open a hadith: Arabic original is right-to-left and readable; translation, source of the report, grade, explanation and lessons are each labelled. A hadith with no Bengali text says so and shows the Arabic.
- [ ] The grade note says the publisher names no grader. Credit "HadeethEnc.com, published by IslamHouse.com" and "not reviewed by Tarteel" are on every screen.
- [ ] "Open on HadeethEnc.com" opens that hadith's page.
- [ ] Airplane mode: a clear "could not reach" message and a working retry.
- [ ] Nothing hadith-related is on disk after use.
- [ ] Text is exactly as on hadeethenc.com for two or three hadith (compare side by side): nothing cut, nothing added.

## Install, then show (no restart needed)
- [ ] Knowledge tab open with no pack: shows "No knowledge packs installed". Go to Knowledge library, install a pack, come back: the tab lists the surahs **without closing the app**.
- [ ] Remove the pack in the Library and come back: the list disappears at once. Reinstall: it comes back at once.
- [ ] Open a surah that the pack does not cover: the screen says the installed packs have nothing about it (it does not tell you to add packs).
- [ ] If packs are installed but cannot be read, the Knowledge tab says so, lists the pack, the stage (`trust`, `open` or `query`) and a short technical message, and "Try again" works. Copy those lines into the bug report.

## Reading-screen design (Knowledge tab, HadeethEnc, Sunnah, History). Not yet run on a device

Look at each screen in light, dark and AMOLED themes, and once with a large Arabic size and wide line spacing in Settings.

- [ ] Knowledge tab: green header card with the quiet star pattern; the title and the line under it are easy to read on it.
- [ ] Section labels (gold text, small star, line to the edge) are readable in all three themes; surah rows show a numbered star.
- [ ] HadeethEnc topics and hadith lists: numbered stars, counts, chevrons; the list is still smooth to scroll with 20+ rows.
- [ ] A hadith (`/hadeeth/view`): the Arabic sits in a double gold frame with a star on its top edge, is right-to-left, and no vowel marks are clipped at the top or bottom of any line. Changing the Arabic size or line spacing in Settings changes it.
- [ ] The translation is smaller than the Arabic and sits beside a thin gold rule; its label says which text it is.
- [ ] Source and grade, "Practical lessons", and the credit line "HadeethEnc.com, IslamHouse.com" are all still on screen, unchanged in wording.
- [ ] With TalkBack on: decorative stars, rules and frames are skipped; headings are announced as headings.
- [ ] Bengali and Arabic UI: nothing is cut off; a long Bengali title wraps instead of overflowing.

## Wikipedia background reading (flag `wikipedia` is `true`; setting off by default). Not yet run on a device

- [ ] Settings shows "Background reading (Wikipedia)", Off. Open History for a surah with no pack content (or with no pack installed): a "More background from Wikipedia" card with a consent box; nothing is requested yet.
- [ ] Turn it on from the card: up to five results appear, each with a short passage; the passage has no stray tags or `&quot;`-style codes.
- [ ] English app language: results look like the surah (for example "Al-Baqara"). Note any surah where the first results are unrelated, and send me the surah numbers.
- [ ] Bengali app language: results are in Bengali when the article exists; otherwise the line "No article was found in your language…" and English results.
- [ ] Open one: introduction in a bar with a gold rule, other parts closed under headings; tapping a heading opens it; long article scrolls smoothly; Arabic-language article is right-to-left.
- [ ] The credit line (CC BY-SA 4.0), the "not Islamic scholarship" sentence, and the three buttons (Open on Wikipedia, Authors, CC BY-SA 4.0) open the right pages.
- [ ] Offline, or in airplane mode: a clear "no connection" message and a Retry button, not a blank screen.
- [ ] Turn it off in Settings: cards show the consent box again, and no request is made (check with a network monitor if you can).
- [ ] An entity page (Timeline → an entry) shows the same card below the pack's own text, searched by the entry's name.
- [ ] A surah that HAS pack content does not show the card on the History screen.
