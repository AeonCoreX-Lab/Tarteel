# Online sources (live, opt-in, nothing stored)

Every online source follows the same rules: a build flag turns the feature on or off for the whole app; a person setting (off by default) turns it on for them; a request is made only when they open something; nothing received is saved; the source is credited on every screen that shows its text; and its text is shown as it was sent.

| Source | Flag | Setting | What for | Code |
|---|---|---|---|---|
| HadeethEnc.com | `hadeethenc` in `src/hadith/config.json` | `onlineHadeethEnc` | Hadith by topic, with explanation and grade, Bengali | `packages/core/src/hadeethenc.ts`, `app/hadeeth/` |
| Sunnah.com (islamic.app) | `sunnah` (**off**) | `onlineHadith` | Dormant until Sunnah.com agrees in writing | `packages/core/src/hadith.ts`, `app/hadith/` |
| Wikipedia | `wikipedia` in `src/online/config.json` | `onlineWikipedia` | Background on surahs, people, places, events | `packages/core/src/wikipedia.ts`, `src/online/`, `app/wiki/view.tsx` |
| QuranEnc.com | `quranenc` in `src/online/config.json` | `onlineQuranEnc` | Al-Mukhtasar (Bengali), Tafsir al-Saʿdi (Arabic) per ayah, and Saheeh International notes (English). The Bengali edition is not in the publisher's lists but its `translation/sura` endpoint answers (checked on a device 2026-10-25) | `packages/core/src/quranenc.ts`, `src/online/quranenc*.ts(x)`, `app/tafsir.tsx` |

QuranEnc: the app states each edition's version number (from the publisher's `translations/list` and `tafsirs/list`) on the tafsir screen, as the terms require. A tafsir answer is blocks that can cover several ayahs; the app shows each block's text unchanged and states its ayah range.

| Quranpedia.net | `quranpedia` in `src/online/config.json` | `onlineQuranpedia` | A surah's introduction and facts, classical tafsir per ayah (al-Tabari, Ibn Kathir, al-Baghawi, Ibn al-Jawzi, Ibn 'Atiyyah, al-Razi, al-Baydawi, Ibn Juzayy, al-Jalalayn) and the reasons of revelation (al-Wahidi). Arabic | `packages/core/src/quranpedia.ts`, `src/online/quranpedia*.ts(x)`, `app/quranpedia.tsx` |
| islamic.app Library (books) | `islamicbooks` in `src/online/config.json` | `onlineIslamicBooks` | Classical Islamic books (authors dead over a hundred years), read live, one book at a time; nothing is stored. Arabic | `packages/core/src/islamicbooks.ts`, `src/books/`, `app/books/` |
| OpenITI corpus (KITAB) | `openiti` in `src/online/config.json` | `onlineOpenIti` | Classical Arabic texts. The title list is downloaded once on request; a book is downloaded only when the person taps "Keep on this device", then read offline. CC BY-NC-SA 4.0 | `packages/core/src/openiti.ts`, `src/books/store.ts`, `app/books/` |

Quranpedia: its API is free, read-only, without a key, for apps that ask it live (120 requests a minute and 10,000 a day for each IP address; the app spaces its requests 700 ms apart). The API is not a download service, so the app never walks it to build a copy, and the weekly dump-download workflow and `sync:quranpedia` script were removed. Only the classical books named in `QURANPEDIA_BOOKS` can be asked for (the licence leaves translations and contemporary works with their authors). The author and language shown on a screen come from the server's answer for that book.

The list of sources, with publisher, terms and what each sends, is one table in `packages/core/src/providers.ts`. The two "Sources" screens (`app/sources.tsx`, Hadith and History) are drawn from it, so a source added there appears there. Add a source to that table in the same change that adds its client.

## Where Wikipedia is offered

- **History screen** (a surah, or an ayah): only when installed packs have nothing for it, including when no pack is installed. The search words come from the surah's name (`wikiSurahQuery`).
- **Entity page** (event, person, place): always, below the pack's own content, searched by the entry's name.

The person sees up to five matching articles and chooses one; nothing is opened automatically, because a search can match the wrong article. If the app's language has no match, English is searched and the screen says so.

The article screen shows the introduction, and every other part under its own heading, closed until tapped. It ends with the credit line (CC BY-SA 4.0), buttons for the article, its author history and the licence, and a sentence that Wikipedia is not scholarship.

## Candidates looked at and not built (2026-10-23)

| Candidate | Why not |
|---|---|
| fawazahmed0/hadith-api (CDN) | The code is under the Unlicense, but its References file lists Sunnah.com and many scraped sites as sources and states no permission for the texts. Anything derived from Sunnah.com stays off until Sunnah.com agrees |
| spa5k/tafsir_api (CDN) | The MIT licence covers the code. The texts come from quran.com, altafsir.com and qul.tarteel.ai, and the repository gives no permission for them |
| Quran Foundation Content API (quran.com) | Needs an approved client id and token on every request (request access form). A secret cannot be shipped in an open-source app; it would need a server of ours or a key each person gets |
| Dorar.net hadith search | No published API terms found; the known wrappers read the site's own endpoints |
| IslamHouse API v3 | The public key is free, but no terms were found, and the endpoint paths are not documented where they could be read. Same publisher as HadeethEnc: worth an email, together with the permission to keep copies |

