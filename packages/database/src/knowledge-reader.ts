import type { SqlDriver } from "@tarteel/storage";
import type { EntityDate } from "./knowledge-dates.ts";
import type { InstalledPack, PackRegistry } from "./packs.ts";

/**
 * Reads surah history and ayah context out of the installed knowledge packs. Every pack is its own SQLite file and keeps
 * its own connection here: the questions asked of it (which published claims concern this surah or ayah, and what do they
 * cite) never need the Quran tables, because edges name surahs and ayahs by text id ("9", "2:255"). So packs are NOT
 * attached to the content database, and a damaged or missing pack can only affect itself.
 *
 * Only `published` claims and edges are ever returned, even if a pack contains other rows. A quotation is returned only when
 * the source's licence says `redistribution = 'yes'`. Pure TypeScript: the SQLite opener is injected.
 */

export type EvidenceLabel = "primary_text" | "source_reported" | "scholarly_interpretation" | "disputed" | "unverified" | "no_established_report_found";
export type ClaimType = "direct_textual_report" | "historical_report" | "scholarly_interpretation" | "editorial_synthesis" | "modern_analysis";
export type TextStatus = "original" | "machine_draft" | "reviewed";

export interface SourceLocator {
  volume: string | null;
  page: string | null;
  chapter: string | null;
  section: string | null;
  reportNumber: string | null;
  hadithNumber: string | null;
}

export type LocatorPart = { kind: keyof SourceLocator; value: string };

/** The parts of a locator that are set, in the order a reader looks them up: volume, page, chapter, section, report, hadith. */
export function locatorParts(l: SourceLocator): LocatorPart[] {
  const order: (keyof SourceLocator)[] = ["volume", "page", "chapter", "section", "reportNumber", "hadithNumber"];
  return order.flatMap((kind) => {
    const value = l[kind]?.trim();
    return value ? [{ kind, value }] : [];
  });
}

export interface SourceCitation {
  /** Which pack holds this passage, and which edition it belongs to: what a "source detail" screen is opened with. */
  packId: string;
  editionId: string;
  passageId: string;
  workTitle: string;
  workTitleArabic: string | null;
  author: string | null;
  edition: string;
  /** `unverified` and `ocr_unverified` mean the text of the source has not been checked against the edition. */
  transcriptionStatus: "verified" | "unverified" | "ocr_unverified";
  locator: SourceLocator;
  /** Present only when the licence allows redistribution. */
  quote: string | null;
  quoteLanguage: string | null;
  licenseName: string;
  attribution: string;
}

export interface HistoryClaim {
  /** Unique across packs: `<packId>:<claim id>`. */
  key: string;
  packId: string;
  claimType: ClaimType;
  evidenceLabel: EvidenceLabel;
  uncertaintyNote: string | null;
  editorialBasis: string | null;
  lastReviewedAt: string | null;
  text: string;
  /** The language `text` is in. It can differ from the language asked for. */
  textLang: string;
  /** `machine_draft` text has not been reviewed by a person and must be labelled as such. */
  textStatus: TextStatus;
  supports: SourceCitation[];
  contradicts: SourceCitation[];
}

export interface AyahReport {
  key: string;
  packId: string;
  /** `report`: a report that mentions the ayah (for example an occasion of revelation). `tafsir`: commentary on it. */
  kind: "report" | "tafsir";
  source: SourceCitation;
}

export interface AyahContext {
  claims: HistoryClaim[];
  reports: AyahReport[];
}

export type EntityKind = "event" | "person" | "place";

/** An event, person or place, just enough to list it or link to it. `key` is unique across packs: `<packId>:<id>`. */
export interface EntityRef {
  key: string;
  packId: string;
  id: string;
  kind: EntityKind;
  subtype: string | null;
  name: string;
  nameLang: string;
  /** `machine_draft` means the name was not reviewed by a person and must be labelled. */
  nameStatus: TextStatus;
}

/** A listed event, person or place. For a person, `date.start` is the birth and `date.end` the death; a place has no date. */
export interface EntitySummary extends EntityRef {
  summary: string | null;
  summaryLang: string | null;
  summaryStatus: TextStatus | null;
  evidenceLabel: EvidenceLabel;
  uncertaintyNote: string | null;
  date: EntityDate;
}

export interface EntityDetail extends EntitySummary {
  editorialBasis: string | null;
  lastReviewedAt: string | null;
  /** The passages the entry rests on. */
  sources: SourceCitation[];
  /** Published claims about it. */
  claims: HistoryClaim[];
  events: EntityRef[];
  people: EntityRef[];
  places: EntityRef[];
  /** Where it is connected to the Quran: ayahs, or a whole surah (`ayahNumber` null). */
  quranLinks: { surahId: number; ayahNumber: number | null }[];
}

export interface KnowledgeCoverage {
  /** Number of published claims about the surah as a whole. */
  surahClaims: number;
  /** Number of published events linked to the surah as a whole. */
  surahEntities: number;
  /** Ayah numbers of this surah that have a claim or a report. */
  ayahs: number[];
}

/** What the installed packs hold for one surah, for the Knowledge tab's list. Surahs with nothing are not listed. */
export interface SurahKnowledge {
  surahId: number;
  /** Published claims about the surah as a whole. */
  surahClaims: number;
  /** Published events linked to the surah as a whole. */
  surahEntities: number;
  /** Ayahs of this surah that have a published claim, report, event, person or place, in any installed pack. */
  ayahs: number;
}

/** One search result. `surahId` and `ayahNumber` say where it leads in the Quran; both are null for a passage no ayah links to. */
export interface KnowledgeHit {
  key: string;
  packId: string;
  kind: "claim" | "passage" | "entity";
  /** A cut of the matched text around the first match; never edited, "…" marks a cut. Quotes appear only where the licence allows. */
  snippet: string;
  surahId: number | null;
  ayahNumber: number | null;
  passageId: string | null;
  /** Claims only. */
  evidenceLabel: EvidenceLabel | null;
  textStatus: TextStatus | null;
  /** Passages only. */
  workTitle: string | null;
  /** Events, people and places only: what to open. */
  entity: { kind: EntityKind; id: string } | null;
}

export interface KnowledgeSearchResult {
  hits: KnowledgeHit[];
  /** More matched than `limit`, or a pack was too large to scan completely. */
  truncated: boolean;
}

