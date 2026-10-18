import { rm } from "node:fs/promises";
import { CONTENT_MIGRATIONS, migrate, sortYearFor } from "@tarteel/database";
import type { PackManifest } from "@tarteel/database";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { sha256Hex } from "../lib/pack-tools.ts";
import type { PackSource, SourceClaim, SourceEdge, SourceEntity, SourceLicense } from "./source.ts";

/**
 * What goes into a pack: only PUBLISHED claims and edges (drafts and retracted rows stay in git), and only the sources
 * they actually cite. A claim that is retracted in a later version simply is not in that version's pack, so installing the
 * update removes it from every device.
 */
export interface PackSelection {
  claims: SourceClaim[];
  edges: SourceEdge[];
  entities: SourceEntity[];
  passageIds: Set<string>;
  licenses: SourceLicense[];
  excluded: { claims: number; edges: number; entities: number };
}

export function selectForPack(s: PackSource): PackSelection {
  const claims = s.claims.filter((c) => c.editorialStatus === "published");
  const edges = s.edges.filter((e) => e.editorialStatus === "published");
  const entities = s.entities.filter((n) => n.editorialStatus === "published");
  const passageIds = new Set<string>();
  for (const c of claims) for (const p of [...c.supports, ...c.contradicts]) passageIds.add(p);
  for (const n of entities) for (const p of n.supports) passageIds.add(p);
  for (const e of edges) {
    for (const p of e.passages) passageIds.add(p);
    if (e.fromKind === "source_passage") passageIds.add(e.fromId);
    if (e.toKind === "source_passage") passageIds.add(e.toId);
  }
  const editionIds = new Set(s.passages.filter((p) => passageIds.has(p.id)).map((p) => p.editionId));
  const licenseIds = new Set(s.editions.filter((e) => editionIds.has(e.id)).map((e) => e.licenseId));
  return {
    claims, edges, entities, passageIds,
    licenses: s.licenses.filter((l) => licenseIds.has(l.id)).sort((a, b) => a.id.localeCompare(b.id)),
    excluded: { claims: s.claims.length - claims.length, edges: s.edges.length - edges.length, entities: s.entities.length - entities.length },
  };
}

