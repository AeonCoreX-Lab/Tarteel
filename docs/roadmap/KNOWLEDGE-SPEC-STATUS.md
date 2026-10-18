# Historical Knowledge System: status against the plan

Last updated 2026-10-18 (online Hadith added, dormant; Step 2: events, people, places and Timeline). "Verified" means a command ran and its result was seen. Nothing below is verified on a device, and
`npm run typecheck` passes (root, no React Native types); `npm run lint` could not run here (missing @eslint/js); the mobile screens were only checked against stubs.
Counts: 380 Node tests pass, 1 skipped (an existing on-device prayer-time test).

Legend: **Done** (implemented and tested) · **Partial** · **Not started** · **Blocked** (needs rights, data, credentials or hardware).

## The six features
| Feature | Status | What exists | What is missing |
|---|---|---|---|
| Surah History | Partial | claims linked to a surah, evidence labels, sources, uncertainty, revelation order (Tanzil, hash-checked); screen `history/[id]` | any real content; chronology and events (no event or date model); loading, error and retry states on the screen |
| Ayah Context Explorer | Partial | claims, reports and commentary for one ayah; "Context" link only on ayahs that have something | ayah ranges; an explicit per-ayah "No verified report found" state (today the screen says nothing is installed) |
| Hadith History | Partial (live lookup, dormant) | an opt-in online lookup through the islamic.app API (`packages/core/src/hadith.ts`, screens under `app/hadith/`): collections, books, hadith, search, grading with grader names, link to Sunnah.com. Nothing is stored. **Off in the repository build** (`apps/mobile/src/hadith/config.json`). Tested with invented fixtures only; never run on a device or against the live service from this code | any offline hadith pack (needs permission, see below); chain of narrators and narrator records (the API gives none); Bengali text (none available); a decision on the legal status of the islamic.app mirror of Sunnah.com |
| Islamic History Timeline | Partial (no content) | schema migration 3 (events, people, places, date precision and calendar, approximate sort year), pack format `entities.json`, loader, builder, validator, reader, Timeline screen (events / people / places), Details screen, linked entries on the History screen, search and browse include entities; all tested with synthetic data only | **any real content** (no event, person or place has been written or imported); an importer (Wikidata is CC0 but not yet reviewed for fitness, and was not reachable from where this was built); coordinates and a map; person-to-person relations; a chronological view across events and claims |
| Source-Linked Knowledge Graph | Partial | `edge` tables with 13 typed edges (4 original, 9 for events, people and places), edges need evidence, validator checks kind and publication of both ends; related-entity navigation on the Details screen; the Knowledge tab lists surahs that have links, and search results lead to them | narrators, hadith and tafsir nodes; a graph view |
| Source & Evidence Registry | Partial | licences, works, editions, passages, claims with text per language, supports and contradicts, evidence labels, editorial lifecycle, reviewer and review date, retraction by omission, Source Detail screen | a per-claim change history (only the pack changelog), a review workflow beyond status fields |

## The requirements, section by section
| Spec section | Status | Notes |
|---|---|---|
| 1. Audit and repair | Partial | my own code was re-read and tested; the whole repository was not re-audited and typecheck, lint and CI have not run |
| 2. Research integrity and licensing | Partial | read for real: Quranpedia (manifest, LICENSE.md summary, usage policy), Quran Foundation terms, fawazahmed0 LICENSE and References.md. Not yet researched: Wikidata, OpenITI per text, narrator datasets, ilm/ummah-library ATTRIBUTION. Raw Quranpedia files could not be read here |
| 3. Schema and pack lifecycle | Done, with gaps | build, validate, sign, catalogue, download, verify, install, update, repair, remove, rollback, key rotation and read-time trust re-check are implemented and tested. Gaps: unsigned catalogue, no streaming or `Content-Length` pre-check for downloads, no remote revocation (by design), no timeline or hadith schema |
| 4. User experience | Partial | Library, History, Ayah Context, Source Detail, **Knowledge tab (browse by surah, search of installed packs)**, loading / failure / retry on the History screen and Knowledge tab (English and Bengali). Missing: Timeline, Graph navigation, filters, accessibility review, Arabic rendering check on device. None of the new screens has been run on a device |
| 5. Editorial and publishing | Partial | JSON source, strict loader, build with release validation, signing, GitHub release workflow (never run). Missing: review checklist and pull request template, corrections guide. **Pilot pack: Blocked**, only synthetic fixtures exist, and they are labelled synthetic |
| 6. Security, privacy, performance | Partial | threat model written (`KNOWLEDGE.md`), privacy page updated. No large-pack, low-storage or slow-network tests beyond unit tests of the failure codes |
| 7. Tests and release gates | Partial | 300 Node tests (migrations, provenance rules, licence rules, conflicting evidence, malformed and tampered packs, signature failures, interrupted installs, update and rollback, offline rebuild, empty catalogue, rotation). **Not run:** typecheck, lint, CI, the Android build, any device or emulator test |
| 8. Documentation | Mostly done | README, architecture, privacy, licensing inventory, NOTICE, CLAUDE.md and AGENTS.md, authoring guide, device checklist, release steps all updated. Not written yet: a recovery guide for end users, a contributor guide for reviewers |

