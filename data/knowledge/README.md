# Knowledge packs: source format

One directory per pack: `data/knowledge/<pack-id>/`. Everything in it is plain JSON, written and reviewed by people in pull requests.
`npm run build:pack` turns it into a signed SQLite file (see `docs/architecture/KNOWLEDGE.md`). Nothing here is Quran text:
claims are *about* the Quran and cite *sources*. Never copy a source's text unless its licence row says `redistribution: "yes"`.

Directories whose name starts with `_` or `.` are **not packs** and are skipped by `build:pack`. `data/knowledge/_incoming/` is the
staging area for raw third-party material (keep its `LICENSE.md` next to it) until someone turns it into a real pack directory.

Generated packs: `data/knowledge/asbab-wahidi/` is written by `npm run import:quranpedia` from `_incoming/quranpedia/` (al-Wahidi's
*Asbab al-Nuzul*, as digitised by Quranpedia.net). It holds source passages and `REPORT_REFERENCES_AYAH` links only, no claims, and its
`PROVENANCE.md` says what was converted. Change the importer and re-run it rather than editing that pack by hand.
There is no automatic download of Quranpedia's dump any more: Quranpedia is read live in the app (see `docs/architecture/ONLINE-SOURCES.md`). This pack is the copy that was imported on 2026-10-16 and stays as it is unless a person re-runs the importer by hand on a newer dump.

A complete synthetic example (no real religious content) is in `tests/fixtures/knowledge/example-pack/`.

## Files
| File | Required | Holds |
|---|---|---|
| `pack.json` | yes | `packId` (same as the directory), `packVersion` (integer, raise it on every release), `languages`, `requires` (`[{packId, minVersion}]`), `publishedAt`, `changelog`; optional `title` and `description`, each `{ "en": "...", "bn": "..." }`, shown in the app's Library |
| `licenses.json` | yes | array of rights decisions: `id`, `name`, `redistribution` (`yes` / `no` / `pending`), `nonCommercialOnly`, `shareAlike`, `attribution`, optional `url`, `termsNote`, `inventoryRef` |
| `sources.json` | yes | `{ works, editions, passages }`. A passage is a locator (volume, page, chapter, section, report or hadith number: at least one), plus an optional `quote` |
| `claims.json` | yes | array of statements: `claimType`, `evidenceLabel`, `editorialStatus`, `createdBy`, `text` per language, `supports` and `contradicts` (passage ids) |
| `edges.json` | no | typed links: `REPORT_REFERENCES_AYAH`, `TAFSIR_EXPLAINS_AYAH` (passage -> ayah), `CLAIM_CONCERNS_AYAH`, `CLAIM_CONCERNS_SURAH` (claim -> ayah / surah); with `entities.json`: `EVENT_CONCERNS_AYAH`, `EVENT_CONCERNS_SURAH`, `PERSON_MENTIONED_IN_AYAH`, `PLACE_MENTIONED_IN_AYAH`, `EVENT_AT_PLACE`, `PERSON_IN_EVENT`, `CLAIM_CONCERNS_EVENT`, `CLAIM_CONCERNS_PERSON`, `CLAIM_CONCERNS_PLACE`. Use `fromKind` / `toKind` `event`, `person` or `place` and the entity's id |
| `entities.json` | no | events, people and places (see below) |

### entities.json
```json
{
  "id": "ev-example", "kind": "event", "subtype": "battle",
  "evidenceLabel": "source_reported", "editorialStatus": "published", "createdBy": "your-name",
  "uncertaintyNote": "needed for disputed / no_established_report_found",
  "editorialBasis": "or list passage ids in supports",
  "date": { "calendar": "ah", "start": 2, "end": 3, "precision": "year", "note": "why this date" },
  "text": { "en": { "name": "...", "summary": "optional, one short neutral paragraph", "status": "original" } },
  "supports": ["passage-id"]
}
```
- `kind`: `event`, `person`, `place`. `subtype` (optional) is one of: event `revelation migration battle treaty birth death gathering other`; person `prophet companion family scholar ruler other`; place `city region mountain building water other`.
- `date` is optional (leave it out when unknown; a place never has one). **Write the date as exactly as the source does, no more.** `precision`: `year` (a year or a span of years), `decade` (give the first year, e.g. 620), `century` (give any year in it), `approximate`. `calendar`: `ah` or `ce`. For a person, `start` is the birth and `end` the death. Do not convert Hijri to Gregorian yourself; the build works out an approximate year for ordering only.
- Same rules as claims: published needs `supports` or an `editorialBasis`, label other than `unverified`, and a name that is `original` or `reviewed`. Ids share one namespace across the three kinds.
- Do not invent dates, people, places or events. If a fact has no source yet, it stays a draft.

Ids are lower-case (`a-z 0-9 . _ : -`). Ayah ids are `"surah:ayah"` (`"2:255"`), surah ids are `"9"`.

## Rules (the build refuses a pack that breaks them)
- Only `editorialStatus: "published"` claims and edges ship. Drafts, `needs_*` and `retracted` stay in git. Retracting a claim in the next version removes it from every device on update.
- A published claim needs a supporting passage **or** a written `editorialBasis`. Label `unverified` cannot be published. `disputed` and `no_established_report_found` need an `uncertaintyNote`.
- Every claim has text in at least one language that is `original` or `reviewed`. Machine translations are allowed as `machine_draft` but are reported as warnings; they are never the only text.
- A `quote` needs an edition whose licence has `redistribution: "yes"`. For anything else cite the locator only (volume, page, number) and write the claim in your own words.
- A release build fails on any licence with `redistribution: "pending"` that ships, and on any surah or ayah reference it cannot check against the Quran database.
- Every new source or licence also needs a row in `docs/licensing/INVENTORY.md` in the same pull request (`inventoryRef`).
- Do not invent sources, page numbers, rulings or translations. If a fact has no source yet, it stays a draft.

## Commands
```
npm run build:db -- --out build/db                      # content database used to check surah/ayah references
npm run build:pack -- --quran build/db/quran.db         # build and release-check every pack (unsigned unless the key is set)
npm run build:pack -- my-pack --out /tmp/packs          # one pack
npm run import:quranpedia                               # (re)generate the asbab-wahidi pack from data/knowledge/_incoming/quranpedia
npm run pack:keygen                                     # new signing key pair (prints, writes nothing)
npm run pack:configure -- --catalog-url <https://.../catalog.json>   # write the app's catalogue address and trusted key
npm run pack:demo -- --base-url <https://.../>          # throwaway synthetic packs for the device checklist (docs/testing/)
```
Signing: set `TARTEEL_PACK_SIGNING_KEY` (Ed25519 private key, PEM) as an environment variable or GitHub Actions secret. Commit only the **public** key as `data/knowledge/PUBLISHER-KEY.pub.pem`.
Add `--base-url https://.../` to also write `catalog.json` listing the signed packs.

## Loader error codes
`source-unreadable` (file missing or not JSON), `source-shape` (wrong type or missing field), `source-field` (value not allowed),
`source-duplicate` (id used twice), `source-reference` (id points at nothing), `source-licence` (licence rule broken),
`source-publish` (publishing rule broken), `source-missing` (required file absent). The message names the file and the id.

## Wikidata drafts
`npm run sync:wikidata` turns a person-made list (`_incoming/wikidata/seeds.json`) into draft entities (`_incoming/wikidata/candidates.json`). They are `draft`, `unverified`, with `machine_draft` names; nothing ships until a person copies one into a pack, adds a source and reviews it. See `_incoming/wikidata/README.md`.