export interface SourceDetail {
  packId: string;
  work: { title: string; titleArabic: string | null; author: string | null; originalLanguage: string; workType: string; subject: string | null };
  edition: {
    id: string; label: string; editor: string | null; publisher: string | null; published: string | null; identifier: string | null; url: string | null;
    transcriptionStatus: SourceCitation["transcriptionStatus"]; reviewedOn: string | null;
  };
  license: { name: string; url: string | null; redistribution: string; nonCommercialOnly: boolean; shareAlike: boolean; attribution: string; termsNote: string | null };
  /** The passages of this edition that published claims cite. */
  passages: SourceCitation[];
  /** Published claims that cite this edition. */
  citedBy: HistoryClaim[];
}

export interface KnowledgeReader {
  coverage(surahId: number): Promise<KnowledgeCoverage>;
  /** Every surah that has something in an installed pack, in surah order. */
  browse(): Promise<SurahKnowledge[]>;
  /**
   * Looks for the words in published claim text and in quotable source passages of every installed pack. Arabic is matched
   * without vowel marks and with alef and ya variants folded; every word of the query must appear. This scans the rows in
   * JavaScript (no index), which is right for packs of a few thousand passages; a pack bigger than `SEARCH_SCAN_LIMIT`
   * rows is searched only in part and the result says so (`truncated`).
   */
  search(query: string, lang: string, limit?: number): Promise<KnowledgeSearchResult>;
  /** How many published events, people and places the installed packs hold. */
  entityCounts(): Promise<Record<EntityKind, number>>;
  /**
   * Every published event, person or place of a kind. Dated ones come first, oldest first by the approximate Gregorian year
   * (`date.sortYear`, for ordering only); undated ones follow by name.
   */
  entities(kind: EntityKind, lang: string): Promise<EntitySummary[]>;
  /** One entry with everything the pack says about it; null when the pack or entry is not there (or not trusted, or not published). */
  entity(packId: string, id: string, lang: string): Promise<EntityDetail | null>;
  /**
   * The events, people and places linked to an ayah, or (without an ayah) to a surah as a whole or to any of its ayahs.
   */
  entitiesFor(target: { surahId: number; ayahNumber?: number }, lang: string): Promise<EntityRef[]>;
  surah(surahId: number, lang: string): Promise<HistoryClaim[]>;
  ayah(surahId: number, ayahNumber: number, lang: string): Promise<AyahContext>;
  /** Everything a pack says about the edition that `passageId` belongs to; null when the pack or passage is not there (or not trusted). */
  sourceDetail(packId: string, passageId: string, lang: string): Promise<SourceDetail | null>;
  /**
   * Why installed packs might not be showing: how many are installed, how many could be opened and answered a test question, and
   * for each one that could not, where it failed and the message. Never throws. Makes a fresh attempt (nothing here is cached).
   */
  diagnose(): Promise<PackReadReport>;
  /** Closes every open pack. Call when the app goes away, or after a pack was installed, repaired or removed; packs reopen on the next question. */
  close(): Promise<void>;
}

/** Where reading an installed pack failed. */
export type PackReadStage = "trust" | "open" | "query";

export interface PackReadProblem {
  packId: string;
  stage: PackReadStage;
  /** Technical, in English, for a bug report. Contains no personal data. */
  message: string;
}

export interface PackReadReport {
  installed: number;
  readable: number;
  problems: PackReadProblem[];
}

interface Open {
  pack: InstalledPack;
  db: SqlDriver;
  /** False for a pack file built before content migration 3 (no events, people or places): it is read as before, without them. */
  entities: boolean;
}

