# Knowledge model (history, context, sources)

Status: schema (content migration 2), validator, pack installer, surah revelation order (from Tanzil) and the `build-pack` tool. The Library screen, the pack reader and the Surah History / Ayah Context screen exist but are untested on a device. No content packs yet. Product plan: *Tarteel Historical Knowledge System*.

## Idea
Every historical statement is a **claim**. A claim is backed by **source passages** (a locator inside an edition of a work),
carries an **evidence label** and an **editorial status**, and can have text in several languages.
Links between entities are **edges**, and an edge is a claim in its own right: it needs evidence too.
Surah History, Ayah Context, Hadith and the timeline are different views of the same rows, never separate copies.

## Tables (content database)
| Table | Holds |
|---|---|
| `license` | one row per rights decision: `redistribution` is `yes`, `no` or `pending`, plus non-commercial / share-alike flags and the attribution text. Mirrors `docs/licensing/INVENTORY.md` |
| `source_work` / `source_edition` / `source_passage` | work -> edition (has a licence) -> passage (volume, page, chapter, section, report or hadith number; at least one is required). A passage may also hold a `quote` |
| `claim`, `claim_text`, `claim_passage` | the statement, its text per language (`original`, `machine_draft`, `reviewed`), and the passages that `supports` or `contradicts` it |
| `entity_kind`, `edge_type`, `edge`, `edge_passage` | typed links between entities, each with its supporting passages. Kinds and types are lookup rows, so a later phase adds rows instead of rebuilding tables |
| `surah_profile` | revelation order per surah. The order and its source are stored together or not at all |

Entity ids in edges are text: `surah` = `"9"`, `ayah` = `"2:255"` (surah:ayah, like bookmarks and notes), others are their row ids.
There is no foreign key from edges to ayahs: the Quran rows may live in another database file.

## Rules the database enforces
- A `quote` is accepted only when the edition's licence has `redistribution = 'yes'`, and a licence cannot be changed away from `yes` while quotes from its editions exist.
- A claim or edge cannot be inserted as `published`. It is created as draft or approved, its evidence is linked, then it is published.
- Publishing needs a supporting passage (`supports`, not `contradicts`) or a written `editorial_basis`. A claim with label `unverified` cannot be published.
- `disputed` and `no_established_report_found` claims must have an `uncertainty_note`.
- An edge's endpoints must match its type (for example `REPORT_REFERENCES_AYAH` goes from a source passage to an ayah).
- `v_published_claims_without_support` and `v_published_edges_without_support` list rows whose evidence was removed after publication. Both must be empty in a release.

## What is not stored as an edge
`AYAH_BELONGS_TO_SURAH` is `ayahs.surah_id`. `CLAIM_SUPPORTED_BY_PASSAGE` and `CLAIM_CONTRADICTED_BY_PASSAGE` are `claim_passage`. `PASSAGE_CITES_WORK` is the passage -> edition -> work chain.
They keep real foreign keys instead of becoming a second copy.

## Not in this migration (later phases, each a new numbered migration)
Hadith, narrators and narrations, scholarly assessments (grading with its evaluator), events, people, places, timeline dates with precision,
Tafsir passages as entities, FTS over claim text. Each adds `entity_kind` / `edge_type` rows with its tables.

## Validation (`npm run validate:knowledge`)
`validateKnowledgeDb` (in `@tarteel/database`) is the second line behind the triggers. It reports dangling references (`PRAGMA foreign_key_check`),
published claims or edges without evidence, unverified published claims, published claims with no original or reviewed text,
quotations without a licence that permits them, edges that end at nothing or at an unpublished claim, and surah or ayah references that do not exist.
`--release` turns release blockers (pending licences, Quran references that cannot be checked) from warnings into errors.
CI runs it on the database built by `build:db`. A pack is checked against the content database: `--quran <content.db>`.

## Packs (optional downloads)
One signed SQLite file per pack, same schema as `content.db`, stored in the `packages` file area under `knowledge-packs/`.
Code: `packages/database/src/packs.ts`. Ports (network, files, hash, signature check, SQLite opener) are injected, like `packages/audio`.

Manifest: `packId`, `packVersion`, `schemaVersion`, `languages`, `requires`, `publishedAt`, `file` (name, size, sha256), `licenses` (id, name, attribution), `changelog`, `signature`.
The signature is Ed25519 over the manifest without its `signature`, written as sorted-key JSON, so key order never matters.

`installPack` order: manifest check -> https only -> signature -> app schema compatibility -> dependencies -> not older than installed -> download (retries, no retry on 403/404/410, cancel)
-> size and sha256 -> open, check the schema number matches the manifest, migrate to this app's schema, `quick_check`, release validation, every licence in the database declared in the manifest
-> move into place -> write the sidecar manifest -> one registry write (the moment the new version becomes the installed one) -> delete the old version.
Any failure removes the `.part` file and leaves the installed version untouched. If the registry write fails, the new files are removed again.
A crash between the move and the registry write leaves an orphan that `sweepPacks` deletes on the next start.

