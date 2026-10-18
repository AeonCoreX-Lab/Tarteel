# Online Hadith

Status 2026-10-18: built, tested with invented data, **switched off** in the repository build.

## Why it is online
A full hadith collection is large and no source was found that may be bundled or cached without asking (see `docs/licensing/INVENTORY.md`). The app therefore does not ship hadith. It can look them up live, once the person agrees.

## Source
The islamic.app API (`https://api.islamic.app/v1/hadith/...`, no key, documented limit 600 requests per minute per IP). It states that its hadith come from Sunnah.com. Its terms allow use "without asking for permission", but Sunnah.com's own pages forbid scraping and mass reproduction, and the islamic.app attributions page says its copy is collected by a scraper. That conflict is **not resolved**. That is why the feature ships off, and why nothing is ever stored: a lookup shows one hadith to one person, as the Sunnah.com About page allows for individual hadith.

## Switches
1. Build: `apps/mobile/src/hadith/config.json` `{"enabled": false}`. With `false` there is no screen, no setting, no entry in the Knowledge tab and no request.
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