export function createKnowledgeReader(deps: {
  registry: PackRegistry;
  openDb: (relativePath: string) => Promise<SqlDriver>;
  /**
   * Asked once for each pack file before it is opened (`isPackTrusted` in the app). A pack that is not trusted (signed with a key
   * the app no longer accepts, or with a replaced manifest) is never opened and contributes nothing. Absent: every pack is read.
   */
  trust?: (pack: InstalledPack) => Promise<boolean>;
}): KnowledgeReader {
  // Keyed by file path AND install record, so an updated pack (new path) and a repaired one (same path, new install time) are reopened.
  const keyOf = (p: InstalledPack): string => `${p.path}#${p.installedAt}#${p.sha256}`;
  const open = new Map<string, Open>();
  /** An open in progress, so two questions asked at once share one open instead of opening the same file twice. */
  const opening = new Map<string, Promise<Open | PackReadProblem>>();
  /** The latest reason each pack could not be read, by pack id. Cleared when it reads again. Failures are never remembered as a verdict: the next question tries again. */
  const problems = new Map<string, PackReadProblem>();
  const text = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300);

  async function openOne(pack: InstalledPack): Promise<Open | PackReadProblem> {
    if (deps.trust) {
      let trusted = false;
      let why = "the stored manifest is missing, not for this pack, or not signed by a key this app trusts";
      try {
        trusted = await deps.trust(pack);
      } catch (e) {
        why = text(e);
      }
      if (!trusted) return { packId: pack.packId, stage: "trust", message: why };
    }
    let db: SqlDriver;
    try {
      db = await deps.openDb(pack.path);
    } catch (e) {
      return { packId: pack.packId, stage: "open", message: text(e) };
    }
    try {
      const has = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('entity', 'entity_text', 'entity_passage')");
      return { pack, db, entities: has?.n === 3 };
    } catch (e) {
      await db.close().catch(() => undefined);
      return { packId: pack.packId, stage: "open", message: `the file opened but could not be read: ${text(e)}` };
    }
  }

  /** The databases of every installed pack, opened on demand; ones that were removed or replaced are closed. A pack that will not open is skipped now and tried again next time. */
  async function packs(): Promise<Open[]> {
    const installed = await deps.registry.list();
    const keys = new Set(installed.map(keyOf));
    for (const [k, o] of open) {
      if (!keys.has(k)) {
        open.delete(k);
        await o.db.close().catch(() => undefined);
      }
    }
    const ids = new Set(installed.map((p) => p.packId));
    for (const id of problems.keys()) if (!ids.has(id)) problems.delete(id);
    const out: Open[] = [];
    for (const pack of [...installed].sort((a, b) => a.packId.localeCompare(b.packId))) {
      const key = keyOf(pack);
      let o = open.get(key);
      if (!o) {
        let pending = opening.get(key);
        if (!pending) {
          pending = openOne(pack).finally(() => opening.delete(key));
          opening.set(key, pending);
        }
        const r = await pending;
        if (!("db" in r)) {
          problems.set(pack.packId, r);
          continue;
        }
        // Two questions may have waited on the same open: keep the first handle.
        o = open.get(key) ?? r;
        open.set(key, o);
      }
      problems.delete(pack.packId);
      out.push(o);
    }
    return out;
  }

  /** Runs `work` on every pack; a pack whose query fails (damaged file) contributes nothing and does not stop the others. */
  async function eachPack<T>(work: (o: Open) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (const o of await packs()) {
      try {
        out.push(...(await work(o)));
      } catch (e) {
        problems.set(o.pack.packId, { packId: o.pack.packId, stage: "query", message: text(e) });
      }
    }
    return out;
  }

  const api: KnowledgeReader = {
    async coverage(surahId) {
      const surahTo = String(surahId);
      const prefix = `${surahId}:`;
      const perPack = await eachPack(async ({ db, entities }) => {
        const surahEntities = entities
          ? (await db.get<{ n: number }>(
              `SELECT COUNT(DISTINCT e.from_id) AS n FROM edge e
               WHERE e.type = 'EVENT_CONCERNS_SURAH' AND e.to_kind = 'surah' AND e.to_id = ? AND e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM}`,
              [surahTo],
            ))?.n ?? 0
          : 0;
        const claims = await db.get<{ n: number }>(
          `SELECT COUNT(DISTINCT c.id) AS n FROM edge e JOIN claim c ON c.id = e.from_id
           WHERE e.type = 'CLAIM_CONCERNS_SURAH' AND e.from_kind = 'claim' AND e.to_kind = 'surah' AND e.to_id = ?
             AND e.editorial_status = 'published' AND c.editorial_status = 'published'`,
          [surahTo],
        );
        const ayahRows = await db.all<{ to_id: string }>(
          `SELECT e.to_id FROM edge e JOIN claim c ON c.id = e.from_id
           WHERE e.type = 'CLAIM_CONCERNS_AYAH' AND e.from_kind = 'claim' AND e.to_kind = 'ayah' AND substr(e.to_id, 1, ?) = ?
             AND e.editorial_status = 'published' AND c.editorial_status = 'published'
           UNION
           SELECT e.to_id FROM edge e
           WHERE e.type IN ('REPORT_REFERENCES_AYAH', 'TAFSIR_EXPLAINS_AYAH') AND e.from_kind = 'source_passage' AND e.to_kind = 'ayah'
             AND substr(e.to_id, 1, ?) = ? AND e.editorial_status = 'published'`,
          [prefix.length, prefix, prefix.length, prefix],
        );
        const entityAyahs = entities
          ? await db.all<{ to_id: string }>(
              `SELECT e.to_id FROM edge e WHERE e.type IN (${ENTITY_AYAH_TYPES}) AND e.to_kind = 'ayah' AND substr(e.to_id, 1, ?) = ? AND e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM}`,
              [prefix.length, prefix],
            )
          : [];
        return [{ claims: claims?.n ?? 0, surahEntities, ayahs: [...ayahRows, ...entityAyahs].map((r) => Number(r.to_id.slice(prefix.length))) }];
      });
      const ayahs = [...new Set(perPack.flatMap((p) => p.ayahs))].filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
      return { surahClaims: perPack.reduce((n, p) => n + p.claims, 0), surahEntities: perPack.reduce((n, p) => n + p.surahEntities, 0), ayahs };
    },

    async browse() {
      const perPack = await eachPack(async ({ db, entities }) => {
        const surahEntityRows = entities
          ? await db.all<{ to_id: string; n: number }>(
              `SELECT e.to_id, COUNT(DISTINCT e.from_id) AS n FROM edge e
               WHERE e.type = 'EVENT_CONCERNS_SURAH' AND e.to_kind = 'surah' AND e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM} GROUP BY e.to_id`,
            )
          : [];
        const entityAyahRows = entities
          ? await db.all<{ to_id: string }>(
              `SELECT e.to_id FROM edge e WHERE e.type IN (${ENTITY_AYAH_TYPES}) AND e.to_kind = 'ayah' AND e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM}`,
            )
          : [];
        const surahClaims = await db.all<{ to_id: string; n: number }>(
          `SELECT e.to_id, COUNT(DISTINCT c.id) AS n FROM edge e JOIN claim c ON c.id = e.from_id
           WHERE e.type = 'CLAIM_CONCERNS_SURAH' AND e.from_kind = 'claim' AND e.to_kind = 'surah'
             AND e.editorial_status = 'published' AND c.editorial_status = 'published' GROUP BY e.to_id`,
        );
        const ayahRows = await db.all<{ to_id: string }>(
          `SELECT e.to_id FROM edge e JOIN claim c ON c.id = e.from_id
           WHERE e.type = 'CLAIM_CONCERNS_AYAH' AND e.from_kind = 'claim' AND e.to_kind = 'ayah'
             AND e.editorial_status = 'published' AND c.editorial_status = 'published'
           UNION
           SELECT e.to_id FROM edge e
           WHERE e.type IN ('REPORT_REFERENCES_AYAH', 'TAFSIR_EXPLAINS_AYAH') AND e.from_kind = 'source_passage' AND e.to_kind = 'ayah'
             AND e.editorial_status = 'published'`,
        );
        return [{ surahClaims, surahEntityRows, ayahRows: [...ayahRows, ...entityAyahRows] }];
      });
      const claims = new Map<number, number>();
      const entityCount = new Map<number, number>();
      const ayahs = new Map<number, Set<number>>();
      for (const p of perPack) {
        for (const r of p.surahClaims) {
          const s = parseSurahTarget(r.to_id);
          if (s !== null) claims.set(s, (claims.get(s) ?? 0) + r.n);
        }
        for (const r of p.surahEntityRows) {
          const s = parseSurahTarget(r.to_id);
          if (s !== null) entityCount.set(s, (entityCount.get(s) ?? 0) + r.n);
        }
        for (const r of p.ayahRows) {
          const a = parseAyahTarget(r.to_id);
          if (a) ayahs.set(a.surahId, (ayahs.get(a.surahId) ?? new Set<number>()).add(a.ayahNumber));
        }
      }
      const ids = [...new Set([...claims.keys(), ...entityCount.keys(), ...ayahs.keys()])].sort((a, b) => a - b);
      return ids.map((surahId) => ({ surahId, surahClaims: claims.get(surahId) ?? 0, surahEntities: entityCount.get(surahId) ?? 0, ayahs: ayahs.get(surahId)?.size ?? 0 }));
    },

    async search(query, lang, limit = 40) {
      const terms = searchTerms(query);
      if (terms.length === 0 || terms.join("").length < 2) return { hits: [], truncated: false };
      let partial = false;
      const perPack = await eachPack(async ({ pack, db, entities }) => {
        const hits: KnowledgeHit[] = [];

        // Claims: only those a published edge leads to, because only those can be reached from the reader.
        const claimRows = await db.all<{ claim_id: string; lang: string; text: string; translation_status: TextStatus; evidence_label: EvidenceLabel }>(
          `SELECT c.id AS claim_id, ct.lang, ct.text, ct.translation_status, c.evidence_label
           FROM claim c JOIN claim_text ct ON ct.claim_id = c.id
           WHERE c.editorial_status = 'published'
             AND EXISTS (SELECT 1 FROM edge e WHERE e.from_kind = 'claim' AND e.from_id = c.id AND e.editorial_status = 'published')
           ORDER BY c.id, ct.lang LIMIT ?`,
          [SEARCH_SCAN_LIMIT + 1],
        );
        if (claimRows.length > SEARCH_SCAN_LIMIT) {
          partial = true;
          claimRows.length = SEARCH_SCAN_LIMIT;
        }
        const byClaim = new Map<string, typeof claimRows>();
        for (const r of claimRows) if (matchesTerms(r.text, terms)) byClaim.set(r.claim_id, [...(byClaim.get(r.claim_id) ?? []), r]);
        for (const [claimId, rows] of [...byClaim].slice(0, limit + 1)) {
          const best = chooseClaimText(rows, lang);
          if (!best) continue;
          const edges = await db.all<{ type: string; to_id: string }>(
            `SELECT e.type, e.to_id FROM edge e WHERE e.from_kind = 'claim' AND e.from_id = ? AND e.editorial_status = 'published'
               AND e.type IN ('CLAIM_CONCERNS_AYAH', 'CLAIM_CONCERNS_SURAH')`,
            [claimId],
          );
          const target = firstTarget(edges);
          const label = rows[0]?.evidence_label ?? null;
          hits.push({
            key: `${pack.packId}:claim:${claimId}`, packId: pack.packId, kind: "claim", snippet: snippetAround(best.text, terms[0] ?? ""),
            surahId: target?.surahId ?? null, ayahNumber: target?.ayahNumber ?? null, passageId: null, evidenceLabel: label, textStatus: best.translation_status, workTitle: null, entity: null,
          });
        }

        // Passages: only quotable ones (the licence allows redistribution) that a published report or claim leads to.
        const passageRows = await db.all<{ id: string; quote: string; work_title: string }>(
          `SELECT p.id, p.quote, w.title AS work_title FROM source_passage p
           JOIN source_edition ed ON ed.id = p.edition_id JOIN source_work w ON w.id = ed.work_id JOIN license l ON l.id = ed.license_id
           WHERE l.redistribution = 'yes' AND p.quote IS NOT NULL AND p.quote <> ''
             AND (EXISTS (SELECT 1 FROM edge e WHERE e.from_kind = 'source_passage' AND e.from_id = p.id AND e.editorial_status = 'published'
                          AND e.type IN ('REPORT_REFERENCES_AYAH', 'TAFSIR_EXPLAINS_AYAH'))
               OR EXISTS (SELECT 1 FROM claim_passage cp JOIN claim c ON c.id = cp.claim_id WHERE cp.passage_id = p.id AND c.editorial_status = 'published'))
           ORDER BY p.id LIMIT ?`,
          [SEARCH_SCAN_LIMIT + 1],
        );
        if (passageRows.length > SEARCH_SCAN_LIMIT) {
          partial = true;
          passageRows.length = SEARCH_SCAN_LIMIT;
        }
        for (const r of passageRows.filter((x) => matchesTerms(x.quote, terms)).slice(0, limit + 1)) {
          const edges = await db.all<{ type: string; to_id: string }>(
            `SELECT e.type, e.to_id FROM edge e WHERE e.from_kind = 'source_passage' AND e.from_id = ? AND e.to_kind = 'ayah' AND e.editorial_status = 'published'
               AND e.type IN ('REPORT_REFERENCES_AYAH', 'TAFSIR_EXPLAINS_AYAH')`,
            [r.id],
          );
          const target = firstTarget(edges);
          hits.push({
            key: `${pack.packId}:passage:${r.id}`, packId: pack.packId, kind: "passage", snippet: snippetAround(r.quote, terms[0] ?? ""),
            surahId: target?.surahId ?? null, ayahNumber: target?.ayahNumber ?? null, passageId: r.id, evidenceLabel: null, textStatus: null, workTitle: r.work_title, entity: null,
          });
        }

        // Events, people and places: published ones, by name and summary.
        if (entities) {
          const rows = await db.all<{ id: string; kind: EntityKind; evidence_label: EvidenceLabel; lang: string; name: string; summary: string | null; translation_status: TextStatus }>(
            `SELECT n.id, n.kind, n.evidence_label, t.lang, t.name, t.summary, t.translation_status
             FROM entity n JOIN entity_text t ON t.entity_id = n.id WHERE n.editorial_status = 'published' ORDER BY n.id, t.lang LIMIT ?`,
            [SEARCH_SCAN_LIMIT + 1],
          );
          if (rows.length > SEARCH_SCAN_LIMIT) {
            partial = true;
            rows.length = SEARCH_SCAN_LIMIT;
          }
          const matched = new Map<string, typeof rows>();
          for (const r of rows) if (matchesTerms(`${r.name} ${r.summary ?? ""}`, terms)) matched.set(r.id, [...(matched.get(r.id) ?? []), r]);
          for (const [id, group] of [...matched].slice(0, limit + 1)) {
            const best = chooseClaimText(group.map((g) => ({ lang: g.lang, text: g.name, translation_status: g.translation_status })), lang);
            const row = group.find((g) => g.lang === best?.lang);
            if (!row) continue;
            const text = matchesTerms(row.name, terms) || !row.summary ? row.name : row.summary;
            hits.push({
              key: `${pack.packId}:entity:${id}`, packId: pack.packId, kind: "entity", snippet: snippetAround(text, terms[0] ?? ""), surahId: null, ayahNumber: null, passageId: null,
              evidenceLabel: row.evidence_label, textStatus: row.translation_status, workTitle: null, entity: { kind: row.kind, id },
            });
          }
        }
        return hits;
      });
      // Claims before passages; then where they lead in the Quran; then the key, so the order never depends on the packs' order.
      perPack.sort(
        (a, b) =>
          HIT_RANK[a.kind] - HIT_RANK[b.kind] ||
          (a.surahId ?? 999) - (b.surahId ?? 999) || (a.ayahNumber ?? 0) - (b.ayahNumber ?? 0) || a.key.localeCompare(b.key),
      );
      return { hits: perPack.slice(0, limit), truncated: partial || perPack.length > limit };
    },

    async entityCounts() {
      const out: Record<EntityKind, number> = { event: 0, person: 0, place: 0 };
      const rows = await eachPack(async ({ db, entities }) =>
        entities ? db.all<{ kind: EntityKind; n: number }>("SELECT kind, COUNT(*) AS n FROM entity WHERE editorial_status = 'published' GROUP BY kind") : [],
      );
      for (const r of rows) out[r.kind] += r.n;
      return out;
    },

    async entities(kind, lang) {
      const list = await eachPack(async ({ pack, db, entities }) => (entities ? entitySummaries(pack.packId, db, "WHERE n.kind = ? AND n.editorial_status = 'published'", [kind], lang) : []));
      return list.sort(
        (a, b) => (a.date.sortYear ?? Number.MAX_SAFE_INTEGER) - (b.date.sortYear ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
      );
    },

    async entity(packId, id, lang) {
      const o = (await packs()).find((x) => x.pack.packId === packId);
      if (!o || !o.entities) return null;
      try {
        return await readEntityDetail(o, id, lang);
      } catch {
        return null;
      }
    },

    async entitiesFor(target, lang) {
      const list = await eachPack(async ({ pack, db, entities }) => {
        if (!entities) return [];
        const ids = target.ayahNumber !== undefined
          ? await db.all<{ id: string }>(
              `SELECT DISTINCT e.from_id AS id FROM edge e WHERE e.type IN (${ENTITY_AYAH_TYPES}) AND e.to_kind = 'ayah' AND e.to_id = ? AND e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM}`,
              [`${target.surahId}:${target.ayahNumber}`],
            )
          : await db.all<{ id: string }>(
              `SELECT DISTINCT e.from_id AS id FROM edge e
               WHERE e.editorial_status = 'published' AND ${PUBLISHED_ENTITY_FROM} AND (
                 (e.type IN (${ENTITY_AYAH_TYPES}) AND e.to_kind = 'ayah' AND substr(e.to_id, 1, ?) = ?)
                 OR (e.type = 'EVENT_CONCERNS_SURAH' AND e.to_kind = 'surah' AND e.to_id = ?))`,
              [String(target.surahId).length + 1, `${target.surahId}:`, String(target.surahId)],
            );
        if (ids.length === 0) return [];
        return entitySummaries(pack.packId, db, `WHERE n.editorial_status = 'published' AND n.id IN (${ids.map(() => "?").join(",")})`, ids.map((r) => r.id), lang);
      });
      return list.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || (a.date.sortYear ?? Number.MAX_SAFE_INTEGER) - (b.date.sortYear ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    },

    surah: (surahId, lang) =>
      eachPack((o) =>
        claimsFor(o, `SELECT DISTINCT c.id FROM edge e JOIN claim c ON c.id = e.from_id
          WHERE e.type = 'CLAIM_CONCERNS_SURAH' AND e.from_kind = 'claim' AND e.to_kind = 'surah' AND e.to_id = ?
            AND e.editorial_status = 'published' AND c.editorial_status = 'published' ORDER BY c.id`, [String(surahId)], lang),
      ),

    async ayah(surahId, ayahNumber, lang) {
      const to = `${surahId}:${ayahNumber}`;
      const claims = await eachPack((o) =>
        claimsFor(o, `SELECT DISTINCT c.id FROM edge e JOIN claim c ON c.id = e.from_id
          WHERE e.type = 'CLAIM_CONCERNS_AYAH' AND e.from_kind = 'claim' AND e.to_kind = 'ayah' AND e.to_id = ?
            AND e.editorial_status = 'published' AND c.editorial_status = 'published' ORDER BY c.id`, [to], lang),
      );
      const reports = await eachPack(async ({ pack, db }) => {
        const rows = await db.all<{ type: string; passage_id: string }>(
          `SELECT e.type, e.from_id AS passage_id FROM edge e
           WHERE e.type IN ('REPORT_REFERENCES_AYAH', 'TAFSIR_EXPLAINS_AYAH') AND e.from_kind = 'source_passage' AND e.to_kind = 'ayah' AND e.to_id = ?
             AND e.editorial_status = 'published' ORDER BY e.type, e.from_id`,
          [to],
        );
        const out: AyahReport[] = [];
        for (const r of rows) {
          const source = await citation(pack.packId, db, r.passage_id);
          if (source) out.push({ key: `${pack.packId}:${r.passage_id}:${r.type}`, packId: pack.packId, kind: r.type === "TAFSIR_EXPLAINS_AYAH" ? "tafsir" : "report", source });
        }
        return out;
      });
      return { claims, reports };
    },

    async sourceDetail(packId, passageId, lang) {
      const o = (await packs()).find((x) => x.pack.packId === packId);
      if (!o) return null;
      try {
        return await readSourceDetail(o, passageId, lang);
      } catch {
        return null;
      }
    },

    async diagnose() {
      try {
        const installed = (await deps.registry.list()).length;
        // A real question (the one the Knowledge tab asks), so a failure the person would see is the one reported here.
        await api.browse().catch(() => []);
        const list = [...problems.values()];
        return { installed, readable: Math.max(0, installed - list.length), problems: list };
      } catch (e) {
        return { installed: 0, readable: 0, problems: [{ packId: "(registry)", stage: "open" as const, message: text(e) }] };
      }
    },

    async close() {
      const all = [...open.values()];
      open.clear();
      for (const o of all) await o.db.close().catch(() => undefined);
    },
  };
  return api;
}

// ------------------------------------------------------------------- events, people, places

/** Edge types that tie an entity to an ayah; the other end of the edge is always the entity (`e.from_id`). */
const ENTITY_AYAH_TYPES = "'EVENT_CONCERNS_AYAH', 'PERSON_MENTIONED_IN_AYAH', 'PLACE_MENTIONED_IN_AYAH'";
/** An edge from an entity is only counted when that entity is itself published. */
const PUBLISHED_ENTITY_FROM = "EXISTS (SELECT 1 FROM entity pn WHERE pn.id = e.from_id AND pn.kind = e.from_kind AND pn.editorial_status = 'published')";
const HIT_RANK: Record<KnowledgeHit["kind"], number> = { claim: 0, entity: 1, passage: 2 };
const kindOrder = (k: EntityKind): number => (k === "event" ? 0 : k === "person" ? 1 : 2);

interface EntityRow {
  id: string; kind: EntityKind; subtype: string | null; evidence_label: EvidenceLabel; uncertainty_note: string | null; editorial_basis: string | null; last_reviewed_at: string | null;
  date_calendar: "ah" | "ce" | null; date_start: number | null; date_end: number | null; date_precision: EntityDate["precision"]; sort_year: number | null; dating_note: string | null;
}
const ENTITY_COLUMNS = `n.id, n.kind, n.subtype, n.evidence_label, n.uncertainty_note, n.editorial_basis, n.last_reviewed_at,
  n.date_calendar, n.date_start, n.date_end, n.date_precision, n.sort_year, n.dating_note`;

/** The name and summary to show: the best reviewed name in the asked language (see `chooseClaimText`); the summary is the best one that exists. */
function entityTexts(rows: readonly { lang: string; name: string; summary: string | null; translation_status: TextStatus }[], lang: string) {
  const name = chooseClaimText(rows.map((r) => ({ lang: r.lang, text: r.name, translation_status: r.translation_status })), lang);
  const summary = chooseClaimText(rows.filter((r) => r.summary !== null).map((r) => ({ lang: r.lang, text: r.summary as string, translation_status: r.translation_status })), lang);
  return name ? { name, summary } : null;
}

function toSummary(packId: string, row: EntityRow, texts: NonNullable<ReturnType<typeof entityTexts>>): EntitySummary {
  return {
    key: `${packId}:${row.id}`, packId, id: row.id, kind: row.kind, subtype: row.subtype, name: texts.name.text, nameLang: texts.name.lang, nameStatus: texts.name.translation_status,
    summary: texts.summary?.text ?? null, summaryLang: texts.summary?.lang ?? null, summaryStatus: texts.summary?.translation_status ?? null,
    evidenceLabel: row.evidence_label, uncertaintyNote: row.uncertainty_note,
    date: { calendar: row.date_calendar, start: row.date_start, end: row.date_end, precision: row.date_precision, sortYear: row.sort_year, note: row.dating_note },
  };
}

async function entitySummaries(packId: string, db: SqlDriver, where: string, params: (string | number)[], lang: string): Promise<EntitySummary[]> {
  const rows = await db.all<EntityRow>(`SELECT ${ENTITY_COLUMNS} FROM entity n ${where} ORDER BY n.id`, params);
  const out: EntitySummary[] = [];
  for (const row of rows) {
    const texts = entityTexts(await db.all("SELECT lang, name, summary, translation_status FROM entity_text WHERE entity_id = ?", [row.id]), lang);
    if (texts) out.push(toSummary(packId, row, texts));
  }
  return out;
}

async function readEntityDetail({ pack, db }: Open, id: string, lang: string): Promise<EntityDetail | null> {
  const [base] = await entitySummaries(pack.packId, db, "WHERE n.id = ? AND n.editorial_status = 'published'", [id], lang);
  if (!base) return null;
  const extra = await db.get<{ editorial_basis: string | null; last_reviewed_at: string | null }>("SELECT editorial_basis, last_reviewed_at FROM entity WHERE id = ?", [id]);

  const sources: SourceCitation[] = [];
  for (const { passage_id } of await db.all<{ passage_id: string }>("SELECT passage_id FROM entity_passage WHERE entity_id = ? ORDER BY passage_id", [id])) {
    const c = await citation(pack.packId, db, passage_id);
    if (c) sources.push(c);
  }

  // Everything a published edge joins this entry to.
  const edges = await db.all<{ type: string; from_kind: string; from_id: string; to_kind: string; to_id: string }>(
    `SELECT e.type, e.from_kind, e.from_id, e.to_kind, e.to_id FROM edge e
     WHERE e.editorial_status = 'published' AND ((e.from_kind = ? AND e.from_id = ?) OR (e.to_kind = ? AND e.to_id = ?)) ORDER BY e.type, e.id`,
    [base.kind, id, base.kind, id],
  );
  const claimIds = edges.filter((e) => e.from_kind === "claim" && e.to_id === id && e.to_kind === base.kind).map((e) => e.from_id);
  const claims = claimIds.length === 0 ? [] : await claimsFor({ pack, db, entities: true }, `SELECT DISTINCT c.id FROM claim c WHERE c.editorial_status = 'published' AND c.id IN (${claimIds.map(() => "?").join(",")}) ORDER BY c.id`, claimIds, lang);

  const otherIds = (kind: EntityKind): string[] => [...new Set(edges.flatMap((e) => (e.from_kind === kind && e.from_id !== id ? [e.from_id] : e.to_kind === kind && e.to_id !== id ? [e.to_id] : [])))];
  const related = async (kind: EntityKind): Promise<EntityRef[]> => {
    const ids = otherIds(kind);
    if (ids.length === 0) return [];
    const list = await entitySummaries(pack.packId, db, `WHERE n.kind = ? AND n.editorial_status = 'published' AND n.id IN (${ids.map(() => "?").join(",")})`, [kind, ...ids], lang);
    return list.sort((a, b) => (a.date.sortYear ?? Number.MAX_SAFE_INTEGER) - (b.date.sortYear ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)).map(({ key, packId, id: rid, kind: k, subtype, name, nameLang, nameStatus }) => ({ key, packId, id: rid, kind: k, subtype, name, nameLang, nameStatus }));
  };

  const quranLinks: EntityDetail["quranLinks"] = [];
  for (const e of edges) {
    if (e.from_kind !== base.kind || e.from_id !== id) continue;
    if (e.to_kind === "ayah") {
      const a = parseAyahTarget(e.to_id);
      if (a) quranLinks.push(a);
    } else if (e.to_kind === "surah") {
      const sId = parseSurahTarget(e.to_id);
      if (sId !== null) quranLinks.push({ surahId: sId, ayahNumber: null });
    }
  }
  quranLinks.sort((a, b) => a.surahId - b.surahId || (a.ayahNumber ?? 0) - (b.ayahNumber ?? 0));

  return {
    ...base, editorialBasis: extra?.editorial_basis ?? null, lastReviewedAt: extra?.last_reviewed_at ?? null, sources, claims,
    events: await related("event"), people: await related("person"), places: await related("place"), quranLinks,
  };
}

// ------------------------------------------------------------------- queries

interface TextRow {
  lang: string;
  text: string;
  translation_status: TextStatus;
}

/**
 * Which text to show. A person-reviewed text (original or reviewed) is preferred over a machine draft, even when that means
 * another language: in the asked language, then English, then any other. Only when no reviewed text exists is a machine
 * draft used (asked language first), and the caller must label it.
 */
export function chooseClaimText(rows: readonly TextRow[], lang: string): TextRow | undefined {
  const rank = (r: TextRow): number => {
    const trusted = r.translation_status !== "machine_draft";
    const language = r.lang === lang ? 0 : r.lang === "en" ? 1 : 2;
    return (trusted ? 0 : 3) + language;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang))[0];
}

