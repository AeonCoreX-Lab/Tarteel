# Wikidata candidates

`seeds.json` is a list a **person** writes: Wikidata item numbers, and what kind each is.

```json
{ "items": [ { "qid": "Q123", "kind": "person", "subtype": "companion", "note": "optional reason" } ] }
```

`npm run sync:wikidata` (or Actions -> Wikidata sync) asks wikidata.org for those items and writes `candidates.json`: draft entities in the `entities.json` format. Wikidata's structured data is CC0.

- Every record is `draft`, `unverified`, with a `machine_draft` name and no source. Nothing ships until a person copies it into a pack, adds a source, and reviews it.
- Dates are as Wikidata states them (Gregorian or Julian), at the stated precision. Where Wikidata lists several different dates the date is left out and the reason is written in `editorialBasis`.
- Item numbers are never guessed. Look each one up on wikidata.org and check it is the right person, place or event before adding it.
- Wikipedia text is a different licence (CC BY-SA) and is never used here.
