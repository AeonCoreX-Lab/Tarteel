import type { SqlDriver } from "@tarteel/storage";
import type { Issue } from "@tarteel/quran-data";

/**
 * Integrity checks for a knowledge database (content.db, or one optional pack). Never modifies anything.
 *
 * The migration already refuses most bad writes (docs/architecture/KNOWLEDGE.md). This validator is the second line:
 * it finds what a database built by other means, or edited after publication, can still contain. A release must pass
 * it with `release: true`.
 */
export interface KnowledgeValidationOptions {
  /**
   * Release mode: things that would block shipping (a pending licence, Quran references that cannot be checked) are
   * errors instead of warnings.
   */
  release?: boolean;
  /**
   * The database that holds the Quran rows (`surahs`, `ayahs`). Needed when the checked database is a pack, which
   * does not carry the Quran text. Defaults to the checked database itself.
   */
  quran?: SqlDriver;
}

const REQUIRED = [
  "license", "source_work", "source_edition", "source_passage", "claim", "claim_text", "claim_passage",
  "entity_kind", "edge_type", "edge", "edge_passage", "surah_profile",
  "v_published_claims_without_support", "v_published_edges_without_support",
] as const;

/** Node kinds stored in the checked database itself: the table, and a condition that picks the kind out of it. */
const LOCAL_KINDS: Readonly<Record<string, { table: string; where: string }>> = {
  claim: { table: "claim", where: "1" }, source_work: { table: "source_work", where: "1" }, source_edition: { table: "source_edition", where: "1" },
  source_passage: { table: "source_passage", where: "1" },
  event: { table: "entity", where: "kind = 'event'" }, person: { table: "entity", where: "kind = 'person'" }, place: { table: "entity", where: "kind = 'place'" },
};

const LIST_LIMIT = 10;