async function claimsFor({ pack, db }: Open, idQuery: string, params: (string | number)[], lang: string): Promise<HistoryClaim[]> {
  const ids = await db.all<{ id: string }>(idQuery, params);
  const out: HistoryClaim[] = [];
  for (const { id } of ids) {
    const c = await db.get<{ claim_type: ClaimType; evidence_label: EvidenceLabel; uncertainty_note: string | null; editorial_basis: string | null; last_reviewed_at: string | null }>(
      "SELECT claim_type, evidence_label, uncertainty_note, editorial_basis, last_reviewed_at FROM claim WHERE id = ? AND editorial_status = 'published'",
      [id],
    );
    const text = chooseClaimText(await db.all<TextRow>("SELECT lang, text, translation_status FROM claim_text WHERE claim_id = ?", [id]), lang);
    if (!c || !text) continue;
    const links = await db.all<{ passage_id: string; relation: "supports" | "contradicts" }>("SELECT passage_id, relation FROM claim_passage WHERE claim_id = ? ORDER BY relation, passage_id", [id]);
    const supports: SourceCitation[] = [];
    const contradicts: SourceCitation[] = [];
    for (const l of links) {
      const cite = await citation(pack.packId, db, l.passage_id);
      if (cite) (l.relation === "supports" ? supports : contradicts).push(cite);
    }
    out.push({
      key: `${pack.packId}:${id}`, packId: pack.packId, claimType: c.claim_type, evidenceLabel: c.evidence_label,
      uncertaintyNote: c.uncertainty_note, editorialBasis: c.editorial_basis, lastReviewedAt: c.last_reviewed_at,
      text: text.text, textLang: text.lang, textStatus: text.translation_status, supports, contradicts,
    });
  }
  return out;
}

