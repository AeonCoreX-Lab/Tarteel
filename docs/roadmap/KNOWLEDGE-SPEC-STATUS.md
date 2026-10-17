# Historical Knowledge System: status against the plan

Last updated 2026-10-16. "Verified" means a command ran and its result was seen. Nothing below is verified on a device, and
`npm run typecheck` and `npm run lint` have **not** been run since Step 1 (the npm registry was unreachable where the code was written).
Counts: 300 Node tests pass, 1 skipped (an existing on-device prayer-time test).

Legend: **Done** (implemented and tested) · **Partial** · **Not started** · **Blocked** (needs rights, data, credentials or hardware).

## The six features
| Feature | Status | What exists | What is missing |
|---|---|---|---|
| Surah History | Partial | claims linked to a surah, evidence labels, sources, uncertainty, revelation order (Tanzil, hash-checked); screen `history/[id]` | any real content; chronology and events (no event or date model); loading, error and retry states on the screen |
| Ayah Context Explorer | Partial | claims, reports and commentary for one ayah; "Context" link only on ayahs that have something | ayah ranges; an explicit per-ayah "No verified report found" state (today the screen says nothing is installed) |
| Hadith History | Not started | only a `hadith_number` locator on passages | hadith, narration, grading and grader tables; **Blocked on data**: fawazahmed0 and hadith-json are rejected, sunnah.com forbids mass reproduction (see INVENTORY) |
| Islamic History Timeline | Not started | none | event, person, place and date-precision schema (migration 3), importer (Wikidata is CC0 but not yet reviewed for fitness), screen |
| Source-Linked Knowledge Graph | Partial | `edge` tables with 4 typed edges, edges need evidence, validator checks | entities for events, people and places; navigation UI |
| Source & Evidence Registry | Partial | licences, works, editions, passages, claims with text per language, supports and contradicts, evidence labels, editorial lifecycle, reviewer and review date, retraction by omission, Source Detail screen | a per-claim change history (only the pack changelog), a review workflow beyond status fields |

## The requirements, section by section
| Spec section | Status | Notes |
|---|---|---|
| 1. Audit and repair | Partial | my own code was re-read and tested; the whole repository was not re-audited and typecheck, lint and CI have not run |
| 2. Research integrity and licensing | Partial | read for real: Quranpedia (manifest, LICENSE.md summary, usage policy), Quran Foundation terms, fawazahmed0 LICENSE and References.md. Not yet researched: Wikidata, OpenITI per text, narrator datasets, ilm/ummah-library ATTRIBUTION. Raw Quranpedia files could not be read here |
| 3. Schema and pack lifecycle | Done, with gaps | build, validate, sign, catalogue, download, verify, install, update, repair, remove, rollback, key rotation and read-time trust re-check are implemented and tested. Gaps: unsigned catalogue, no streaming or `Content-Length` pre-check for downloads, no remote revocation (by design), no timeline or hadith schema |
| 4. User experience | Partial | Library, History, Ayah Context, Source Detail done (English and Bengali). Missing: Timeline, Graph, **search and filtering across packs**, full loading/offline/error/retry states, accessibility review, Arabic rendering check on device |
| 5. Editorial and publishing | Partial | JSON source, strict loader, build with release validation, signing, GitHub release workflow (never run). Missing: review checklist and pull request template, corrections guide. **Pilot pack: Blocked**, only synthetic fixtures exist, and they are labelled synthetic |
| 6. Security, privacy, performance | Partial | threat model written (`KNOWLEDGE.md`), privacy page updated. No large-pack, low-storage or slow-network tests beyond unit tests of the failure codes |
| 7. Tests and release gates | Partial | 300 Node tests (migrations, provenance rules, licence rules, conflicting evidence, malformed and tampered packs, signature failures, interrupted installs, update and rollback, offline rebuild, empty catalogue, rotation). **Not run:** typecheck, lint, CI, the Android build, any device or emulator test |
| 8. Documentation | Mostly done | README, architecture, privacy, licensing inventory, NOTICE, CLAUDE.md and AGENTS.md, authoring guide, device checklist, release steps all updated. Not written yet: a recovery guide for end users, a contributor guide for reviewers |

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
5. **Hadith, timeline, graph.** Need schema migration 3 and licensed or CC0 data; not started.

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