export async function validateKnowledgeDb(db: SqlDriver, opts: KnowledgeValidationOptions = {}): Promise<Issue[]> {
  const issues: Issue[] = [];
  const release = opts.release === true;
  const report = (severity: Issue["severity"], code: string, message: string, ids: readonly string[]): void => {
    if (ids.length === 0) return;
    const shown = ids.slice(0, LIST_LIMIT).join(", ");
    const more = ids.length > LIST_LIMIT ? ` and ${ids.length - LIST_LIMIT} more` : "";
    issues.push({ severity, code, message: `${message}: ${shown}${more}` });
  };
  const ids = async (sql: string): Promise<string[]> => (await db.all<{ id: string | number }>(sql)).map((r) => String(r.id));

  const present = new Set((await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table','view')")).map((r) => r.name));
  const missing = REQUIRED.filter((n) => !present.has(n));
  if (missing.length > 0) {
    issues.push({ severity: "error", code: "schema-missing", message: `knowledge schema is missing ${missing.join(", ")} (database older than content migration 2?)` });
    return issues;
  }

  // Referential integrity. SQLite drivers do not enable foreign keys on their own, so this does not rely on them.
  const fk = await db.all<{ table: string; rowid: number | null; parent: string }>("PRAGMA foreign_key_check");
  report("error", "foreign-key", "rows that refer to a row that does not exist", fk.map((r) => `${r.table}#${r.rowid ?? "?"}->${r.parent}`));

  report("error", "published-claim-unsupported", "published claims with no supporting passage and no editorial basis", await ids("SELECT id FROM v_published_claims_without_support ORDER BY id"));
  report("error", "published-edge-unsupported", "published edges with no supporting passage and no editorial basis", await ids("SELECT id FROM v_published_edges_without_support ORDER BY id"));
  report("error", "published-claim-unverified", "published claims still labelled unverified", await ids("SELECT id FROM claim WHERE editorial_status = 'published' AND evidence_label = 'unverified' ORDER BY id"));
  report("error", "published-claim-no-reviewed-text", "published claims with no original or reviewed text", await ids(
    `SELECT c.id FROM claim c WHERE c.editorial_status = 'published'
       AND NOT EXISTS (SELECT 1 FROM claim_text t WHERE t.claim_id = c.id AND t.translation_status IN ('original','reviewed')) ORDER BY c.id`));
  report("warning", "published-machine-translation", "machine-drafted text on published claims (claim and language)", await ids(
    `SELECT c.id || ' (' || t.lang || ')' AS id FROM claim c JOIN claim_text t ON t.claim_id = c.id
      WHERE c.editorial_status = 'published' AND t.translation_status = 'machine_draft' ORDER BY c.id, t.lang`));
  report("error", "quote-without-licence", "quotations stored from an edition whose licence does not permit redistribution", await ids(
    `SELECT p.id FROM source_passage p JOIN source_edition e ON e.id = p.edition_id JOIN license l ON l.id = e.license_id
      WHERE p.quote IS NOT NULL AND l.redistribution <> 'yes' ORDER BY p.id`));
  report(release ? "error" : "warning", "licence-pending", "editions whose licence decision is still pending", await ids(
    `SELECT e.id FROM source_edition e JOIN license l ON l.id = e.license_id WHERE l.redistribution = 'pending' ORDER BY e.id`));
  report("error", "edge-to-unpublished-claim", "published edges that end at a claim which is not published", await ids(
    `SELECT e.id FROM edge e WHERE e.editorial_status = 'published' AND (
       (e.from_kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = e.from_id AND c.editorial_status = 'published')) OR
       (e.to_kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = e.to_id AND c.editorial_status = 'published'))) ORDER BY e.id`));

  const hasEntities = present.has("entity") && present.has("entity_text") && present.has("entity_passage");
  for (const [kind, { table, where }] of Object.entries(LOCAL_KINDS)) {
    if (table === "entity" && !hasEntities) continue; // a pack older than content migration 3 has no events, people or places
    report("error", "edge-endpoint-missing", `edges that end at a ${kind} that does not exist`, await ids(
      `SELECT e.id FROM edge e WHERE (e.from_kind = '${kind}' AND e.from_id NOT IN (SELECT id FROM ${table} WHERE ${where}))
          OR (e.to_kind = '${kind}' AND e.to_id NOT IN (SELECT id FROM ${table} WHERE ${where})) ORDER BY e.id`));
  }

  if (hasEntities) {
    report("error", "published-entity-unsupported", "published events, people and places with no supporting passage and no editorial basis", await ids("SELECT id FROM v_published_entities_without_support ORDER BY id"));
    report("error", "published-entity-unverified", "published events, people and places still labelled unverified", await ids("SELECT id FROM entity WHERE editorial_status = 'published' AND evidence_label = 'unverified' ORDER BY id"));
    report("error", "published-entity-no-reviewed-text", "published events, people and places with no original or reviewed name", await ids(
      `SELECT e.id FROM entity e WHERE e.editorial_status = 'published'
         AND NOT EXISTS (SELECT 1 FROM entity_text t WHERE t.entity_id = e.id AND t.translation_status IN ('original','reviewed')) ORDER BY e.id`));
    report("warning", "published-entity-machine-translation", "machine-drafted text on published events, people and places (entity and language)", await ids(
      `SELECT e.id || ' (' || t.lang || ')' AS id FROM entity e JOIN entity_text t ON t.entity_id = e.id
        WHERE e.editorial_status = 'published' AND t.translation_status = 'machine_draft' ORDER BY e.id, t.lang`));
    report("error", "edge-to-unpublished-entity", "published edges that end at an event, person or place which is not published", await ids(
      `SELECT e.id FROM edge e WHERE e.editorial_status = 'published' AND (
         (e.from_kind IN ('event','person','place') AND NOT EXISTS (SELECT 1 FROM entity n WHERE n.id = e.from_id AND n.kind = e.from_kind AND n.editorial_status = 'published')) OR
         (e.to_kind IN ('event','person','place') AND NOT EXISTS (SELECT 1 FROM entity n WHERE n.id = e.to_id AND n.kind = e.to_kind AND n.editorial_status = 'published'))) ORDER BY e.id`));
  }

  await checkQuranEndpoints(db, opts.quran ?? db, release, issues, report);
  return issues;
}

async function checkQuranEndpoints(
  db: SqlDriver,
  quran: SqlDriver,
  release: boolean,
  issues: Issue[],
  report: (severity: Issue["severity"], code: string, message: string, ids: readonly string[]) => void,
): Promise<void> {
  const used = await db.all<{ edge: string; kind: string; ref: string }>(
    `SELECT id AS edge, from_kind AS kind, from_id AS ref FROM edge WHERE from_kind IN ('surah','ayah')
     UNION ALL SELECT id, to_kind, to_id FROM edge WHERE to_kind IN ('surah','ayah')`,
  );
  if (used.length === 0) return;
  let surahs: Set<string>;
  let ayahs: Set<string>;
  try {
    surahs = new Set((await quran.all<{ k: number }>("SELECT id AS k FROM surahs")).map((r) => String(r.k)));
    ayahs = new Set((await quran.all<{ k: string }>("SELECT surah_id || ':' || ayah_number AS k FROM ayahs")).map((r) => r.k));
  } catch (e) {
    issues.push({ severity: "error", code: "quran-unreadable", message: `cannot read the Quran rows to check references: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  if (surahs.size === 0 && ayahs.size === 0) {
    issues.push({
      severity: release ? "error" : "warning",
      code: "quran-unverifiable",
      message: `${used.length} edge end(s) refer to surahs or ayahs, but no Quran rows are available to check them (pass the content database)`,
    });
    return;
  }
  const bad = used.filter((u) => !(u.kind === "surah" ? surahs : ayahs).has(u.ref));
  report("error", "edge-endpoint-missing", "edges that end at a surah or ayah that does not exist", [...new Set(bad.map((b) => b.edge))].sort());
}

export interface KnowledgeCounts {
  claims: number;
  publishedClaims: number;
  edges: number;
  publishedEdges: number;
  editions: number;
  passages: number;
}

/** Row counts for a summary line. Returns zeros for a database without the knowledge schema. */
export async function knowledgeCounts(db: SqlDriver): Promise<KnowledgeCounts> {
  const has = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'claim'");
  if (!has || has.n === 0) return { claims: 0, publishedClaims: 0, edges: 0, publishedEdges: 0, editions: 0, passages: 0 };
  const n = async (sql: string): Promise<number> => (await db.get<{ n: number }>(sql))?.n ?? 0;
  return {
    claims: await n("SELECT COUNT(*) AS n FROM claim"),
    publishedClaims: await n("SELECT COUNT(*) AS n FROM claim WHERE editorial_status = 'published'"),
    edges: await n("SELECT COUNT(*) AS n FROM edge"),
    publishedEdges: await n("SELECT COUNT(*) AS n FROM edge WHERE editorial_status = 'published'"),
    editions: await n("SELECT COUNT(*) AS n FROM source_edition"),
    passages: await n("SELECT COUNT(*) AS n FROM source_passage"),
  };
}