async function citation(packId: string, db: SqlDriver, passageId: string): Promise<SourceCitation | null> {
  const r = await db.get<{
    edition_id: string; volume: string | null; page: string | null; chapter: string | null; section: string | null; report_number: string | null; hadith_number: string | null;
    quote: string | null; quote_language: string | null; title: string; title_arabic: string | null; author: string | null; edition_label: string;
    transcription_status: SourceCitation["transcriptionStatus"]; lic_name: string; attribution: string; redistribution: string;
  }>(
    `SELECT p.edition_id, p.volume, p.page, p.chapter, p.section, p.report_number, p.hadith_number, p.quote, p.quote_language,
            w.title, w.title_arabic, w.author, ed.edition_label, ed.transcription_status,
            l.name AS lic_name, l.attribution, l.redistribution
     FROM source_passage p
     JOIN source_edition ed ON ed.id = p.edition_id
     JOIN source_work w ON w.id = ed.work_id
     JOIN license l ON l.id = ed.license_id
     WHERE p.id = ?`,
    [passageId],
  );
  if (!r) return null;
  const quotable = r.redistribution === "yes";
  return {
    packId, editionId: r.edition_id, passageId, workTitle: r.title, workTitleArabic: r.title_arabic, author: r.author, edition: r.edition_label, transcriptionStatus: r.transcription_status,
    locator: { volume: r.volume, page: r.page, chapter: r.chapter, section: r.section, reportNumber: r.report_number, hadithNumber: r.hadith_number },
    quote: quotable ? r.quote : null, quoteLanguage: quotable && r.quote ? r.quote_language : null,
    licenseName: r.lic_name, attribution: r.attribution,
  };
}

