/**
 * Turns Wikidata's `wbgetentities` answer into DRAFT entities in the entities.json format. Wikidata's structured data is CC0
 * (no credit required), but nothing here is ever published by itself: every record is `draft` + `unverified`, its names are
 * `machine_draft` (never counted as reviewed), and a person must source and review it before it can ship in a pack.
 *
 * Which items to ask for, and what KIND each is, is decided by a person in seeds.json. This code never searches, never guesses a
 * kind, and never writes a Wikidata id it was not given. Dates are written no more exactly than Wikidata states them.
 */

export const ENTITY_KINDS = ["event", "person", "place"] as const;
export type Kind = (typeof ENTITY_KINDS)[number];
const SUBTYPES: Record<Kind, readonly string[]> = {
  event: ["revelation", "migration", "battle", "treaty", "birth", "death", "gathering", "other"],
  person: ["prophet", "companion", "family", "scholar", "ruler", "other"],
  place: ["city", "region", "mountain", "building", "water", "other"],
};
export const LANGS = ["en", "ar", "bn"] as const;
const QID = /^Q[1-9]\d{0,12}$/;

export interface Seed { qid: string; kind: Kind; subtype?: string; note?: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads seeds.json: `{ "items": [{ "qid": "Q…", "kind": "person", "subtype": "companion" }] }`. Throws with the reason on any mistake. */
export function parseSeeds(json: unknown): Seed[] {
  if (!isObj(json) || !Array.isArray(json.items)) throw new Error('seeds.json: expected { "items": [ … ] }');
  const seen = new Set<string>();
  return json.items.map((v, i): Seed => {
    const where = `seeds.json items[${i}]`;
    if (!isObj(v)) throw new Error(`${where}: expected an object`);
    const qid = typeof v.qid === "string" ? v.qid.trim() : "";
    if (!QID.test(qid)) throw new Error(`${where}: "qid" must look like Q123`);
    if (seen.has(qid)) throw new Error(`${where}: ${qid} is listed twice`);
    seen.add(qid);
    const kind = ENTITY_KINDS.find((k) => k === v.kind);
    if (!kind) throw new Error(`${where}: "kind" must be one of ${ENTITY_KINDS.join(", ")}`);
    const subtype = typeof v.subtype === "string" ? v.subtype : undefined;
    if (subtype !== undefined && !SUBTYPES[kind].includes(subtype)) throw new Error(`${where}: subtype "${subtype}" is not one of ${SUBTYPES[kind].join(", ")} for a ${kind}`);
    return { qid, kind, ...(subtype ? { subtype } : {}), ...(typeof v.note === "string" && v.note.trim() ? { note: v.note.trim() } : {}) };
  });
}

// ------------------------------------------------------------------- dates

export interface DraftDate { calendar: "ce"; start: number; end?: number; precision: "year" | "decade" | "century" | "approximate"; note: string }
interface Moment { year: number; precision: DraftDate["precision"]; julian: boolean }

/** One Wikidata time value as a year at the stated precision; null where Wikidata is vaguer than a century or the value is unusable. */
function moment(value: unknown, approximate: boolean): Moment | null {
  if (!isObj(value)) return null;
  const m = /^([+-])(\d{1,11})-/.exec(typeof value.time === "string" ? value.time : "");
  const p = typeof value.precision === "number" ? value.precision : NaN;
  if (!m || !Number.isInteger(p) || p < 7) return null;
  const y = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  if (!Number.isInteger(y) || y < -5000 || y > 3000) return null;
  const cal = typeof value.calendarmodel === "string" ? value.calendarmodel.split("/").pop() ?? "" : "";
  const precision: DraftDate["precision"] = approximate ? "approximate" : p === 7 ? "century" : p === 8 ? "decade" : "year";
  return { year: precision === "decade" ? Math.floor(y / 10) * 10 : y, precision, julian: cal === "Q1985786" };
}

interface Statement { rank?: unknown; mainsnak?: unknown; qualifiers?: unknown }

/** The usable statements of a property: best rank only, deprecated ones never. */
function best(claims: unknown, prop: string): Statement[] {
  const list = isObj(claims) && Array.isArray(claims[prop]) ? (claims[prop] as unknown[]).filter((s): s is Statement => isObj(s)) : [];
  const live = list.filter((s) => s.rank !== "deprecated");
  const preferred = live.filter((s) => s.rank === "preferred");
  return preferred.length > 0 ? preferred : live;
}

/** The value of a statement's main snak, or undefined for "no value" / "unknown value". */
function timeOf(s: Statement): { value: unknown; approx: boolean } | undefined {
  const snak = isObj(s.mainsnak) ? s.mainsnak : null;
  if (!snak || snak.snaktype !== "value" || !isObj(snak.datavalue)) return undefined;
  // A "sourcing circumstances" qualifier (P1480, e.g. "circa") means Wikidata itself says the date is uncertain.
  const approx = isObj(s.qualifiers) && Array.isArray(s.qualifiers.P1480) && s.qualifiers.P1480.length > 0;
  return { value: snak.datavalue.value, approx };
}

/** One date from one property, or a reason it was left out (several different values, or none usable). */
function single(claims: unknown, prop: string): { moment: Moment } | { skip: string } | null {
  const found = best(claims, prop);
  if (found.length === 0) return null;
  const moments = found.flatMap((s) => {
    const t = timeOf(s);
    const mo = t ? moment(t.value, t.approx) : null;
    return mo ? [mo] : [];
  });
  if (moments.length === 0) return { skip: `${prop} has no usable value` };
  const first = moments[0]!;
  if (moments.some((x) => x.year !== first.year || x.precision !== first.precision)) return { skip: `${prop} lists several different dates` };
  return { moment: first };
}

function dateFor(kind: Kind, claims: unknown): { date?: DraftDate; notes: string[] } {
  const notes: string[] = [];
  if (kind === "place") return { notes };
  const props = kind === "person" ? { start: "P569", end: "P570" } : { start: "P580", end: "P582", point: "P585" };
  const pick = (p: string | undefined) => {
    if (!p) return null;
    const r = single(claims, p);
    if (r && "skip" in r) notes.push(r.skip);
    return r && "moment" in r ? r.moment : null;
  };
  const point = pick("point" in props ? props.point : undefined);
  const a = point ?? pick(props.start);
  const b = point ? null : pick(props.end);
  if (!a) return { notes };
  const end = b && b.year >= a.year ? b : null;
  if (b && !end) notes.push("the end date is before the start date, so it was left out");
  const precision = end && end.precision !== a.precision ? "approximate" : a.precision;
  const calendars = [...new Set([a, ...(end ? [end] : [])].map((x) => (x.julian ? "Julian" : "Gregorian")))];
  const date: DraftDate = { calendar: "ce", start: a.year, ...(end && end.year !== a.year ? { end: end.year } : {}), precision, note: `As stated on Wikidata (${calendars.join(" and ")} calendar). Not checked against a source.` };
  return { date, notes };
}

// ------------------------------------------------------------------- the record

export interface DraftEntity {
  id: string; kind: Kind; subtype?: string; evidenceLabel: "unverified"; editorialStatus: "draft"; createdBy: "wikidata-import";
  editorialBasis: string; date?: DraftDate; text: Record<string, { name: string; summary?: string; status: "machine_draft" }>; supports: [];
}

const label = (o: unknown, lang: string): string | undefined => {
  const v = isObj(o) && isObj(o[lang]) ? (o[lang] as Obj).value : undefined;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

/** The draft id for an item: stable, and carrying the Wikidata id so a person can always trace it. */
export const draftId = (qid: string): string => `wd-${qid.toLowerCase()}`;

export interface Converted { drafts: DraftEntity[]; problems: string[] }

/**
 * @param answer the parsed JSON of `action=wbgetentities&props=labels|descriptions|claims|info`
 * @param seeds  what was asked for
 * @param retrieved the date of the request (YYYY-MM-DD), recorded in each record's editorial basis
 */
export function convert(answer: unknown, seeds: readonly Seed[], retrieved: string): Converted {
  const problems: string[] = [];
  const drafts: DraftEntity[] = [];
  const top: Obj = isObj(answer) ? answer : {};
  const entities = isObj(top.entities) ? top.entities : null;
  if (!entities) return { drafts, problems: ["the answer has no entities"] };
  // An item that was merged into another comes back under the new id; follow it so the record names the item Wikidata now uses.
  const redirects = new Map<string, string>();
  if (isObj(top.redirects))
    for (const [from, to] of Object.entries(top.redirects)) {
      if (typeof to === "string") redirects.set(from, to);
      else if (isObj(to) && typeof to.to === "string") redirects.set(from, to.to);
    }
  for (const seed of seeds) {
    const e = entities[seed.qid] ?? entities[redirects.get(seed.qid) ?? ""];
    // wbgetentities may also report the merge inside the entity itself.
    if (isObj(e) && isObj(e.redirects) && typeof e.redirects.to === "string") redirects.set(seed.qid, e.redirects.to);
    if (!isObj(e) || "missing" in e) {
      problems.push(`${seed.qid}: not found on Wikidata (deleted or never existed)`);
      continue;
    }
    const text: DraftEntity["text"] = {};
    for (const lang of LANGS) {
      const name = label(e.labels, lang);
      if (!name) continue;
      const summary = label(e.descriptions, lang);
      text[lang] = { name, ...(summary ? { summary } : {}), status: "machine_draft" };
    }
    if (Object.keys(text).length === 0) {
      problems.push(`${seed.qid}: has no name in ${LANGS.join(", ")}`);
      continue;
    }
    const { date, notes } = dateFor(seed.kind, e.claims);
    const rev = typeof e.lastrevid === "number" ? `, revision ${e.lastrevid}` : "";
    const into = redirects.has(seed.qid) ? ` (merged into ${redirects.get(seed.qid)})` : "";
    const basis = [`Imported from Wikidata ${seed.qid}${into} on ${retrieved}${rev} (CC0). Not reviewed by Tarteel editors; find a source before publishing.`, ...(seed.note ? [seed.note] : []), ...notes.map((n) => `Date left out: ${n}.`)].join(" ");
    drafts.push({ id: draftId(seed.qid), kind: seed.kind, ...(seed.subtype ? { subtype: seed.subtype } : {}), evidenceLabel: "unverified", editorialStatus: "draft", createdBy: "wikidata-import", editorialBasis: basis, ...(date ? { date } : {}), text, supports: [] });
  }
  return { drafts, problems };
}
