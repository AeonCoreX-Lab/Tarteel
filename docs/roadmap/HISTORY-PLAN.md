# How the History system reaches "full and detailed" (plan, 2026-10-24)

"History" in Tarteel means four layers. They need different sources, and no single provider covers them, so this is a plan by layer: what exists, what is missing, where the content can lawfully come from, and who has to do what.

## The four layers

| Layer | The question it answers | Today |
|---|---|---|
| 1. Ayah | What is this ayah about? Why was it revealed? What do the commentators say? | **Quranpedia live:** classical tafsir (al-Tabari, Ibn Kathir, al-Baghawi, Ibn al-Jawzi, Ibn 'Atiyyah, al-Razi, al-Baydawi, Ibn Juzayy, al-Jalalayn) and al-Wahidi's reasons of revelation, Arabic. Live tafsir from QuranEnc: Al-Mukhtasar in Bengali, Tafsir al-Saʿdi (Arabic), Saheeh International notes (English). Asbab al-nuzul (Wahidi) as a pack from Quranpedia |
| 2. Surah | When, where and in what circumstances was this surah revealed? What are its themes? | Revelation order and place are in the app's data. **Quranpedia live (Arabic)** gives each surah's introduction, revelation, topics, purposes, merits and names; Wikipedia live for background. A reviewed Bengali summary is still missing |
| 3. People, places, events | Who is this prophet or companion? Where is this place? When was this event? | Timeline with entries from packs; Wikidata importer for drafts; Wikipedia live for background |
| 4. Narrative | The seerah, the stories of the prophets, the history of the early community, as continuous reading | **Nothing.** No lawful free source exists as an API |

## Layer 1: ayah (mostly tooling)

- **Now:** live, opt-in. Done.
- **Checked:** the publisher's lists (2026-10-24) show no Bengali edition, and the website has no download button for it, but the `translation/sura/bengali_mokhtasar/<n>` endpoint answers (owner, on a phone, 2026-10-25), so Bengali is live now. Its version number is not in any list.
- **Next, offline:** QuranEnc's terms say its contents "can be downloaded and re-published", unchanged, with credit, the version stated, and the latest version used. Downloads exist as SQLite, CSV and XML for every edition. A build-time importer (same pattern as `scripts/import-wikidata`, run by a GitHub workflow on a machine with internet) can turn `bengali_mokhtasar` and the Arabic editions into a signed tafsir pack with `kind: tafsir` items, which the History screen already shows. That puts tafsir offline and in search.
- **Needs:** the full Terms and Policies text read once by the owner (the build machine could not fetch it), and a courtesy email to Rowwad/IslamHouse. Then one session of work to write and test the importer, and one run of the workflow.
- **Limit:** the concise tafsir is short and groups ayahs. It is a good first layer, not a deep one. Deeper tafsir (Ibn Kathir, Tabari, Qurtubi, Tafhim) in modern translations is under publishers' copyright: it needs a written licence, not a download.

## Layer 2: surah (editorial)

No source gives a reliable, neutral summary of a surah. Wikipedia's surah articles are written from an academic outsider's view in places. The honest route is to write it: for each of the 114 surahs, a short entry (period, place, themes, a few well-attested circumstances) that cites classical works by name, carries an evidence label, and is reviewed by someone qualified before it is marked `published`. The pack format, review fields and evidence labels already exist for exactly this.

- **Work:** about 114 short entries. A draft can be machine-prepared from the sources above; **a person must review every one**. Realistic pace for one reviewer: 10 to 15 entries a session.
- **Do not** publish unreviewed text as if it were reviewed. The importer marks drafts `machine_draft` and `unverified`; the app shows that.

## Layer 3: people, places, events (importer + review)

- `npm run sync:wikidata` (workflow "Wikidata sync") creates draft entries from a list of Wikidata items a person chooses. Grow `data/knowledge/_incoming/wikidata/seeds.json` from 15 to a few hundred: the prophets named in the Quran, the Prophet's family and companions, the main places (Makkah, Madinah, Badr, Uhud...), the main events.
- Each draft needs a reviewer to fix the name in Bengali, check the date and its calendar note, add a source, and set the status. Dates are never more exact than the source.
- Wikipedia live fills the gap for anything not yet reviewed.

## Layer 4: narrative (needs permission or authors)

- **Public domain, usable:** Arabic originals of classical works (Ibn Hisham, al-Tabari) are old enough, but they are long, in classical Arabic, and the modern editions and translations are mostly copyrighted. Not a quick win.
- **Permission:** IslamHouse and Rowwad publish seerah and history books in Bengali. A written permission to include chosen books unchanged, with credit, in signed packs is the realistic path, and one email can cover this together with HadeethEnc and QuranEnc.
- **Original writing:** short, cited summaries of the main events, written for Tarteel and reviewed. Slow, and it is the part that most needs a qualified reviewer.

## Why a live provider can not do all of this

A live provider is only as good as what a publisher serves openly. For layers 1 and 3 there is something (QuranEnc, Wikipedia). For layers 2 and 4 there is no open service with clear terms. So the system is built as: live providers for breadth now, signed and reviewed packs for depth over time.

## Order of work

1. **Owner:** read the QuranEnc Terms and Policies page in full; send one email to IslamHouse/Rowwad (QuranEnc packs, HadeethEnc packs, seerah books); keep the Sunnah.com request open.
2. **Next session:** QuranEnc importer and tafsir pack (layer 1, offline).
3. **Ongoing:** grow the Wikidata seeds and review drafts (layer 3).
4. **Ongoing, needs a reviewer:** the 114 surah entries (layer 2).
5. **Later:** layer 4 after permissions.

## Update 2026-10-25: Quranpedia live

Quranpedia's API is free and meant for apps that ask it live, so it is now a live provider (`onlineQuranpedia`, Sources screen, History page row "Classical tafsir (online)"). It fills layer 1 (classical tafsir and asbab, per ayah) and the first part of layer 2 (each surah's introduction and facts). What it can not do: it is Arabic only, its surah texts have no named author or review by Tarteel, and Bengali readers still need the QuranEnc Bengali Mukhtasar. Quranpedia also holds topics, nasikh/mansukh, i'rab, fatwas and notes; these are not used yet (fatwas and modern notes are rulings and contemporary works, so they stay out). The weekly dump download was removed; the already imported pack `asbab-wahidi` stays.