async function readSourceDetail({ pack, db }: Open, passageId: string, lang: string): Promise<SourceDetail | null> {
  const e = await db.get<{
    edition_id: string; work_title: string; title_arabic: string | null; author: string | null; original_language: string; work_type: string; subject: string | null;
    edition_label: string; editor: string | null; publisher: string | null; published: string | null; identifier: string | null; url: string | null;
    transcription_status: SourceCitation["transcriptionStatus"]; reviewed_on: string | null;
    lic_name: string; lic_url: string | null; redistribution: string; non_commercial_only: number; share_alike: number; attribution: string; terms_note: string | null;
  }>(
    `SELECT ed.id AS edition_id, w.title AS work_title, w.title_arabic, w.author, w.original_language, w.work_type, w.subject,
            ed.edition_label, ed.editor, ed.publisher, ed.published, ed.identifier, ed.url, ed.transcription_status, ed.reviewed_on,
            l.name AS lic_name, l.url AS lic_url, l.redistribution, l.non_commercial_only, l.share_alike, l.attribution, l.terms_note
     FROM source_passage p
     JOIN source_edition ed ON ed.id = p.edition_id
     JOIN source_work w ON w.id = ed.work_id
     JOIN license l ON l.id = ed.license_id
     WHERE p.id = ?`,
    [passageId],
  );
  if (!e) return null;
  const citedBy = await claimsFor(
    { pack, db, entities: false },
    `SELECT DISTINCT c.id FROM claim_passage cp
     JOIN source_passage p ON p.id = cp.passage_id
     JOIN claim c ON c.id = cp.claim_id
     WHERE p.edition_id = ? AND c.editorial_status = 'published' ORDER BY c.id`,
    [e.edition_id],
    lang,
  );
  const cited = await db.all<{ id: string }>(
    `SELECT DISTINCT p.id FROM claim_passage cp
     JOIN source_passage p ON p.id = cp.passage_id
     JOIN claim c ON c.id = cp.claim_id
     WHERE p.edition_id = ? AND c.editorial_status = 'published' ORDER BY p.id`,
    [e.edition_id],
  );
  const passages: SourceCitation[] = [];
  for (const { id } of cited) {
    const c = await citation(pack.packId, db, id);
    if (c) passages.push(c);
  }
  return {
    packId: pack.packId,
    work: { title: e.work_title, titleArabic: e.title_arabic, author: e.author, originalLanguage: e.original_language, workType: e.work_type, subject: e.subject },
    edition: {
      id: e.edition_id, label: e.edition_label, editor: e.editor, publisher: e.publisher, published: e.published, identifier: e.identifier, url: e.url,
      transcriptionStatus: e.transcription_status, reviewedOn: e.reviewed_on,
    },
    license: { name: e.lic_name, url: e.lic_url, redistribution: e.redistribution, nonCommercialOnly: e.non_commercial_only === 1, shareAlike: e.share_alike === 1, attribution: e.attribution, termsNote: e.terms_note },
    passages,
    citedBy,
  };
}

