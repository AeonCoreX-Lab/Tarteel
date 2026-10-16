import type { SqlDriver } from "@tarteel/storage";
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

export interface KnowledgeCoverage {
  /** Number of published claims about the surah as a whole. */
  surahClaims: number;
  /** Ayah numbers of this surah that have a claim or a report. */
  ayahs: number[];
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
  surah(surahId: number, lang: string): Promise<HistoryClaim[]>;
  ayah(surahId: number, ayahNumber: number, lang: string): Promise<AyahContext>;
  /** Everything a pack says about the edition that `passageId` belongs to; null when the pack or passage is not there (or not trusted). */
  sourceDetail(packId: string, passageId: string, lang: string): Promise<SourceDetail | null>;
  /** Closes every open pack. Call when the app goes away; packs reopen on the next question. */
  close(): Promise<void>;
}

interface Open {
  pack: InstalledPack;
  db: SqlDriver;
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
  const rejected = new Set<string>(); // packs that failed the trust check; forgotten when the install record changes or goes

  /** The databases of every installed pack, opened on demand; ones that were removed or replaced are closed. A pack that will not open is skipped. */
  async function packs(): Promise<Open[]> {
    const installed = await deps.registry.list();
    const keys = new Set(installed.map(keyOf));
    for (const k of rejected) if (!keys.has(k)) rejected.delete(k);
    for (const [k, o] of open) {
      if (!keys.has(k)) {
        open.delete(k);
        await o.db.close().catch(() => undefined);
      }
    }
    const out: Open[] = [];
    for (const pack of [...installed].sort((a, b) => a.packId.localeCompare(b.packId))) {
      let o = open.get(keyOf(pack));
      if (!o) {
        if (rejected.has(keyOf(pack))) continue;
        if (deps.trust && !(await deps.trust(pack).catch(() => false))) {
          rejected.add(keyOf(pack));
          continue;
        }
        try {
          o = { pack, db: await deps.openDb(pack.path) };
        } catch {
          continue;
        }
        open.set(keyOf(pack), o);
      }
      out.push(o);
    }
    return out;
  }

  /** Runs `work` on every pack; a pack whose query fails (damaged file) contributes nothing and does not stop the others. */
  async function eachPack<T>(work: (o: Open) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (const o of await packs()) out.push(...(await work(o).catch(() => [])));
    return out;
  }

  return {
    async coverage(surahId) {
      const surahTo = String(surahId);
      const prefix = `${surahId}:`;
      const perPack = await eachPack(async ({ db }) => {
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
        return [{ claims: claims?.n ?? 0, ayahs: ayahRows.map((r) => Number(r.to_id.slice(prefix.length))) }];
      });
      const ayahs = [...new Set(perPack.flatMap((p) => p.ayahs))].filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
      return { surahClaims: perPack.reduce((n, p) => n + p.claims, 0), ayahs };
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

    async close() {
      const all = [...open.values()];
      open.clear();
      for (const o of all) await o.db.close().catch(() => undefined);
    },
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
    { pack, db },
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
