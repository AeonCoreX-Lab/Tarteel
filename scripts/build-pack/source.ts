import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CONTENT_MIGRATIONS, MAX_DESCRIPTION, MAX_TITLE, migrate } from "@tarteel/database";
import type { Issue } from "@tarteel/quran-data";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";

// The reviewed source of one knowledge pack: plain JSON files in data/knowledge/<pack-id>/, written and reviewed by people
// in pull requests. This module reads them and checks everything it can WITHOUT a database, so the message names the file and
// the id. The database (triggers) and `validateKnowledgeDb` stay the final authority. Format: data/knowledge/README.md.
//
//   pack.json       identity, version, languages, dependencies, changelog, optional title / description per language
//   licenses.json   one rights decision per source edition licence (mirrors docs/licensing/INVENTORY.md)
//   sources.json    { works, editions, passages }: what the claims cite
//   claims.json     the statements, with their text per language and the passages that support or contradict them
//   edges.json      (optional) typed links between claims, passages, surahs, ayahs and entities
//   entities.json   (optional) events, people and places, with dates as exact as the source and no more

export const WORK_TYPES = ["asbab", "tafsir", "hadith", "history", "biography", "reference", "scholarship", "other"] as const;
export const TRANSCRIPTION_STATUSES = ["verified", "unverified", "ocr_unverified"] as const;
export const CLAIM_TYPES = ["direct_textual_report", "historical_report", "scholarly_interpretation", "editorial_synthesis", "modern_analysis"] as const;
export const EVIDENCE_LABELS = ["primary_text", "source_reported", "scholarly_interpretation", "disputed", "unverified", "no_established_report_found"] as const;
export const EDITORIAL_STATUSES = ["draft", "ingested", "needs_source_verification", "needs_scholarly_review", "needs_license_review", "approved", "published", "needs_correction", "retracted"] as const;
export const TEXT_STATUSES = ["original", "machine_draft", "reviewed"] as const;
export const REDISTRIBUTIONS = ["yes", "no", "pending"] as const;
export const ENTITY_KINDS = ["event", "person", "place"] as const;
/** The subtypes each kind may carry; the database enforces the same lists. */
export const ENTITY_SUBTYPES: Readonly<Record<(typeof ENTITY_KINDS)[number], readonly string[]>> = {
  event: ["revelation", "migration", "battle", "treaty", "birth", "death", "gathering", "other"],
  person: ["prophet", "companion", "family", "scholar", "ruler", "other"],
  place: ["city", "region", "mountain", "building", "water", "other"],
};
export const DATE_CALENDARS = ["ah", "ce"] as const;
export const DATED_PRECISIONS = ["year", "decade", "century", "approximate"] as const;

export interface PackMeta {
  packId: string;
  packVersion: number;
  languages: string[];
  requires: { packId: string; minVersion: number }[];
  publishedAt: string;
  changelog: string;
  title?: Record<string, string>;
  description?: Record<string, string>;
}
export interface SourceLicense {
  id: string; name: string; url?: string; redistribution: (typeof REDISTRIBUTIONS)[number];
  nonCommercialOnly: boolean; shareAlike: boolean; attribution: string; termsNote?: string; inventoryRef?: string;
}
export interface SourceWork { id: string; title: string; titleArabic?: string; author?: string; originalLanguage: string; workType: (typeof WORK_TYPES)[number]; subject?: string }
export interface SourceEdition {
  id: string; workId: string; editionLabel: string; editor?: string; publisher?: string; published?: string; identifier?: string; url?: string;
  licenseId: string; transcriptionStatus: (typeof TRANSCRIPTION_STATUSES)[number]; reviewedOn?: string;
}
export interface SourcePassage {
  id: string; editionId: string; volume?: string; page?: string; chapter?: string; section?: string; reportNumber?: string; hadithNumber?: string;
  quote?: string; quoteLanguage?: string;
}
export interface SourceClaimText { text: string; status: (typeof TEXT_STATUSES)[number] }
export interface SourceClaim {
  id: string; claimType: (typeof CLAIM_TYPES)[number]; evidenceLabel: (typeof EVIDENCE_LABELS)[number]; uncertaintyNote?: string; editorialBasis?: string;
  editorialStatus: (typeof EDITORIAL_STATUSES)[number]; createdBy: string; reviewedBy?: string; lastReviewedAt?: string;
  text: Record<string, SourceClaimText>; supports: string[]; contradicts: string[];
}
export interface SourceEdge {
  id: string; type: string; fromKind: string; fromId: string; toKind: string; toId: string; editorialStatus: (typeof EDITORIAL_STATUSES)[number];
  uncertaintyNote?: string; editorialBasis?: string; createdBy: string; passages: string[];
}
export interface SourceEntityText { name: string; summary?: string; status: (typeof TEXT_STATUSES)[number] }
/** The date of an entity as the authors give it. Absent means undated. For a person, start is the birth and end the death. */
export interface SourceDate { calendar: (typeof DATE_CALENDARS)[number]; start: number; end?: number; precision: (typeof DATED_PRECISIONS)[number]; note?: string }
export interface SourceEntity {
  id: string; kind: (typeof ENTITY_KINDS)[number]; subtype?: string; evidenceLabel: (typeof EVIDENCE_LABELS)[number]; uncertaintyNote?: string; editorialBasis?: string;
  editorialStatus: (typeof EDITORIAL_STATUSES)[number]; createdBy: string; reviewedBy?: string; lastReviewedAt?: string;
  date?: SourceDate; text: Record<string, SourceEntityText>; supports: string[];
}
export interface PackSource {
  dir: string;
  meta: PackMeta;
  licenses: SourceLicense[];
  works: SourceWork[];
  editions: SourceEdition[];
  passages: SourcePassage[];
  claims: SourceClaim[];
  edges: SourceEdge[];
  entities: SourceEntity[];
}

const ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const PACK_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

let edgeTypes: ReadonlyMap<string, { from: string; to: string }> | null = null;
/** The edge types and their endpoint kinds, read from the schema itself so the loader and the database cannot disagree. */
export async function knownEdgeTypes(): Promise<ReadonlyMap<string, { from: string; to: string }>> {
  if (edgeTypes) return edgeTypes;
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  const rows = await db.all<{ id: string; from_kind: string; to_kind: string }>("SELECT id, from_kind, to_kind FROM edge_type");
  await db.close();
  edgeTypes = new Map(rows.map((r) => [r.id, { from: r.from_kind, to: r.to_kind }]));
  return edgeTypes;
}

class Reader {
  issues: Issue[] = [];
  err(code: string, message: string): void {
    this.issues.push({ severity: "error", code, message });
  }
  obj(v: unknown, ctx: string): Rec | null {
    if (isRec(v)) return v;
    this.err("source-shape", `${ctx}: expected an object`);
    return null;
  }
  list(v: unknown, ctx: string): unknown[] {
    if (Array.isArray(v)) return v;
    this.err("source-shape", `${ctx}: expected a list`);
    return [];
  }
  str(o: Rec, key: string, ctx: string): string | undefined {
    const v = o[key];
    if (typeof v === "string" && v.trim().length > 0) return v;
    this.err("source-field", `${ctx}: "${key}" is required and must be non-empty text`);
    return undefined;
  }
  optStr(o: Rec, key: string, ctx: string): string | undefined {
    const v = o[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim().length > 0) return v;
    this.err("source-field", `${ctx}: "${key}" must be non-empty text when present`);
    return undefined;
  }
  id(o: Rec, key: string, ctx: string): string | undefined {
    const v = this.str(o, key, ctx);
    if (v !== undefined && !ID.test(v)) {
      this.err("source-field", `${ctx}: "${key}" (${v}) must match ${String(ID)}`);
      return undefined;
    }
    return v;
  }
  one<T extends string>(o: Rec, key: string, ctx: string, allowed: readonly T[]): T | undefined {
    const v = o[key];
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
    this.err("source-field", `${ctx}: "${key}" must be one of ${allowed.join(", ")}`);
    return undefined;
  }
  bool(o: Rec, key: string, ctx: string): boolean {
    const v = o[key];
    if (v === undefined) return false;
    if (typeof v === "boolean") return v;
    this.err("source-field", `${ctx}: "${key}" must be true or false`);
    return false;
  }
  ids(o: Rec, key: string, ctx: string): string[] {
    const v = o[key];
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && ID.test(x))) {
      this.err("source-field", `${ctx}: "${key}" must be a list of ids`);
      return [];
    }
    return v as string[];
  }
}

