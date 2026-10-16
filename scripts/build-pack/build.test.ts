import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_MIGRATIONS, USER_MIGRATIONS, createSqlPackRegistry, installPack, migrate, validateKnowledgeDb, validatePackManifest } from "@tarteel/database";
import type { PackPorts } from "@tarteel/database";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { createNodeFileStore } from "../lib/node-file-store.ts";
import { generatePackKeyPair, sha256Hex, signManifest, signatureVerifier } from "../lib/pack-tools.ts";
import { buildPackDatabase, makePackManifest, selectForPack } from "./build.ts";
import { loadPackSource } from "./source.ts";

// The fixture is synthetic: no real religious content anywhere in these tests.
const FIXTURE = fileURLToPath(new URL("../../tests/fixtures/knowledge/example-pack", import.meta.url));

const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), "tarteel-buildpack-"));
  dirs.push(d);
  return d;
};

async function load() {
  const r = await loadPackSource(FIXTURE);
  assert.deepEqual(r.issues, []);
  assert.ok(r.source);
  return r.source;
}

async function quranDb(): Promise<SqlDriver> {
  const db = openNodeSqlite();
  await migrate(db, CONTENT_MIGRATIONS);
  await db.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
  `);
  return db;
}

test("the example pack loads without problems", async () => {
  const s = await load();
  assert.equal(s.meta.packId, "example-pack");
  assert.equal(s.claims.length, 5);
});

test("only published claims and edges are shipped, with only the sources they cite", async () => {
  const sel = selectForPack(await load());
  assert.deepEqual(sel.claims.map((c) => c.id).sort(), ["c-disputed", "c-published-1", "c-published-2"]);
  assert.deepEqual(sel.edges.map((e) => e.id).sort(), ["e-1", "e-2"]);
  assert.deepEqual([...sel.passageIds].sort(), ["p-1", "p-2"], "the passage cited only by a draft is left out");
  assert.deepEqual(sel.licenses.map((l) => l.id), ["lic-open"], "the pending licence is not shipped, because nothing shipped depends on it");
  assert.deepEqual(sel.excluded, { claims: 2, edges: 1 });
});

test("the built database holds exactly that, passes the release validation, and records the pack", async () => {
  const s = await load();
  const dir = await tmp();
  const built = await buildPackDatabase(s, join(dir, "p.db"));
  assert.deepEqual(built.counts, { claims: 3, edges: 2, passages: 2, editions: 1, works: 1, licenses: 1 });
  const db = openNodeSqlite(built.dbPath, { readOnly: true });
  const ids = async (sql: string) => (await db.all<{ id: string }>(sql)).map((r) => r.id);
  assert.deepEqual(await ids("SELECT id FROM claim WHERE editorial_status = 'published' ORDER BY id"), ["c-disputed", "c-published-1", "c-published-2"]);
  assert.equal((await db.all("SELECT id FROM claim WHERE editorial_status <> 'published'")).length, 0);
  assert.deepEqual(await ids("SELECT id FROM source_edition"), ["ed-1"]);
  assert.deepEqual((await db.all<{ lang: string; translation_status: string }>("SELECT lang, translation_status FROM claim_text WHERE claim_id = 'c-published-1' ORDER BY lang")).map((r) => [r.lang, r.translation_status]), [["bn", "reviewed"], ["en", "original"]]);
  assert.equal((await db.get<{ dataset_version: number }>("SELECT dataset_version FROM claim WHERE id = 'c-published-1'"))?.dataset_version, 1);
  assert.deepEqual((await db.all<{ key: string; value: string }>("SELECT key, value FROM content_meta ORDER BY key")).map((r) => [r.key, r.value]),
    [["pack_id", "example-pack"], ["pack_version", "1"], ["schema_version", "2"]]);
  const quran = await quranDb();
  assert.deepEqual(await validateKnowledgeDb(db, { release: true, quran }), []);
  await db.close();
});

test("building twice gives byte-identical files", async () => {
  const s = await load();
  const dir = await tmp();
  await buildPackDatabase(s, join(dir, "a.db"));
  await buildPackDatabase(s, join(dir, "b.db"));
  assert.equal(await sha256Hex(await readFile(join(dir, "a.db"))), await sha256Hex(await readFile(join(dir, "b.db"))));
});

test("a built pack, signed, installs through the same code the app uses", async () => {
  const s = await load();
  const dir = await tmp();
  const built = await buildPackDatabase(s, join(dir, "example-pack.v1.db"));
  const bytes = new Uint8Array(await readFile(built.dbPath));
  const keys = generatePackKeyPair();
  const manifest = signManifest(await makePackManifest(s, bytes, "example-pack.v1.db", built.selection.licenses), keys.privateKeyPem);
  assert.deepEqual(validatePackManifest(manifest).issues, []);

  const files = createNodeFileStore(join(dir, "files"));
  const userDb = openNodeSqlite();
  await migrate(userDb, USER_MIGRATIONS);
  const ports: PackPorts = {
    files, http: { get: async () => ({ status: 200, bytes }) }, registry: createSqlPackRegistry(userDb), sha256: sha256Hex,
    verifySignature: signatureVerifier(keys.publicKeyPem), openDb: async (rel) => openNodeSqlite(files.resolve("packages", rel)),
    quran: await quranDb(), appSchemaVersion: CONTENT_MIGRATIONS.length,
  };
  const result = await installPack(ports, manifest, "https://packs.example.invalid/example-pack.v1.db");
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
  const installed = await ports.registry.get("example-pack");
  const db = await ports.openDb(installed?.path ?? "");
  assert.equal((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim"))?.n, 3);
  await db.close();

  // a pack signed with another key is refused by an app that trusts only the publisher's key
  const forged = signManifest(manifest, generatePackKeyPair().privateKeyPem);
  const again = await installPack({ ...ports, registry: createSqlPackRegistry(openNodeSqlite()) }, forged, "https://packs.example.invalid/x.db");
  assert.equal(again.ok ? "installed" : again.code, "signature-invalid");
});

test("a pack whose Quran references do not exist is caught by the release validation", async () => {
  const s = await load();
  const dir = await tmp();
  const wrong = { ...s, edges: s.edges.map((e) => (e.id === "e-1" ? { ...e, toId: "1:99" } : e)) };
  const built = await buildPackDatabase(wrong, join(dir, "p.db"));
  const db = openNodeSqlite(built.dbPath, { readOnly: true });
  const issues = await validateKnowledgeDb(db, { release: true, quran: await quranDb() });
  await db.close();
  assert.deepEqual(issues.map((i) => i.code), ["edge-endpoint-missing"]);
  assert.match(issues[0]?.message ?? "", /e-1/);
});

// ------------------------------------------------------------ source checks

type Files = { "pack.json": Record<string, unknown>; "licenses.json": Record<string, unknown>[]; "sources.json": { works: Record<string, unknown>[]; editions: Record<string, unknown>[]; passages: Record<string, unknown>[] }; "claims.json": Record<string, unknown>[]; "edges.json": Record<string, unknown>[] };

/** Copies the fixture, lets the test change the parsed files, writes them back and loads the result. */
async function mutated(change: (f: Files) => void, dirName = "example-pack") {
  const root = await tmp();
  const dir = join(root, dirName);
  await cp(FIXTURE, dir, { recursive: true });
  const names = ["pack.json", "licenses.json", "sources.json", "claims.json", "edges.json"] as const;
  const f = {} as Record<string, unknown>;
  for (const n of names) f[n] = JSON.parse(await readFile(join(dir, n), "utf8"));
  change(f as unknown as Files);
  for (const n of names) await writeFile(join(dir, n), JSON.stringify(f[n], null, 2));
  return loadPackSource(dir);
}
const claim = (f: Files, id: string): Record<string, unknown> => {
  const c = f["claims.json"].find((x) => x["id"] === id);
  assert.ok(c);
  return c;
};
const codesOf = (r: Awaited<ReturnType<typeof mutated>>): string[] => r.issues.map((i) => i.code);
const textOf = (r: Awaited<ReturnType<typeof mutated>>): string => r.issues.map((i) => i.message).join("\n");

test("source checks: duplicate ids, dangling references and licence rules name the file and the id", async () => {
  let r = await mutated((f) => f["claims.json"].push({ ...claim(f, "c-draft") }));
  assert.deepEqual(codesOf(r), ["source-duplicate"]);
  assert.match(textOf(r), /c-draft is used twice/);

  r = await mutated((f) => ((claim(f, "c-published-1")["supports"] as string[]).push("p-nope")));
  assert.deepEqual(codesOf(r), ["source-reference"]);
  assert.match(textOf(r), /claim c-published-1: passage p-nope/);

  r = await mutated((f) => Object.assign(f["sources.json"].passages.find((p) => p["id"] === "p-draft") as object, { quote: "q", quoteLanguage: "en" }));
  assert.deepEqual(codesOf(r), ["source-licence"]);

  r = await mutated((f) => Object.assign(f["sources.json"].editions[0] as object, { licenseId: "lic-missing" }));
  assert.match(textOf(r), /licence lic-missing is not in licenses.json/);
});

test("source checks: nothing can be published without evidence, an original or reviewed text, or a published claim to end at", async () => {
  let r = await mutated((f) => delete claim(f, "c-published-2")["editorialBasis"]);
  assert.deepEqual(codesOf(r), ["source-publish"]);
  assert.match(textOf(r), /needs a supporting passage or an editorialBasis/);

  r = await mutated((f) => Object.assign(claim(f, "c-published-1"), { evidenceLabel: "unverified" }));
  assert.match(textOf(r), /cannot be labelled unverified/);

  r = await mutated((f) => Object.assign(claim(f, "c-published-2"), { text: { en: { text: "x", status: "machine_draft" } } }));
  assert.match(textOf(r), /not only machine drafts/);

  r = await mutated((f) => Object.assign(f["edges.json"].find((e) => e["id"] === "e-2") as object, { fromId: "c-draft" }));
  assert.deepEqual(codesOf(r), ["source-publish"]);
  assert.match(textOf(r), /published, but claim c-draft is draft/);

  r = await mutated((f) => delete (f["edges.json"].find((e) => e["id"] === "e-2") as Record<string, unknown>)["editorialBasis"]);
  assert.match(textOf(r), /edge e-2: a published edge needs/);
});

test("source checks: shapes, enums, languages and edge types", async () => {
  assert.match(textOf(await mutated((f) => Object.assign(claim(f, "c-published-1"), { claimType: "rumour" }))), /"claimType" must be one of/);
  assert.match(textOf(await mutated((f) => Object.assign(claim(f, "c-published-1"), { text: { fr: { text: "x", status: "original" } } }))), /"fr", which pack.json does not list/);
  assert.match(textOf(await mutated((f) => Object.assign(claim(f, "c-disputed"), { uncertaintyNote: undefined }))), /needs an uncertaintyNote/);
  assert.match(textOf(await mutated((f) => Object.assign(f["edges.json"][0] as object, { type: "MADE_UP" }))), /unknown edge type MADE_UP/);
  assert.match(textOf(await mutated((f) => Object.assign(f["edges.json"][0] as object, { toKind: "surah", toId: "1" }))), /goes from source_passage to ayah, not source_passage to surah/);
  assert.match(textOf(await mutated((f) => Object.assign(f["edges.json"][0] as object, { toId: "1-1" }))), /must look like "2:255"/);
  assert.match(textOf(await mutated((f) => Object.assign(f["sources.json"].passages[1] as object, { page: undefined }))), /needs at least one locator/);
  assert.match(textOf(await mutated((f) => Object.assign(f["sources.json"].passages[0] as object, { quoteLanguage: undefined }))), /quote and quoteLanguage go together/);
  assert.match(textOf(await mutated((f) => Object.assign(f["pack.json"], { packVersion: 0, languages: [] }))), /packVersion must be a whole number/);
  assert.match(textOf(await mutated((f) => Object.assign(f["licenses.json"][0] as object, { redistribution: "maybe" }))), /"redistribution" must be one of/);
});

test("source checks: the pack id must match its directory, and missing or broken files are reported", async () => {
  assert.match(textOf(await mutated(() => undefined, "other-name")), /must equal the directory name \(other-name\)/);
  const root = await tmp();
  const dir = join(root, "example-pack");
  await cp(FIXTURE, dir, { recursive: true });
  await rm(join(dir, "claims.json"));
  await writeFile(join(dir, "licenses.json"), "{ not json");
  const r = await loadPackSource(dir);
  assert.equal(r.source, null);
  assert.deepEqual(r.issues.map((i) => i.code).sort(), ["source-missing", "source-unreadable"]);
});

test("edges.json is optional", async () => {
  const root = await tmp();
  const dir = join(root, "example-pack");
  await cp(FIXTURE, dir, { recursive: true });
  await rm(join(dir, "edges.json"));
  const r = await loadPackSource(dir);
  assert.deepEqual(r.issues, []);
  assert.equal(r.source?.edges.length, 0);
});