Other functions: `uninstallPack` (refuses while another pack requires it; never touches bookmarks, notes or the Quran data), `verifyInstalledPack` (missing / corrupt, offer a repair with `allowSameVersion`),
`packStatus` (not-installed, installed, update-available, app-too-old, missing-dependency), `createSqlPackRegistry` (rows in `user.db` `downloads`, kind `knowledge-pack`).
Installed packs are registered in `user.db`, so replacing `content.db` on an app update does not lose them.

The registry stores the sha256 of the file as installed (after migration), which can differ from the manifest hash when the pack was built with an older schema.
Publisher tools live in `scripts/lib/pack-tools.ts` (key generation, signing, a verifier) and `scripts/lib/node-file-store.ts`. The private key is a GitHub Actions secret and never enters the repository.

## Building packs (`npm run build:pack`)
Source format: `data/knowledge/README.md`. Code: `scripts/build-pack/`. For each pack the tool loads and checks the JSON (`source.ts`), builds the SQLite file (`build.ts`),
runs the **release** validation against the content database, and only then writes `<id>.v<version>.db` and `.manifest.json` to `--out`. Nothing is written for a failing pack.
Only published claims and edges, and only the sources they cite, go in. Rows are inserted sorted and migration timestamps are fixed, so the same source gives the same bytes.
Claims are inserted as `approved`, their evidence is linked, then they are published, so the database triggers re-check every rule on every build.
With `TARTEEL_PACK_SIGNING_KEY` the manifest is signed. `--base-url` also writes `catalog.json`. CI builds packs unsigned as a check; `knowledge-packs.yml` signs and publishes a release.

## Surah revelation order
`build:db` reads `quran-data.xml` from the Tanzil source in `data/sources/`, checks it against `SHA256SUMS`, and fills `surah_profile`. The source hash is part of `contentVersion`.

## Library (the app side)
Pure logic: `packages/database/src/pack-library.ts` (`createPackLibrary`: refresh the catalogue, merge it with what is installed, install, repair, remove, startup check; one operation at a time) and `pack-key.ts` (publisher key parsing and the signature port).
Mobile: `apps/mobile/src/knowledge/` (`runtime.ts` builds the ports, `crypto.ts` uses @noble for SHA-256 and Ed25519, `hooks.ts`, `config.json`) and the screen `apps/mobile/app/library.tsx`, opened from Settings.
- **Off by default.** A build offers packs only when `config.json` has an https `catalogUrl` and at least one `publisherKeys` entry (a PEM from `npm run pack:keygen`). `knowledge-config.test.ts` checks the file, and checks that it lists `data/knowledge/PUBLISHER-KEY.pub.pem` once that file exists.
- **No automatic network use.** Opening the Library reads local state only. The pack host is contacted only by "Check for packs" and by Install, Update or Repair. Packs are not verified or hashed at app start, only when the Library opens.
- **Trust.** The catalogue is not signed; each pack manifest is. An entry whose signature does not verify is never shown, and `installPack` checks it again. A tampered catalogue can hide packs, but it cannot make the app install something the publisher did not sign (file size and sha256 are inside the signed manifest), and it cannot downgrade an installed pack.
- A catalogue with an unknown `schema` is refused whole; a bad single entry is skipped.
- Packs show a `title` and `description` per language from the manifest (optional fields in `pack.json`), falling back to English, then to the pack id.