Writing to IslamHouse (one email covers HadeethEnc, QuranEnc and the IslamHouse API) is the most useful next step for more hadith and tafsir.

## Books

Books live **inside the Knowledge tab** ("Books" row), not in a tab of their own: the bottom bar stays at five tabs, and a book is reading material next to history and hadith. Screens: `app/books/index.tsx` (Online, OpenITI, On this device), `app/books/[slug].tsx` (an islamic.app book), `app/books/openiti.tsx` (an OpenITI text: Keep / Remove), `app/books/read.tsx` (the reader for both).

- **islamic.app Library** (`https://api.islamic.app/v1/library`, docs.islamic.app, read 2026-10-28): the list by genre, one book's details with its `sources`, the text, a title search and the PDF link. The publisher asks for about 60 catalogue requests and 10 searches a minute; the client spaces them (1 s, 6.5 s), so a search runs only when the person taps Search, not while typing. Every book's `sources` are shown on its page, as the publisher requires. The books are described as out of copyright (authors dead over 100 years); no per-book licence is given, and the app says it has not compared the text with a printed edition. Nothing is written to the device.
- **OpenITI** (release 2025.1.9, CC BY-NC-SA 4.0, Zenodo 18613982): the title list (`OPENITI_METADATA_URL`) is fetched when the person taps "Download the list" and kept as one small JSON file; a book is fetched from `raw.githubusercontent.com/OpenITI/<NNNN>AH/...` only when "Keep on this device" is tapped. Kept files are in the app's private `books` area (`<documents>/tarteel/books/openiti/`), outside Android backups, with an index of what is kept; "Remove from this device" deletes the file. Credit, release and licence link are on every OpenITI screen. NonCommercial: Tarteel is free and without ads, and the person is told the texts are scholarly transcriptions that can contain errors.
- **Not used**: IslamHouse books (written permission needed first) and any source whose terms are unchecked.
- **Unverified until run on a device**: the exact JSON of the islamic.app list and search answers, and OpenITI's metadata columns, file paths and file extensions. The parsers read defensively and fail with "unexpected answer" rather than showing wrong text; see KNOWLEDGE-DEVICE-CHECKLIST.

### Translations (machine, on the device)

Both book sources are **Arabic originals**; no free licensed English or Bengali translation of them is available to Tarteel (islamic.app and OpenITI are Arabic only, IslamHouse needs written permission first). So the reader offers **machine translation on the phone**, clearly marked, with the Arabic always kept.
- **Engine**: Google ML Kit Translate, on the device (`native/tarteel-android/.../TarteelTranslateModule.kt`, Tarteel's own Kotlin; JS side `apps/mobile/src/translate/mlkit.ts`). Arabic, English and Bengali are among its 59 languages. A language pack is about 30 MB; it is downloaded once, only after the person agreed, over Wi-Fi unless they allow any connection (Settings), and can be deleted in Settings. After that it works offline and **the text being translated never leaves the phone**. Translations are kept in memory for the session only, never written to disk.
- **Port**: `packages/core/src/translate.ts` (`TranslatorPort`, `splitForTranslation`, `translateText`, `pickTranslator`, `targetLanguage`). The screens use only the port and `PassageTranslation` (`src/translate/parts.tsx`), so another engine (a local language model such as Gemma 4 with LiteRT-LM for strong phones, or a system engine) is one more file that implements `TranslatorPort` plus one line in `src/translate/runtime.ts`, with no screen change. Not built, deliberately: a task manager, an engine registry, device-RAM routing, summaries or "explanations" of Islamic texts, and any cloud AI (Tarteel has no server, a key in the app could be extracted, and the text would leave the phone).
- **Where used**: the Books reader (tap a passage, then Translate). It takes any Arabic text, so the Quranpedia classical tafsir and other Arabic-only passages can use it next. It is not used where a human translation exists (the Quran, QuranEnc tafsir, HadeethEnc hadith): those stay the translation.
- **Rules**: off by default (`translateOn`); the first tap explains what happens and asks; the result is labelled "Machine translation" with the engine name and a warning that it can be wrong and is not for rulings; the Arabic stays on screen. ML Kit has no glossary, so it can mistranslate religious terms: a general translator, not an Islamic one.
- **Quality**: unmeasured. General neural translation of classical Arabic into Bengali is expected to be weak (English better). Measure on a phone with Arabic passages that have human translations in HadeethEnc and QuranEnc before telling anyone it is good.
- **Build**: the module adds `com.google.mlkit:translate:17.0.3` to the Android build and about a few MB to the APK. In an Expo Go or non-Android build, or one without the native module, the feature reports "not available in this version" and the Settings group is hidden.