// ------------------------------------------------------------------- search and browse helpers

/** Rows read from one pack for one kind of search target. A bigger pack is searched in part, and the result says so. */
export const SEARCH_SCAN_LIMIT = 20_000;

const SURAH_COUNT = 114;

/** "9" -> 9; anything that is not a surah number -> null. */
export function parseSurahTarget(id: string): number | null {
  if (!/^\d{1,3}$/.test(id)) return null;
  const n = Number(id);
  return n >= 1 && n <= SURAH_COUNT ? n : null;
}

/** "2:255" -> { 2, 255 }; anything else, or an out-of-range surah, -> null. The ayah number is not range-checked (pack validation does that). */
export function parseAyahTarget(id: string): { surahId: number; ayahNumber: number } | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(id);
  if (!m) return null;
  const surahId = Number(m[1]);
  const ayahNumber = Number(m[2]);
  return surahId >= 1 && surahId <= SURAH_COUNT && ayahNumber >= 1 ? { surahId, ayahNumber } : null;
}

/** Where a result leads: the first ayah it names (in Quran order), else the first surah. Null when it names neither. */
function firstTarget(edges: readonly { type?: string; to_id: string }[]): { surahId: number; ayahNumber: number | null } | null {
  const ayahs = edges.flatMap((e) => parseAyahTarget(e.to_id) ?? []).sort((a, b) => a.surahId - b.surahId || a.ayahNumber - b.ayahNumber);
  if (ayahs[0]) return ayahs[0];
  const surahs = edges.flatMap((e) => parseSurahTarget(e.to_id) ?? []).sort((a, b) => a - b);
  return surahs[0] !== undefined ? { surahId: surahs[0], ayahNumber: null } : null;
}

