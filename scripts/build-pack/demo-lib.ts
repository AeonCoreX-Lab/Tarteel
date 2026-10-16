import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_MIGRATIONS, migrate, validateKnowledgeDb } from "@tarteel/database";
import type { PackManifest } from "@tarteel/database";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { generatePackKeyPair, signManifest } from "../lib/pack-tools.ts";
import { buildPackDatabase, makePackManifest } from "./build.ts";
import { loadPackSource } from "./source.ts";

/** The synthetic example pack the build-pack tests use. It contains no real religious content. */
export const EXAMPLE_PACK_DIR = fileURLToPath(new URL("../../tests/fixtures/knowledge/example-pack", import.meta.url));

export interface DemoResult {
  publicKeyPem: string;
  files: string[];
  catalogV1: { schema: 1; packs: { manifest: PackManifest; url: string }[] };
  catalogV2: { schema: 1; packs: { manifest: PackManifest; url: string }[] };
}

/** A content database with just enough Quran rows (surah 1, ayahs 1 and 2) for the release validation of the example pack. */
async function checkDb(): Promise<SqlDriver> {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
  `);
  return db;
}

/**
 * Builds a throwaway test setup for trying the knowledge packs on a real device: the example pack in two versions (version 2
 * edits one claim and retracts another, so an update is visible), each signed with a NEW key pair that is thrown away, and
 * two catalogues (`catalog.json` offers version 1; `catalog-v2.json` offers version 2). The matching public key is written
 * next to them. An app built with that key trusts these packs and nothing else; never commit it.
 */
export async function buildDemoPacks(outDir: string, baseUrl: string): Promise<DemoResult> {
  if (!baseUrl.startsWith("https://")) throw new Error("--base-url must start with https:// (the app refuses any other address)");
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  await mkdir(outDir, { recursive: true });
  const loaded = await loadPackSource(EXAMPLE_PACK_DIR);
  if (!loaded.source) throw new Error(`the example pack does not load: ${loaded.issues.map((i) => i.message).join("; ")}`);
  // The fixture links only one claim to a surah. The demo links all three published ones, so each shows on the surah's History
  // screen and the update (one claim edited, one retracted) is visible there.
  const demoEdge = (claimId: string, status: "published" | "retracted") => ({
    id: `e-demo-${claimId}`, type: "CLAIM_CONCERNS_SURAH", fromKind: "claim", fromId: claimId, toKind: "surah", toId: "1",
    editorialStatus: status, editorialBasis: "Synthetic demo link.", createdBy: "demo", passages: [] as string[],
  });
  const v1 = { ...loaded.source, edges: [...loaded.source.edges, demoEdge("c-published-2", "published"), demoEdge("c-disputed", "published")] };
  const v2 = {
    ...v1,
    edges: v1.edges.map((e) => (e.id === "e-demo-c-published-2" ? { ...e, editorialStatus: "retracted" as const } : e)),
    meta: { ...v1.meta, packVersion: 2, publishedAt: "2026-10-20T00:00:00Z", changelog: "Synthetic update: one claim edited, one claim retracted." },
    claims: v1.claims.map((c) =>
      c.id === "c-published-1" ? { ...c, text: { ...c.text, en: { text: "Synthetic claim one, edited in version 2.", status: "original" as const } } }
      : c.id === "c-published-2" ? { ...c, editorialStatus: "retracted" as const }
      : c,
    ),
  };
  const keys = generatePackKeyPair();
  const quran = await checkDb();
  const files: string[] = [];
  const entries: { manifest: PackManifest; url: string }[] = [];
  for (const source of [v1, v2]) {
    const name = `${source.meta.packId}.v${source.meta.packVersion}.db`;
    const built = await buildPackDatabase(source, join(outDir, name));
    const check = openNodeSqlite(built.dbPath, { readOnly: true });
    const problems = (await validateKnowledgeDb(check, { release: true, quran })).filter((i) => i.severity === "error");
    await check.close();
    if (problems.length > 0) throw new Error(`demo pack ${name} failed release validation: ${problems.map((p) => p.message).join("; ")}`);
    const bytes = new Uint8Array(await readFile(built.dbPath));
    const manifest = signManifest(await makePackManifest(source, bytes, name, built.selection.licenses), keys.privateKeyPem);
    entries.push({ manifest, url: `${base}${name}` });
    files.push(name);
  }
  await quran.close();
  const catalogV1 = { schema: 1 as const, packs: [entries[0]!] };
  const catalogV2 = { schema: 1 as const, packs: [entries[1]!] };
  await writeFile(join(outDir, "catalog.json"), JSON.stringify(catalogV1, null, 2) + "\n");
  await writeFile(join(outDir, "catalog-v2.json"), JSON.stringify(catalogV2, null, 2) + "\n");
  await writeFile(join(outDir, "demo-publisher-key.pub.pem"), keys.publicKeyPem);
  files.push("catalog.json", "catalog-v2.json", "demo-publisher-key.pub.pem");
  return { publicKeyPem: keys.publicKeyPem, files, catalogV1, catalogV2 };
}
