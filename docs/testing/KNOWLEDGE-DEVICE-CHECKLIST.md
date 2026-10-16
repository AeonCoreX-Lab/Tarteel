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