export interface BuiltPack {
  dbPath: string;
  selection: PackSelection;
  counts: { claims: number; edges: number; entities: number; passages: number; editions: number; works: number; licenses: number };
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const n = (v: string | undefined): string | null => v ?? null;

/**
 * Builds the pack's SQLite file. Rows go in sorted by id and the migration timestamps are fixed, so the same source gives
 * the same bytes on the same Node/SQLite version. Claims and edges are inserted as `approved`, their evidence is linked, and
 * only then are they published: the database refuses to publish anything without evidence.
 */
export async function buildPackDatabase(s: PackSource, dbPath: string): Promise<BuiltPack> {
  await rm(dbPath, { force: true });
  const sel = selectForPack(s);
  const editionIds = new Set(s.passages.filter((p) => sel.passageIds.has(p.id)).map((p) => p.editionId));
  const editions = s.editions.filter((e) => editionIds.has(e.id)).sort(byId);
  const workIds = new Set(editions.map((e) => e.workId));
  const works = s.works.filter((w) => workIds.has(w.id)).sort(byId);
  const passages = s.passages.filter((p) => sel.passageIds.has(p.id)).sort(byId);
  const version = s.meta.packVersion;

  const db: SqlDriver = openNodeSqlite(dbPath);
  try {
    await migrate(db, CONTENT_MIGRATIONS, () => 0);
    // A knowledge pack carries no Quran text or translations, so the full-text-search tables the shared schema creates are empty
    // and unused here. Drop them (and the triggers that feed them): a pack file then holds NO virtual tables. This is a
    // defence in depth against the expo-sqlite close crash (https://github.com/expo/expo/issues/38168), which needs a virtual
    // table to happen. The app also opens databases with the workaround on (apps/mobile/src/platform/expo-sqlite-driver.ts).
    await db.exec("DROP TRIGGER IF EXISTS translation_ayahs_ai; DROP TRIGGER IF EXISTS translation_ayahs_ad; DROP TABLE IF EXISTS ayahs_fts; DROP TABLE IF EXISTS translations_fts;");
    await db.transaction(async () => {
      const meta: [string, string][] = [["pack_id", s.meta.packId], ["pack_version", String(version)], ["schema_version", String(CONTENT_MIGRATIONS.length)]];
      for (const [k, v] of meta) await db.run("INSERT INTO content_meta (key, value) VALUES (?, ?)", [k, v]);
      for (const l of sel.licenses)
        await db.run("INSERT INTO license (id, name, url, redistribution, non_commercial_only, share_alike, attribution, terms_note, inventory_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [l.id, l.name, n(l.url), l.redistribution, l.nonCommercialOnly ? 1 : 0, l.shareAlike ? 1 : 0, l.attribution, n(l.termsNote), n(l.inventoryRef)]);
      for (const w of works)
        await db.run("INSERT INTO source_work (id, title, title_arabic, author, original_language, work_type, subject) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [w.id, w.title, n(w.titleArabic), n(w.author), w.originalLanguage, w.workType, n(w.subject)]);
      for (const e of editions)
        await db.run("INSERT INTO source_edition (id, work_id, edition_label, editor, publisher, published, identifier, url, license_id, transcription_status, reviewed_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [e.id, e.workId, e.editionLabel, n(e.editor), n(e.publisher), n(e.published), n(e.identifier), n(e.url), e.licenseId, e.transcriptionStatus, n(e.reviewedOn)]);
      for (const p of passages)
        await db.run("INSERT INTO source_passage (id, edition_id, volume, page, chapter, section, report_number, hadith_number, quote, quote_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [p.id, p.editionId, n(p.volume), n(p.page), n(p.chapter), n(p.section), n(p.reportNumber), n(p.hadithNumber), n(p.quote), n(p.quoteLanguage)]);

      const claims = [...sel.claims].sort(byId);
      for (const c of claims) {
        await db.run("INSERT INTO claim (id, claim_type, evidence_label, uncertainty_note, editorial_basis, editorial_status, created_by, reviewed_by, last_reviewed_at, dataset_version) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)",
          [c.id, c.claimType, c.evidenceLabel, n(c.uncertaintyNote), n(c.editorialBasis), c.createdBy, n(c.reviewedBy), n(c.lastReviewedAt), version]);
        for (const lang of Object.keys(c.text).sort()) {
          const t = c.text[lang];
          if (t) await db.run("INSERT INTO claim_text (claim_id, lang, text, translation_status) VALUES (?, ?, ?, ?)", [c.id, lang, t.text, t.status]);
        }
        for (const p of [...c.supports].sort()) await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES (?, ?, 'supports')", [c.id, p]);
        for (const p of [...c.contradicts].sort()) await db.run("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES (?, ?, 'contradicts')", [c.id, p]);
      }
      await db.run("UPDATE claim SET editorial_status = 'published'");

      const entities = [...sel.entities].sort(byId);
      for (const ent of entities) {
        const d = ent.date;
        const sortYear = d ? sortYearFor(d.calendar, d.start, d.precision) : null;
        await db.run(
          `INSERT INTO entity (id, kind, subtype, evidence_label, uncertainty_note, editorial_basis, editorial_status, date_calendar, date_start, date_end, date_precision, sort_year, dating_note,
                               created_by, reviewed_by, last_reviewed_at, dataset_version)
           VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ent.id, ent.kind, n(ent.subtype), ent.evidenceLabel, n(ent.uncertaintyNote), n(ent.editorialBasis), d?.calendar ?? null, d?.start ?? null, d?.end ?? null, d?.precision ?? "unknown", sortYear, n(d?.note),
            ent.createdBy, n(ent.reviewedBy), n(ent.lastReviewedAt), version],
        );
        for (const lang of Object.keys(ent.text).sort()) {
          const t = ent.text[lang];
          if (t) await db.run("INSERT INTO entity_text (entity_id, lang, name, summary, translation_status) VALUES (?, ?, ?, ?, ?)", [ent.id, lang, t.name, n(t.summary), t.status]);
        }
        for (const p of [...ent.supports].sort()) await db.run("INSERT INTO entity_passage (entity_id, passage_id) VALUES (?, ?)", [ent.id, p]);
      }
      await db.run("UPDATE entity SET editorial_status = 'published'");

      const edges = [...sel.edges].sort(byId);
      for (const e of edges) {
        await db.run("INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, editorial_status, uncertainty_note, editorial_basis, created_by, dataset_version) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)",
          [e.id, e.type, e.fromKind, e.fromId, e.toKind, e.toId, n(e.uncertaintyNote), n(e.editorialBasis), e.createdBy, version]);
        for (const p of [...e.passages].sort()) await db.run("INSERT INTO edge_passage (edge_id, passage_id) VALUES (?, ?)", [e.id, p]);
      }
      await db.run("UPDATE edge SET editorial_status = 'published'");
    });
    await db.exec("VACUUM");
  } finally {
    await db.close();
  }
  return {
    dbPath, selection: sel,
    counts: { claims: sel.claims.length, edges: sel.edges.length, entities: sel.entities.length, passages: passages.length, editions: editions.length, works: works.length, licenses: sel.licenses.length },
  };
}

/** The unsigned manifest for a built database file. */
export async function makePackManifest(s: PackSource, dbBytes: Uint8Array, fileName: string, licenses: readonly SourceLicense[]): Promise<PackManifest> {
  return {
    packId: s.meta.packId,
    packVersion: s.meta.packVersion,
    schemaVersion: CONTENT_MIGRATIONS.length,
    kind: "knowledge",
    languages: [...s.meta.languages].sort(),
    requires: [...s.meta.requires].sort((a, b) => a.packId.localeCompare(b.packId)),
    publishedAt: s.meta.publishedAt,
    file: { name: fileName, size: dbBytes.length, sha256: await sha256Hex(dbBytes) },
    licenses: licenses.map((l) => ({ id: l.id, name: l.name, attribution: l.attribution })),
    changelog: s.meta.changelog,
    ...(s.meta.title ? { title: s.meta.title } : {}),
    ...(s.meta.description ? { description: s.meta.description } : {}),
  };
}
