# Online Hadith

Status 2026-10-19: two live providers, each with its own build flag and its own opt-in setting. Both tested with invented data only.

| Provider | Flag in `config.json` | Repository build | Person's setting |
|---|---|---|---|
| HadeethEnc.com (IslamHouse), browse by topic, Bengali | `hadeethenc` | **on** | `onlineHadeethEnc`, off by default |
| Sunnah.com via the islamic.app API (everything below this table until "HadeethEnc") | `sunnah` | **off** until Sunnah.com answers | `onlineHadith`, off by default |

## Why it is online
A full hadith collection is large and no source was found that may be bundled or cached without asking (see `docs/licensing/INVENTORY.md`). The app therefore does not ship hadith. It can look them up live, once the person agrees.

## Source
The islamic.app API (`https://api.islamic.app/v1/hadith/...`, no key, documented limit 600 requests per minute per IP). It states that its hadith come from Sunnah.com. Its terms allow use "without asking for permission", but Sunnah.com's own pages forbid scraping and mass reproduction, and the islamic.app attributions page says its copy is collected by a scraper. That conflict is **not resolved**. That is why the feature ships off, and why nothing is ever stored: a lookup shows one hadith to one person, as the Sunnah.com About page allows for individual hadith.

## Switches
1. Build: `apps/mobile/src/hadith/config.json` `"sunnah": false`. With `false` there is no screen, no setting, no entry in the Knowledge tab and no request.
2. Person: Settings, "Online hadith", off by default (preference `onlineHadith`). Opening any hadith screen while it is off shows only the consent card, which names api.islamic.app and says what the service can see.

## Code
- `packages/core/src/hadith.ts`: the client. Pure TypeScript; the network is a port (`HadithHttp`). Strict parsing, reads only plain `text` fields (never the HTML `body`), validates every path segment before building a URL, caps the body at 2,000,000 characters, spaces requests at least 150 ms apart, keeps a 10-minute in-memory cache of at most 120 answers (never on disk), and reports typed errors (`network`, `timeout`, `rate-limited` with Retry-After, `not-found`, `bad-request`, `bad-response`, `server`, `cancelled`). Search snippets are reduced to `<mark>` segments; any other tag is dropped.
- `apps/mobile/src/hadith/`: `runtime.ts` (flag, `fetch` with a deadline, User-Agent naming Tarteel), `hooks.ts` (loading, error, retry, cancel on leave), `parts.tsx` (credit, consent, gate, error card, snippet).
- Screens: `app/hadith/index.tsx`, `app/hadith/[collection].tsx` (books, or hadith of a book with "show more"), `app/hadith/view.tsx`.
- Tests: `packages/core/test/hadith.test.ts`, invented fixtures only. No real hadith text is in this repository.

## What every screen shows
The credit ("Sunnah.com, through the islamic.app API"), and that Tarteel has not reviewed it and that it is not part of the installed packs. On a hadith: Arabic text, English translation (labelled as given by Sunnah.com), grading with the grader's name or "grader not named" and a note that Tarteel has not checked it, and a note that the chain of narrators is not included. Bengali text does not exist in this source; the Bengali UI says so.

## Not done, on purpose
- No offline copy, no favourites or notes on hadith (that would store the text).
- No narrator or chain data: the API has none.
- No Sunnah.com link for collections whose Sunnah.com address is not known; the app never guesses a link.

## Before switching it on
Sunnah.com should have answered the open request (GitHub issue for API access). Then set the flag to `true`, run the "Online Hadith" device checklist, and update `INVENTORY.md`.

## HadeethEnc (enabled)
- **Source:** `https://hadeethenc.com/api/v1/` (no key). Terms read 2026-10-19: show the content unchanged, credit HadeethEnc.com clearly. Silent on storing, so nothing is stored.
- **Client:** `packages/core/src/hadeethenc.ts`. Same network port and error type as the other client. Categories (`categories/list`), a category's hadith (`hadeeths/list`, paged), one hadith (`hadeeths/one`). Texts are kept exactly as sent (not trimmed or rewritten); a field is either a string or null. Paging numbers may arrive as strings or numbers and are read either way. 250 ms between requests, 10-minute in-memory cache, body capped at 2,000,000 characters. Language is the app's (`en`, `bn`, `ar`); anything else asks for English.
- **No search:** the API has none, so the screens are browse-only (topics, subtopics, list, hadith).
- **Screens:** `app/hadeeth/index.tsx` (topics), `category.tsx` (subtopics and a paged list), `view.tsx`. Each shows the credit and "not reviewed by Tarteel". A hadith shows: title, Arabic original, translation (or a note that none exists in the person's language), source of the report, the grade with a note that the publisher names no grader, explanation, lessons, and Arabic word meanings when given. "Open on HadeethEnc.com" is built from a checked number only.
- **Tests:** `packages/core/test/hadeethenc.test.ts`, invented fixtures only.
- **Before packs:** ask IslamHouse in writing. Until then, no offline copy.
