# Data sources: what is enabled, what waits, what is rejected

Status 2026-10-19. Rule of the project: only Sunnah.com (and anything that is Sunnah.com's data, such as the islamic.app mirror) stays off until Sunnah.com answers. Every other source below is judged on its own terms. "Verified" means the terms page or API was read on the date shown; the full evidence is in `docs/licensing/INVENTORY.md`.

## Enabled now

| Source | How it is used | Why this is allowed | Limits |
|---|---|---|---|
| **HadeethEnc.com** (IslamHouse), hadith with explanation, grade, Bengali | **Live lookup**, opt-in, nothing stored (`packages/core/src/hadeethenc.ts`, screens `app/hadeeth/`). Build flag `hadeethenc` in `apps/mobile/src/hadith/config.json` is `true` | Terms (read 2026-10-19): content may be shown if it is **not modified, added to or cut** and the publisher is **clearly credited**. The app shows every field as sent and the credit on every screen | Browse by topic only: the API has no search. Terms are silent on storing and on bundling, so there are no offline copies and no packs until IslamHouse agrees in writing. The grade has no named grader |
| **Wikidata** (CC0), people, places, events and their dates | **Build-time importer** (`npm run sync:wikidata`, workflow "Wikidata sync") makes *draft* entities for the Timeline from a list of items a person chooses | Structured data is CC0: no credit or permission needed | Drafts only. Unreviewed names, no source: a person must add a source and review before anything ships. Item numbers are chosen by a person, never guessed. No Wikipedia text (a different licence) |
| Tanzil (Quran text, translations), QuranEnc, Quranpedia (Wahidi, asbab) | Already in the repo, with their own licence rows | See INVENTORY | Unchanged |

## Disabled until permission

| Source | Why | What turns it on |
|---|---|---|
| **Sunnah.com** API and data | Its About page forbids scraping and mass reproduction; the API terms need a key and were not readable | Written answer to the GitHub issue / email. Then set `"sunnah": true` in `apps/mobile/src/hadith/config.json` |
| **islamic.app API** (hadith) | Says its hadith are Sunnah.com's, collected by a scraper. Its permission cannot be wider than Sunnah.com's, so it sits behind the **same** flag | Same flag as Sunnah.com |

## Not built, possible next

| Source | Position |
|---|---|
| **AlQuran Cloud API** (Quran text editions, translations, audio) | Terms page read 2026-10-20: the Quran text may be stored and shown freely for non-commercial use; commercial use needs no permission but expects an acknowledgement; keep the Uthmani text intact; translations are "contributed by their rights-holders or sourced from public-domain editions", with **no per-edition licence stated**, and a republished translation must name its translator; soft per-second limit per IP. A Bengali edition was **not confirmed** (the edition list could not be read from the build sandbox). **Not built:** the app already has Bengali translations (Tanzil, QuranEnc), so a live fallback adds little, and an edition with no stated licence should not be used. Revisit only for a specific edition whose licence is read |
| **OpenITI** (classical history texts) | CC BY-NC-SA. Owner decision (2026-10-14): allowed only as separate, optional, labelled non-commercial packs, never in the core app |
| **QUL** (Quranic Universal Library) tafsir | Licence varies per resource; none checked yet |

## Rejected or blocked

| Source | Reason |
|---|---|
| Quran Foundation API | Redistribution not allowed |
| fawazahmed0 hadith-api | The Unlicense covers the repository, not the scraped sources, which state no terms |
| hadith-json, Open-Hadith-Data, Sanadset / isnad datasets | Origin is Sunnah.com or unstated; not cleared |
| Quranpedia's modern books | Copyright |

## What to do next (owner)
1. Send IslamHouse the permission email (draft exists) asking about **storing hadith in installable packs**. Live display needs nothing more.
2. Keep the Sunnah.com request open. Do not flip `"sunnah"` before there is a written answer.
3. `seeds.json` already lists 15 items (people, places, events), item numbers taken from wikidata.org search results. Run **Wikidata sync** once by hand and check every name in `candidates.json` is the right item (not tested against the live API).
4. Run the "Online Hadith (HadeethEnc)" device checklist before shipping.