async function readJson(dir: string, name: string, required: boolean, r: Reader): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(join(dir, name), "utf8");
  } catch {
    if (required) r.err("source-missing", `${join(dir, name)} is required`);
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    r.err("source-unreadable", `${join(dir, name)} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** Reads and checks one pack directory. `source` is null when anything is wrong; every problem is in `issues`. */
export async function loadPackSource(dir: string): Promise<{ source: PackSource | null; issues: Issue[] }> {
  const r = new Reader();
  const [metaRaw, licRaw, srcRaw, claimRaw, edgeRaw, entityRaw] = [
    await readJson(dir, "pack.json", true, r), await readJson(dir, "licenses.json", true, r), await readJson(dir, "sources.json", true, r),
    await readJson(dir, "claims.json", true, r), await readJson(dir, "edges.json", false, r), await readJson(dir, "entities.json", false, r),
  ];
  if (r.issues.length > 0) return { source: null, issues: r.issues };
  const types = await knownEdgeTypes();

  // pack.json
  const meta = ((): PackMeta | null => {
    const o = r.obj(metaRaw, "pack.json");
    if (!o) return null;
    const packId = r.str(o, "packId", "pack.json");
    if (packId !== undefined && !PACK_ID.test(packId)) r.err("source-field", `pack.json: packId (${packId}) must match ${String(PACK_ID)}`);
    if (packId !== undefined && packId !== basename(dir)) r.err("source-field", `pack.json: packId (${packId}) must equal the directory name (${basename(dir)})`);
    const version = o.packVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) r.err("source-field", "pack.json: packVersion must be a whole number >= 1");
    const languages = Array.isArray(o.languages) && o.languages.length > 0 && o.languages.every((l) => typeof l === "string" && LANG.test(l)) ? (o.languages as string[]) : [];
    if (languages.length === 0) r.err("source-field", "pack.json: languages must be a non-empty list of language codes");
    const requires = r.list(o.requires ?? [], "pack.json requires").flatMap((d, i) => {
      const dep = r.obj(d, `pack.json requires[${i}]`);
      if (!dep) return [];
      const id = r.str(dep, "packId", `pack.json requires[${i}]`);
      const min = dep.minVersion;
      if (typeof min !== "number" || !Number.isInteger(min) || min < 1) r.err("source-field", `pack.json requires[${i}]: minVersion must be a whole number >= 1`);
      return id !== undefined && typeof min === "number" ? [{ packId: id, minVersion: min }] : [];
    });
    const publishedAt = r.str(o, "publishedAt", "pack.json");
    if (publishedAt !== undefined && Number.isNaN(Date.parse(publishedAt))) r.err("source-field", "pack.json: publishedAt must be an ISO date");
    const changelog = r.str(o, "changelog", "pack.json");
    const text = (field: "title" | "description", max: number): Record<string, string> | undefined => {
      const v = o[field];
      if (v === undefined) return undefined;
      if (!isRec(v) || Object.keys(v).length === 0 || !Object.entries(v).every(([k, t]) => LANG.test(k) && typeof t === "string" && t.trim().length > 0 && t.length <= max)) {
        r.err("source-field", `pack.json: ${field} must map language codes to text of at most ${max} characters`);
        return undefined;
      }
      return v as Record<string, string>;
    };
    const title = text("title", MAX_TITLE);
    const description = text("description", MAX_DESCRIPTION);
    if (packId === undefined || typeof version !== "number" || publishedAt === undefined || changelog === undefined) return null;
    return { packId, packVersion: version, languages, requires, publishedAt, changelog, ...(title ? { title } : {}), ...(description ? { description } : {}) };
  })();

  // licenses.json
  const licenses = r.list(licRaw, "licenses.json").flatMap((v, i): SourceLicense[] => {
    const ctx = `licenses.json[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const name = r.str(o, "name", ctx);
    const attribution = r.str(o, "attribution", ctx);
    const redistribution = r.one(o, "redistribution", ctx, REDISTRIBUTIONS);
    const nonCommercialOnly = r.bool(o, "nonCommercialOnly", ctx);
    const shareAlike = r.bool(o, "shareAlike", ctx);
    if (!id || !name || !attribution || !redistribution) return [];
    return [{ id, name, attribution, redistribution, nonCommercialOnly, shareAlike, url: r.optStr(o, "url", ctx), termsNote: r.optStr(o, "termsNote", ctx), inventoryRef: r.optStr(o, "inventoryRef", ctx) }];
  });

  // sources.json
  const so = r.obj(srcRaw, "sources.json");
  const works = (so ? r.list(so.works ?? [], "sources.json works") : []).flatMap((v, i): SourceWork[] => {
    const ctx = `sources.json works[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const title = r.str(o, "title", ctx);
    const originalLanguage = r.str(o, "originalLanguage", ctx);
    const workType = r.one(o, "workType", ctx, WORK_TYPES);
    if (!id || !title || !originalLanguage || !workType) return [];
    return [{ id, title, originalLanguage, workType, titleArabic: r.optStr(o, "titleArabic", ctx), author: r.optStr(o, "author", ctx), subject: r.optStr(o, "subject", ctx) }];
  });
  const editions = (so ? r.list(so.editions ?? [], "sources.json editions") : []).flatMap((v, i): SourceEdition[] => {
    const ctx = `sources.json editions[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const workId = r.id(o, "workId", ctx);
    const editionLabel = r.str(o, "editionLabel", ctx);
    const licenseId = r.id(o, "licenseId", ctx);
    const transcriptionStatus = o.transcriptionStatus === undefined ? "unverified" : r.one(o, "transcriptionStatus", ctx, TRANSCRIPTION_STATUSES);
    if (!id || !workId || !editionLabel || !licenseId || !transcriptionStatus) return [];
    return [{
      id, workId, editionLabel, licenseId, transcriptionStatus, editor: r.optStr(o, "editor", ctx), publisher: r.optStr(o, "publisher", ctx),
      published: r.optStr(o, "published", ctx), identifier: r.optStr(o, "identifier", ctx), url: r.optStr(o, "url", ctx), reviewedOn: r.optStr(o, "reviewedOn", ctx),
    }];
  });
  const passages = (so ? r.list(so.passages ?? [], "sources.json passages") : []).flatMap((v, i): SourcePassage[] => {
    const ctx = `sources.json passages[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const editionId = r.id(o, "editionId", ctx);
    const p: SourcePassage = {
      id: id ?? "", editionId: editionId ?? "", volume: r.optStr(o, "volume", ctx), page: r.optStr(o, "page", ctx), chapter: r.optStr(o, "chapter", ctx),
      section: r.optStr(o, "section", ctx), reportNumber: r.optStr(o, "reportNumber", ctx), hadithNumber: r.optStr(o, "hadithNumber", ctx),
      quote: r.optStr(o, "quote", ctx), quoteLanguage: r.optStr(o, "quoteLanguage", ctx),
    };
    if (!p.volume && !p.page && !p.chapter && !p.section && !p.reportNumber && !p.hadithNumber) r.err("source-field", `${ctx} (${p.id}): needs at least one locator (volume, page, chapter, section, reportNumber or hadithNumber)`);
    if ((p.quote === undefined) !== (p.quoteLanguage === undefined)) r.err("source-field", `${ctx} (${p.id}): quote and quoteLanguage go together`);
    return id && editionId ? [p] : [];
  });

  // claims.json
  const claims = r.list(claimRaw, "claims.json").flatMap((v, i): SourceClaim[] => {
    const ctx = `claims.json[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const claimType = r.one(o, "claimType", ctx, CLAIM_TYPES);
    const evidenceLabel = r.one(o, "evidenceLabel", ctx, EVIDENCE_LABELS);
    const editorialStatus = r.one(o, "editorialStatus", ctx, EDITORIAL_STATUSES);
    const createdBy = r.str(o, "createdBy", ctx);
    const text: Record<string, SourceClaimText> = {};
    const t = r.obj(o.text, `${ctx} text`);
    for (const [lang, entry] of Object.entries(t ?? {})) {
      const e = r.obj(entry, `${ctx} text.${lang}`);
      if (!e) continue;
      if (!LANG.test(lang)) r.err("source-field", `${ctx} text: "${lang}" is not a language code`);
      const body = r.str(e, "text", `${ctx} text.${lang}`);
      const status = r.one(e, "status", `${ctx} text.${lang}`, TEXT_STATUSES);
      if (body && status) text[lang] = { text: body, status };
    }
    if (t && Object.keys(t).length === 0) r.err("source-field", `${ctx} (${id ?? "?"}): text needs at least one language`);
    const claim = {
      uncertaintyNote: r.optStr(o, "uncertaintyNote", ctx), editorialBasis: r.optStr(o, "editorialBasis", ctx), reviewedBy: r.optStr(o, "reviewedBy", ctx),
      lastReviewedAt: r.optStr(o, "lastReviewedAt", ctx), supports: r.ids(o, "supports", ctx), contradicts: r.ids(o, "contradicts", ctx),
    };
    if ((evidenceLabel === "disputed" || evidenceLabel === "no_established_report_found") && !claim.uncertaintyNote)
      r.err("source-field", `${ctx} (${id ?? "?"}): a "${evidenceLabel}" claim needs an uncertaintyNote`);
    if (!id || !claimType || !evidenceLabel || !editorialStatus || !createdBy) return [];
    return [{ id, claimType, evidenceLabel, editorialStatus, createdBy, text, ...claim }];
  });

  // entities.json
  const entities = (entityRaw === undefined ? [] : r.list(entityRaw, "entities.json")).flatMap((v, i): SourceEntity[] => {
    const ctx = `entities.json[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const where = `${ctx} (${id ?? "?"})`;
    const kind = r.one(o, "kind", ctx, ENTITY_KINDS);
    const evidenceLabel = r.one(o, "evidenceLabel", ctx, EVIDENCE_LABELS);
    const editorialStatus = r.one(o, "editorialStatus", ctx, EDITORIAL_STATUSES);
    const createdBy = r.str(o, "createdBy", ctx);
    const subtype = r.optStr(o, "subtype", ctx);
    if (kind && subtype !== undefined && !ENTITY_SUBTYPES[kind].includes(subtype)) r.err("source-field", `${where}: subtype "${subtype}" is not one of ${ENTITY_SUBTYPES[kind].join(", ")} for a ${kind}`);

    let date: SourceDate | undefined;
    if (o.date !== undefined) {
      const d = r.obj(o.date, `${where} date`);
      if (d) {
        const calendar = r.one(d, "calendar", `${where} date`, DATE_CALENDARS);
        const precision = r.one(d, "precision", `${where} date`, DATED_PRECISIONS);
        const year = (key: "start" | "end", required: boolean): number | undefined => {
          const x = d[key];
          if (x === undefined && !required) return undefined;
          if (typeof x === "number" && Number.isInteger(x) && x >= -5000 && x <= 3000) return x;
          r.err("source-field", `${where} date: "${key}" must be a whole year between -5000 and 3000`);
          return undefined;
        };
        const start = year("start", true);
        const end = year("end", false);
        if (start !== undefined && end !== undefined && end < start) r.err("source-field", `${where} date: end (${end}) is before start (${start})`);
        if (kind === "place") r.err("source-field", `${where}: a place has no date`);
        const note = r.optStr(d, "note", `${where} date`);
        if (calendar && precision && start !== undefined) date = { calendar, start, precision, ...(end !== undefined ? { end } : {}), ...(note ? { note } : {}) };
      }
    }
    const text: Record<string, SourceEntityText> = {};
    const t = r.obj(o.text, `${where} text`);
    for (const [lang, entry] of Object.entries(t ?? {})) {
      const e = r.obj(entry, `${where} text.${lang}`);
      if (!e) continue;
      if (!LANG.test(lang)) r.err("source-field", `${where} text: "${lang}" is not a language code`);
      const name = r.str(e, "name", `${where} text.${lang}`);
      const summary = r.optStr(e, "summary", `${where} text.${lang}`);
      const status = r.one(e, "status", `${where} text.${lang}`, TEXT_STATUSES);
      if (name && status) text[lang] = { name, status, ...(summary ? { summary } : {}) };
    }
    if (t && Object.keys(t).length === 0) r.err("source-field", `${where}: text needs at least one language`);
    const uncertaintyNote = r.optStr(o, "uncertaintyNote", ctx);
    if ((evidenceLabel === "disputed" || evidenceLabel === "no_established_report_found") && !uncertaintyNote)
      r.err("source-field", `${where}: a "${evidenceLabel}" entity needs an uncertaintyNote`);
    const editorialBasis = r.optStr(o, "editorialBasis", ctx);
    const reviewedBy = r.optStr(o, "reviewedBy", ctx);
    const lastReviewedAt = r.optStr(o, "lastReviewedAt", ctx);
    if (!id || !kind || !evidenceLabel || !editorialStatus || !createdBy) return [];
    return [{
      id, kind, evidenceLabel, editorialStatus, createdBy, text, supports: r.ids(o, "supports", ctx),
      ...(subtype ? { subtype } : {}), ...(uncertaintyNote ? { uncertaintyNote } : {}), ...(editorialBasis ? { editorialBasis } : {}),
      ...(reviewedBy ? { reviewedBy } : {}), ...(lastReviewedAt ? { lastReviewedAt } : {}), ...(date ? { date } : {}),
    }];
  });

  // edges.json
  const edges = (edgeRaw === undefined ? [] : r.list(edgeRaw, "edges.json")).flatMap((v, i): SourceEdge[] => {
    const ctx = `edges.json[${i}]`;
    const o = r.obj(v, ctx);
    if (!o) return [];
    const id = r.id(o, "id", ctx);
    const type = r.str(o, "type", ctx);
    const fromKind = r.str(o, "fromKind", ctx);
    const fromId = r.str(o, "fromId", ctx);
    const toKind = r.str(o, "toKind", ctx);
    const toId = r.str(o, "toId", ctx);
    const editorialStatus = r.one(o, "editorialStatus", ctx, EDITORIAL_STATUSES);
    const createdBy = r.str(o, "createdBy", ctx);
    const shape = type ? types.get(type) : undefined;
    if (type && !shape) r.err("source-field", `${ctx} (${id ?? "?"}): unknown edge type ${type} (known: ${[...types.keys()].join(", ")})`);
    else if (shape && (fromKind !== shape.from || toKind !== shape.to)) r.err("source-field", `${ctx} (${id ?? "?"}): ${type} goes from ${shape.from} to ${shape.to}, not ${String(fromKind)} to ${String(toKind)}`);
    if (!id || !type || !fromKind || !fromId || !toKind || !toId || !editorialStatus || !createdBy) return [];
    return [{ id, type, fromKind, fromId, toKind, toId, editorialStatus, createdBy, uncertaintyNote: r.optStr(o, "uncertaintyNote", ctx), editorialBasis: r.optStr(o, "editorialBasis", ctx), passages: r.ids(o, "passages", ctx) }];
  });

  if (!meta || r.issues.length > 0) return { source: null, issues: r.issues };
  crossCheck({ dir, meta, licenses, works, editions, passages, claims, edges, entities }, r);
  return r.issues.length > 0 ? { source: null, issues: r.issues } : { source: { dir, meta, licenses, works, editions, passages, claims, edges, entities }, issues: [] };
}

/** References and rules that span files. */
function crossCheck(s: PackSource, r: Reader): void {
  const dup = (what: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) r.err("source-duplicate", `${what}: id ${id} is used twice`);
      seen.add(id);
    }
  };
  dup("licenses.json", s.licenses.map((x) => x.id));
  dup("sources.json works", s.works.map((x) => x.id));
  dup("sources.json editions", s.editions.map((x) => x.id));
  dup("sources.json passages", s.passages.map((x) => x.id));
  dup("claims.json", s.claims.map((x) => x.id));
  dup("edges.json", s.edges.map((x) => x.id));
  dup("entities.json", s.entities.map((x) => x.id));

  const licenses = new Map(s.licenses.map((x) => [x.id, x]));
  const works = new Set(s.works.map((x) => x.id));
  const editions = new Map(s.editions.map((x) => [x.id, x]));
  const passages = new Set(s.passages.map((x) => x.id));
  const claims = new Map(s.claims.map((x) => [x.id, x]));
  const entities = new Map(s.entities.map((x) => [x.id, x]));

  for (const n of s.entities) {
    for (const pid of n.supports) if (!passages.has(pid)) r.err("source-reference", `entity ${n.id}: passage ${pid} is not in sources.json`);
    for (const lang of Object.keys(n.text)) if (!s.meta.languages.includes(lang)) r.err("source-field", `entity ${n.id}: text in "${lang}", which pack.json does not list in languages`);
    if (n.editorialStatus === "published") {
      if (n.evidenceLabel === "unverified") r.err("source-publish", `entity ${n.id}: a published entity cannot be labelled unverified`);
      if (n.supports.length === 0 && !n.editorialBasis) r.err("source-publish", `entity ${n.id}: a published entity needs a supporting passage or an editorialBasis`);
      if (!Object.values(n.text).some((t) => t.status !== "machine_draft")) r.err("source-publish", `entity ${n.id}: a published entity needs a name that is original or reviewed, not only machine drafts`);
    }
  }
  for (const e of s.editions) {
    if (!works.has(e.workId)) r.err("source-reference", `edition ${e.id}: work ${e.workId} is not in sources.json`);
    if (!licenses.has(e.licenseId)) r.err("source-reference", `edition ${e.id}: licence ${e.licenseId} is not in licenses.json`);
  }
  for (const p of s.passages) {
    const ed = editions.get(p.editionId);
    if (!ed) r.err("source-reference", `passage ${p.id}: edition ${p.editionId} is not in sources.json`);
    else if (p.quote !== undefined && licenses.get(ed.licenseId)?.redistribution !== "yes")
      r.err("source-licence", `passage ${p.id}: a quotation can only be stored from an edition whose licence permits redistribution (${ed.licenseId} does not)`);
  }
  for (const c of s.claims) {
    for (const pid of [...c.supports, ...c.contradicts]) if (!passages.has(pid)) r.err("source-reference", `claim ${c.id}: passage ${pid} is not in sources.json`);
    for (const pid of c.supports) if (c.contradicts.includes(pid)) r.err("source-field", `claim ${c.id}: passage ${pid} cannot both support and contradict`);
    for (const lang of Object.keys(c.text)) if (!s.meta.languages.includes(lang)) r.err("source-field", `claim ${c.id}: text in "${lang}", which pack.json does not list in languages`);
    if (c.editorialStatus === "published") {
      if (c.evidenceLabel === "unverified") r.err("source-publish", `claim ${c.id}: a published claim cannot be labelled unverified`);
      if (c.supports.length === 0 && !c.editorialBasis) r.err("source-publish", `claim ${c.id}: a published claim needs a supporting passage or an editorialBasis`);
      if (!Object.values(c.text).some((t) => t.status !== "machine_draft")) r.err("source-publish", `claim ${c.id}: a published claim needs text that is original or reviewed, not only machine drafts`);
    }
  }
  for (const e of s.edges) {
    if (e.editorialStatus === "published" && e.passages.length === 0 && !e.editorialBasis) r.err("source-publish", `edge ${e.id}: a published edge needs a supporting passage or an editorialBasis`);
    for (const pid of e.passages) if (!passages.has(pid)) r.err("source-reference", `edge ${e.id}: passage ${pid} is not in sources.json`);
    for (const [kind, id] of [[e.fromKind, e.fromId], [e.toKind, e.toId]] as const) {
      if (kind === "claim") {
        const target = claims.get(id);
        if (!target) r.err("source-reference", `edge ${e.id}: claim ${id} is not in claims.json`);
        else if (e.editorialStatus === "published" && target.editorialStatus !== "published") r.err("source-publish", `edge ${e.id}: published, but claim ${id} is ${target.editorialStatus}`);
      } else if (kind === "event" || kind === "person" || kind === "place") {
        const target = entities.get(id);
        if (!target || target.kind !== kind) r.err("source-reference", `edge ${e.id}: ${kind} ${id} is not in entities.json${target ? ` (it is a ${target.kind})` : ""}`);
        else if (e.editorialStatus === "published" && target.editorialStatus !== "published") r.err("source-publish", `edge ${e.id}: published, but ${kind} ${id} is ${target.editorialStatus}`);
      } else if (kind === "source_passage" && !passages.has(id)) r.err("source-reference", `edge ${e.id}: passage ${id} is not in sources.json`);
      else if (kind === "ayah" && !/^\d{1,3}:\d{1,3}$/.test(id)) r.err("source-field", `edge ${e.id}: ayah ${id} must look like "2:255" (surah:ayah)`);
      else if (kind === "surah" && !/^\d{1,3}$/.test(id)) r.err("source-field", `edge ${e.id}: surah ${id} must be a surah number`);
    }
  }
  for (const dep of s.meta.requires) if (dep.packId === s.meta.packId) r.err("source-field", "pack.json: a pack cannot require itself");
}

/**
 * A directory starting with "." or "_" under data/knowledge/ is not a pack. `_incoming/` holds raw third-party material
 * waiting to be turned into a pack (with its own LICENSE.md), and it must never be built or shipped as it is. A pack named
 * on the command line is always built, whatever its directory is called.
 */
export function isStagingDir(name: string): boolean {
  return name.startsWith(".") || name.startsWith("_");
}