## Decisions of 2026-10-18
- **Not everything ships offline.** Bundling all of the plan's content would grow the app too much. Installed packs stay offline; Hadith and other large collections are to come through the download system and, where a source allows it, a live lookup over the internet. A live lookup must be a choice the person makes (a setting that is off by default), must name the host in the privacy text, and must label the result as an online source that Tarteel has not reviewed. It does not change the rule that nothing is fetched until the person asks.
- **Order of work:** (1) Knowledge tab, search, missing states: done in code. (2) Schema migration 3 (events, people, places, date precision) and the Timeline: done in code, no content. (3) Hadith, once a source is cleared.
- **Search is not FTS.** Packs carry no virtual tables (the Android close crash, see `KNOWLEDGE.md`), so search over packs scans rows in JavaScript, with Arabic marks and alef and ya variants folded, up to 20,000 rows per pack and kind. That is right for the packs of today (the Wahidi pack has 447 passages). A big pack (a full tafsir) would need an ordinary token-index table built into the pack. That was left out of migration 3 on purpose: no large pack exists yet, so it would be unused and untested code. Add it with the first large pack.

## Hadith: what was checked on 2026-10-17
No source was found that may be used without asking. Details and dates are in `docs/licensing/INVENTORY.md`.
- **IslamHouse (HadeethEnc) and the House of Islam developer API:** free for personal and commercial use, attribution optional, but the terms say nothing on storing, redistributing or bundling. Live display looks like the intended use. Written permission is needed for caching or packs. This is the first one to ask.
- **Sunnah.com (and anything built on it, including the islamic.app API and Sanadset):** forbids scraping and mass reproduction; the API needs a key and its terms could not be read. Written permission needed.
- **Open-Hadith-Data:** ODbL, but the origin of the Arabic text is not stated. Not cleared.
- **OpenITI:** CC BY-NC-SA 4.0 for the whole corpus; per-text terms not stated. Usable only if the owner accepts that a pack made from it must be released under the same non-commercial, share-alike licence. Not decided.
- **QUL tafsir:** licence differs per resource; none checked.

## Online Hadith (built 2026-10-18, dormant)
Design in `docs/architecture/HADITH.md`. In short: the person must turn it on (Settings, default off; first use shows a consent card naming api.islamic.app); every request is made when a screen opens or a search settles; nothing is written to disk (a 10-minute in-memory cache only); only plain `text` fields are read, never the API's HTML; every screen carries the credit and "online source, not reviewed by Tarteel"; grading is shown with the grader's name or "grader not named". **Not verified:** that the live API still returns the shapes the parser expects (it was read once on 2026-10-17), that the screens render correctly on a device, and the licence position (see INVENTORY).

## Source by source
| Source | Decision | Evidence |
|---|---|---|
| Quranpedia, Wahidi *Asbab Nuzul al-Quran* (book 2919) | Usable with credit (Quranpedia.net, link, dump version). Not yet confirmed in writing. Raw file read; imported as pack `asbab-wahidi` by `npm run import:quranpedia` | INVENTORY |
| Quranpedia, other books (modern compilations, translations) | Not cleared: author or publisher copyright | INVENTORY |
| Quran Foundation (Quran.com) API | Rejected for packs: no redistribution, no bundled database | INVENTORY |
| fawazahmed0 hadith-api | Rejected for hadith text: the Unlicense covers the repository, not the scraped sources, which state no terms | INVENTORY |
| hadith-json, sunnah.com | Rejected | INVENTORY |
| Wahidi English translation (Guezzou) | Not used: copyrighted | INVENTORY |
| Tanzil metadata (revelation order) | In use, hash-checked | INVENTORY |
| OpenITI, narrator datasets, Wikidata | Not decided | INVENTORY / this file |

## Remaining blockers
1. **Real content.** Done for the passages: `npm run import:quranpedia` builds pack `asbab-wahidi` (source passages and ayah links only). Still open: people-written claims. (Earlier note: the Wahidi asbab importer needed the real file layout.) The sandbox cannot reach quranpedia.net and the fetch tool cannot read `.json.gz`, so it needs `manifest.json`, `asbab.json.gz`, `asbab-book-2919.json.gz`, `surahs.json.gz` and `LICENSE.md` supplied (about 0.5 MB). Claims must still be written and reviewed by people: nothing may be machine-written religious content.
2. **Toolchain.** typecheck, lint and the Android build must run in CI, and the `@noble` lockfile entries must be committed.
3. **Device.** `docs/testing/KNOWLEDGE-DEVICE-CHECKLIST.md` has not been run.
4. **Publisher key and catalogue address.** Not generated, so the feature is correctly hidden in every build.
5. **Hadith (stored), timeline content, graph.** Migration 3 exists; what is missing is licensed or CC0 data and people to write and review entries.

## Production-readiness checklist (truthful)
- [x] Quran text, bookmarks, notes and history are never touched by pack operations (tested)
- [x] Pack lifecycle works end to end in tests, including failure and rollback
- [x] The feature is hidden when no catalogue address and publisher key are configured
- [ ] typecheck, lint, CI green
- [ ] Android build includes the new screens and starts
- [ ] Device checklist passed
- [ ] Publisher key generated, private key stored as a secret, public key committed
- [ ] At least one real pack with every source cleared and every claim reviewed by a person
- [ ] Search across packs
- [ ] Release workflow run once on a branch