// Arabic vowel marks and tanween (064B-065F), superscript alef (0670), Quranic annotation marks (06D6-06ED), tatweel (0640).
const SEARCH_MARKS = /[ً-ٰٟۖ-ۭـ]/g;
const SEARCH_ALEF = /[آأإٱ]/g;
const SEARCH_MAKSURA = /ى/g;
/** One base character with the combining marks that follow it, or marks with no base. Folding works on these so that composed and decomposed forms agree. */
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;

/**
 * Folds text for matching, and says where each folded character came from in the original (UTF-16 index), so a match can be
 * cut out of the untouched text. Folding: compatibility normalisation, Arabic marks removed, alef and ya variants made one,
 * lower case, runs of white space made one space. Bengali vowel signs are marks too, but only Arabic ones are removed.
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (const m of text.matchAll(CLUSTER)) {
    const start = m.index ?? 0;
    const piece = m[0].normalize("NFKC").replace(SEARCH_MARKS, "").replace(SEARCH_ALEF, "ا").replace(SEARCH_MAKSURA, "ي").toLowerCase();
    for (let i = 0; i < piece.length; i++) {
      let ch = piece.charAt(i);
      if (/\s/.test(ch)) {
        if (folded === "" || folded.endsWith(" ")) continue;
        ch = " ";
      }
      folded += ch;
      map.push(start);
    }
  }
  return { folded, map };
}

/** The words of a query, folded, without repeats, at most six. */
export function searchTerms(query: string): string[] {
  return [...new Set(foldWithMap(query).folded.split(" ").filter(Boolean))].slice(0, 6);
}

function matchesTerms(text: string, terms: readonly string[]): boolean {
  const { folded } = foldWithMap(text);
  return terms.every((t) => folded.includes(t));
}

/** About `width` characters of `text` around the first place `term` (already folded) occurs. The text itself is not changed; a cut is marked with "…". */
export function snippetAround(text: string, term: string, width = 160): string {
  const { folded, map } = foldWithMap(text);
  const at = term === "" ? -1 : folded.indexOf(term);
  const hit = at >= 0 ? map[at] ?? 0 : 0;
  let from = Math.max(0, hit - 40);
  while (from < hit && (/[\uDC00-\uDFFF]/.test(text.charAt(from)) || /\p{M}/u.test(text.charAt(from)))) from++;
  let to = Math.min(text.length, from + width);
  while (to < text.length && (/[\uDC00-\uDFFF]/.test(text.charAt(to)) || /\p{M}/u.test(text.charAt(to)))) to++;
  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}
