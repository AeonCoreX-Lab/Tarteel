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