## Reading packs (Surah History, Ayah Context)
Pure logic: `packages/database/src/knowledge-reader.ts` (`createKnowledgeReader`). Mobile: `getReader()` in `apps/mobile/src/knowledge/runtime.ts`, hooks in `hooks.ts`, the screen `apps/mobile/app/history/[id].tsx` (`?ayah=N` adds the ayah's context), and entry points on the reading screen: a "History and context" button when the installed packs hold anything for the surah, and a "Context" link on each ayah that has something.
- **No ATTACH.** Each installed pack keeps its own connection and is asked directly. Edges name surahs and ayahs as text ids, so no query needs the Quran tables, and a damaged pack cannot affect the content database or the other packs. (This replaces the earlier plan to `ATTACH` packs.)
- **What is shown.** Claims linked by a published `CLAIM_CONCERNS_SURAH` / `CLAIM_CONCERNS_AYAH` edge, and for an ayah also the source passages linked by `REPORT_REFERENCES_AYAH` (a report) and `TAFSIR_EXPLAINS_AYAH` (commentary). Only `published` claims and edges are read, even if a pack holds others.
- **Every claim shows its evidence label,** its uncertainty note and editorial note when it has them, its supporting sources and the sources that disagree, each with work, author, edition, locator (volume, page, chapter, section, report or hadith number) and the licence's attribution line. A quotation appears only when the licence says `redistribution = 'yes'`.
- **Text choice.** A person-reviewed text (`original` or `reviewed`) wins over a machine draft, even if that means another language: asked language, then English, then any. A machine draft is used only when nothing reviewed exists, and is labelled "Machine translation, not yet reviewed". Text in a language other than the app's is labelled too.
- The screen ends with a fixed note that these are reports and scholarly views with sources, not rulings.
- A pack that will not open or whose tables are damaged is skipped; the Library screen is where damage is reported and repaired.
- **Source Detail** (`apps/mobile/app/source.tsx`, `reader.sourceDetail`): every citation on the History screen opens the work, edition (editor, publisher, year, identifier, address as text only, transcription status), the licence with its flags and credit line, the passages that claims cite, and the claims citing that edition. It makes no network request.
- **Trust at read time.** A pack is opened only if `isPackTrusted` passes: its stored manifest is the manifest of this pack and version and its signature verifies against the keys in `config.json`. Removing a key from the app therefore hides everything that key signed (`untrusted` in the Library, with a message), and a replaced or edited manifest does the same. Checked once per install record, not per question.
- Revelation order comes from `repos.quran.getSurahProfile` (the content database), shown with the surah heading.

## Releasing packs
1. `npm run pack:keygen` once. Private key -> repository secret `TARTEEL_PACK_SIGNING_KEY`. Public key -> `data/knowledge/PUBLISHER-KEY.pub.pem` (commit).
2. Tag `packs-YYYY.MM.DD` (or run the workflow by hand). `.github/workflows/knowledge-packs.yml` builds the packs, signs them, creates that release, and also uploads `catalog.json` to a second release tagged `catalog-latest`. That asset is the one fixed catalogue address: `https://github.com/<owner>/<repo>/releases/download/catalog-latest/catalog.json`. (The tag is deliberately not `packs-*`, so creating it does not start the workflow again.)
3. `npm run pack:configure -- --catalog-url <that address>` writes `apps/mobile/src/knowledge/config.json` from the committed public key. Commit it, then ship an app build. `npm run pack:configure -- --catalog-url <address> --check` fails when the file is out of date.
4. Key rotation: ship an app that trusts both keys (`--key old.pem --key new.pem`), then sign new packs with the new key, then drop the old key in a later app.
Before the first real release, run `docs/testing/KNOWLEDGE-DEVICE-CHECKLIST.md` with `npm run pack:demo` (synthetic packs and a throwaway key; never commit that config).

## Threat model (what is defended, what is not)
| Threat | Control | Status |
|---|---|---|
| Malformed or hostile pack file | manifest schema, https only, Ed25519 signature, size and sha256, SQLite `quick_check`, release validation (triggers + validator), migration to this app's schema, install via `.part` then move | implemented, tested |
| Path traversal | pack ids and file names are pattern-checked; `FileStore` rejects unsafe relative paths | implemented, tested |
| Catalogue manipulation | each manifest is signed, so a catalogue cannot make the app install what the publisher did not sign; size and hash are inside the signed manifest | implemented. **Gap:** the catalogue itself is unsigned, so it can hide packs, and can offer an older, validly signed version to an app that has none installed yet |
| Replay or downgrade | an installed pack is never replaced by an older or equal version (`not-newer`) | implemented. Fresh installs have no such protection (see above); a signed catalogue with a minimum version per pack would close it |
| Key compromise or rotation | the app trusts a list of keys; ship both keys during a rotation, then drop the old one; installed packs signed by a removed key are hidden | implemented, tested. **Gap:** an offline app cannot learn of a revocation before its next update |
| Oversized or endless download | the manifest caps the size (256 MB) and the download is checked against it | **Gap:** the whole response is buffered in memory before the size check (no streaming, no `Content-Length` pre-check), which is hard on low-memory phones |
| Corrupted database | hash check on install and in the Library, `quick_check`, per-pack connections so one bad pack cannot affect the others | implemented, tested |
| Interrupted update | `.part` file, atomic move, one registry write, orphan sweep, last-known-good stays until the new version passes every check | implemented, tested |
| Privacy | no request unless the person taps a button; no identifiers or analytics; user data never in packs | implemented; see `docs/privacy/README.md` |

## Decisions taken
- Packs are separate SQLite files, each opened on its own connection (see "Reading packs"). The core bundle stays in `content.db`.
- Foreign keys are not relied on at runtime: the Node test driver enables them, the app drivers have not been checked, and the validator runs `PRAGMA foreign_key_check` on every pack.
- `contentVersion` in `content-version.json` now includes the schema version, so a migration that adds tables reaches devices that already hold an older `content.db`.
- Fixtures: tests use clearly synthetic text only (`CLAUDE.md`).

## Not done yet
- Testing the mobile adapter on a device (the `expo-sqlite` open-by-path call, file moves, the @noble imports under Metro). Not built: search over claim text, linking from a claim to the other claims that cite the same source, an "explain this label" help screen. Resumable downloads (HTTP Range) and download progress.
- The release workflow `.github/workflows/knowledge-packs.yml` has not been run yet (it needs the `TARTEEL_PACK_SIGNING_KEY` secret and a first pack).
- The `catalog-latest` step of the release workflow has not run yet. The real publisher key and catalogue address are still to be generated and committed with `pack:configure`.
