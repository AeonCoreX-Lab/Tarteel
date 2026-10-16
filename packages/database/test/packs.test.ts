import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { createNodeFileStore } from "../../../scripts/lib/node-file-store.ts";
import { generatePackKeyPair, sha256Hex, signManifest, signatureVerifier } from "../../../scripts/lib/pack-tools.ts";
import {
  CONTENT_MIGRATIONS, USER_MIGRATIONS, canonicalManifestBytes, createSqlPackRegistry, installPack, migrate, packDbPath,
  packStatus, readInstalledManifest, sweepPacks, uninstallPack, validatePackManifest, verifyInstalledPack,
} from "../src/index.ts";
import type { InstalledPack, InstallResult, PackHttp, PackManifest, PackPorts, PackRegistry } from "../src/index.ts";

// ALL text below is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

const workDirs: string[] = [];
after(async () => {
  for (const d of workDirs) await rm(d, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), "tarteel-packs-"));
  workDirs.push(d);
  return d;
};

const keys = generatePackKeyPair();
const otherKeys = generatePackKeyPair();
const URL_A = "https://packs.example.invalid/pack-a.db";

type BuildOpts = { id?: string; version?: number; schemaVersion?: number; broken?: "unsupported" | "pending-licence" | "undeclared-licence" };

let buildCounter = 0;
/** A pack database file, built the way a publisher would: migrations, then rows. Returns its bytes. */
async function buildPackBytes(dir: string, o: BuildOpts = {}): Promise<Uint8Array> {
  const schemaVersion = o.schemaVersion ?? 2;
  const path = join(dir, `build-${++buildCounter}.db`);
  const db = openNodeSqlite(path);
  await migrate(db, CONTENT_MIGRATIONS.slice(0, schemaVersion));
  if (schemaVersion >= 2) {
    await db.exec(`
      INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-open', 'Synthetic open licence', 'yes', 'Synthetic attribution');
      INSERT INTO source_work (id, title, original_language, work_type) VALUES ('work-1', 'Synthetic Work', 'ar', 'tafsir');
      INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-1', 'work-1', 'Edition', 'lic-open');
      INSERT INTO source_passage (id, edition_id, page) VALUES ('p1', 'ed-1', '10');
    `);
    if (o.broken === "pending-licence")
      await db.exec(`INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-pending', 'Synthetic pending', 'pending', 'n/a');
        INSERT INTO source_edition (id, work_id, edition_label, license_id) VALUES ('ed-2', 'work-1', 'Pending edition', 'lic-pending');`);
    if (o.broken === "undeclared-licence")
      await db.exec("INSERT INTO license (id, name, redistribution, attribution) VALUES ('lic-extra', 'Synthetic extra', 'yes', 'n/a')");
    if (o.broken === "unsupported") await db.exec("DROP TRIGGER claim_publish_upd");
    await db.run("INSERT INTO claim (id, claim_type, evidence_label, editorial_status, created_by, dataset_version) VALUES ('c1', 'historical_report', 'source_reported', 'approved', 't', ?)", [o.version ?? 1]);
    await db.run("INSERT INTO claim_text (claim_id, lang, text) VALUES ('c1', 'en', ?)", [`Synthetic claim, version ${o.version ?? 1}`]);
    if (o.broken !== "unsupported") await db.exec("INSERT INTO claim_passage (claim_id, passage_id, relation) VALUES ('c1', 'p1', 'supports')");
    await db.exec(`
      UPDATE claim SET editorial_status = 'published' WHERE id = 'c1';
      INSERT INTO edge (id, type, from_kind, from_id, to_kind, to_id, created_by, dataset_version) VALUES ('e1', 'CLAIM_CONCERNS_AYAH', 'claim', 'c1', 'ayah', '1:1', 't', 1);
      INSERT INTO edge_passage (edge_id, passage_id) VALUES ('e1', 'p1');
      UPDATE edge SET editorial_status = 'published' WHERE id = 'e1';
    `);
  }
  await db.close();
  return new Uint8Array(await readFile(path));
}

async function manifestFor(bytes: Uint8Array, over: Partial<PackManifest> = {}, key = keys.privateKeyPem): Promise<PackManifest> {
  const unsigned: PackManifest = {
    packId: "pack-a", packVersion: 1, schemaVersion: 2, kind: "knowledge", languages: ["en", "bn"], requires: [],
    publishedAt: "2026-10-14T00:00:00Z",
    file: { name: "pack-a.db", size: bytes.length, sha256: await sha256Hex(bytes) },
    licenses: [{ id: "lic-open", name: "Synthetic open licence", attribution: "Synthetic attribution" }],
    changelog: "Synthetic changelog",
    ...over,
  };
  return signManifest(unsigned, key);
}

type Handler = (url: string, n: number) => { status: number; bytes?: Uint8Array } | Error;
interface World {
  dir: string;
  ports: PackPorts;
  userDb: SqlDriver;
  calls: string[];
  serve(bytes: Uint8Array): void;
  handler: Handler;
}

async function world(): Promise<World> {
  const dir = await tmp();
  const files = createNodeFileStore(join(dir, "files"));
  const userDb = openNodeSqlite();
  await migrate(userDb, USER_MIGRATIONS);
  const quran = openNodeSqlite();
  await migrate(quran, CONTENT_MIGRATIONS);
  await quran.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
  `);
  const calls: string[] = [];
  const w: World = { dir, userDb, calls, ports: undefined as unknown as PackPorts, handler: () => new Error("no handler"), serve: () => {} };
  const http: PackHttp = {
    async get(url, opts) {
      calls.push(url);
      if (opts.signal?.aborted) throw new Error("aborted");
      const r = w.handler(url, calls.length);
      if (r instanceof Error) throw r;
      return { status: r.status, bytes: r.bytes ?? new Uint8Array() };
    },
  };
  w.serve = (bytes) => void (w.handler = () => ({ status: 200, bytes }));
  w.ports = {
    files, http, registry: createSqlPackRegistry(userDb), sha256: sha256Hex, verifySignature: signatureVerifier(keys.publicKeyPem),
    openDb: async (rel) => openNodeSqlite(files.resolve("packages", rel)), quran, appSchemaVersion: CONTENT_MIGRATIONS.length,
    now: () => 1_000, sleep: async () => {},
  };
  return w;
}

function must(r: InstallResult): Extract<InstallResult, { ok: true }> {
  if (!r.ok) throw new Error(`install failed: [${r.code}] ${r.message}`);
  return r;
}
const failure = (r: InstallResult): Extract<InstallResult, { ok: false }> => {
  if (r.ok) throw new Error("expected the install to fail");
  return r;
};
const leftovers = async (w: World): Promise<string[]> => (await w.ports.files.listWithSize("packages", "knowledge-packs")).map((e) => e.name).sort();

async function install(w: World, o: BuildOpts & { manifest?: Partial<PackManifest> } = {}, url = URL_A): Promise<InstallResult> {
  const bytes = await buildPackBytes(w.dir, o);
  w.serve(bytes);
  return installPack(w.ports, await manifestFor(bytes, { packVersion: o.version ?? 1, schemaVersion: o.schemaVersion ?? 2, ...(o.manifest ?? {}) }), url);
}

test("a valid signed pack installs: file, sidecar manifest, registry row, and the data can be read", async () => {
  const w = await world();
  const r = must(await install(w));
  assert.equal(r.replaced, null);
  assert.deepEqual((await w.ports.registry.list()).map((p) => [p.packId, p.packVersion, p.path]), [["pack-a", 1, "knowledge-packs/pack-a.v1.db"]]);
  assert.deepEqual(await leftovers(w), ["pack-a.v1.db", "pack-a.v1.manifest.json"]);
  const db = await w.ports.openDb(r.installed.path);
  assert.equal((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim WHERE editorial_status = 'published'"))?.n, 1);
  await db.close();
  assert.equal(r.installed.sha256, await sha256Hex(await w.ports.files.read("packages", r.installed.path)));
  assert.equal(await verifyInstalledPack(w.ports, r.installed), "ok");
  const stored = await readInstalledManifest(w.ports, r.installed);
  assert.equal(stored?.licenses[0]?.attribution, "Synthetic attribution");
});

test("an update replaces the old version only after the new one is in place", async () => {
  const w = await world();
  must(await install(w, { version: 1 }));
  const r = must(await install(w, { version: 2 }));
  assert.equal(r.replaced?.packVersion, 1);
  assert.deepEqual((await w.ports.registry.list()).map((p) => p.packVersion), [2]);
  assert.deepEqual(await leftovers(w), ["pack-a.v2.db", "pack-a.v2.manifest.json"]);
});

test("a failed update keeps the last known-good pack: bad download, invalid content, licence problems", async () => {
  const w = await world();
  must(await install(w, { version: 1 }));
  const before = await w.ports.files.read("packages", packDbPath("pack-a", 1));
  const keepsV1 = async (): Promise<void> => {
    assert.deepEqual((await w.ports.registry.list()).map((p) => p.packVersion), [1]);
    assert.deepEqual(await leftovers(w), ["pack-a.v1.db", "pack-a.v1.manifest.json"]); // no .part left behind
    assert.deepEqual(await w.ports.files.read("packages", packDbPath("pack-a", 1)), before);
  };

  const v2 = await buildPackBytes(w.dir, { version: 2 });
  const damaged = v2.slice();
  damaged[damaged.length - 1] = (damaged[damaged.length - 1] ?? 0) ^ 0xff;
  w.serve(damaged);
  assert.equal(failure(await installPack(w.ports, await manifestFor(v2, { packVersion: 2 }), URL_A)).code, "checksum-mismatch");
  await keepsV1();

  const bad = failure(await install(w, { version: 2, broken: "unsupported" }));
  assert.equal(bad.code, "validation-failed");
  assert.ok(bad.issues?.some((i) => i.code === "published-claim-unsupported"));
  await keepsV1();

  const pending = failure(await install(w, { version: 2, broken: "pending-licence", manifest: { licenses: [
    { id: "lic-open", name: "n", attribution: "a" }, { id: "lic-pending", name: "n", attribution: "a" }] } }));
  assert.equal(pending.code, "validation-failed");
  assert.ok(pending.issues?.some((i) => i.code === "licence-pending" && i.severity === "error"));
  await keepsV1();

  const undeclared = failure(await install(w, { version: 2, broken: "undeclared-licence" }));
  assert.ok(undeclared.issues?.some((i) => i.code === "licence-not-declared"));
  await keepsV1();
});

test("the manifest must be signed by the publisher's key and must not be altered", async () => {
  const w = await world();
  const bytes = await buildPackBytes(w.dir);
  w.serve(bytes);
  const good = await manifestFor(bytes);
  const { signature: _s, ...unsigned } = good;
  assert.equal(failure(await installPack(w.ports, unsigned, URL_A)).code, "signature-missing");
  assert.equal(failure(await installPack(w.ports, await manifestFor(bytes, {}, otherKeys.privateKeyPem), URL_A)).code, "signature-invalid");
  assert.equal(failure(await installPack(w.ports, { ...good, changelog: "edited after signing" }, URL_A)).code, "signature-invalid");
  assert.equal(failure(await installPack(w.ports, { ...good, signature: "!!!" }, URL_A)).code, "manifest-invalid");
  assert.equal(w.calls.length, 0, "nothing is downloaded for an unsigned or forged manifest");
  assert.deepEqual(await w.ports.registry.list(), []);
});

test("the signature does not depend on key order or whitespace, and covers every field", async () => {
  const w = await world();
  const bytes = await buildPackBytes(w.dir);
  const m = await manifestFor(bytes);
  const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(m).reverse()))) as PackManifest;
  assert.deepEqual(canonicalManifestBytes(reordered), canonicalManifestBytes(m));
  const verify = signatureVerifier(keys.publicKeyPem);
  assert.equal(await verify(canonicalManifestBytes(reordered), m.signature ?? ""), true);
  for (const tampered of [{ ...m, packVersion: 2 }, { ...m, file: { ...m.file, sha256: "0".repeat(64) } }, { ...m, requires: [{ packId: "x-pack", minVersion: 1 }] }])
    assert.equal(await verify(canonicalManifestBytes(tampered), m.signature ?? ""), false);
});

test("a malformed manifest is rejected with every problem named", async () => {
  const w = await world();
  const bytes = await buildPackBytes(w.dir);
  const m = await manifestFor(bytes);
  assert.deepEqual(validatePackManifest(m).issues, []);
  const bad = { ...m, packId: "Bad Id", packVersion: 0, kind: "audio", languages: [], file: { name: "../x.db", size: 0, sha256: "zz" }, licenses: [], changelog: " ", requires: [{ packId: m.packId, minVersion: 1 }] };
  const issues = validatePackManifest(bad).issues;
  assert.ok(issues.length >= 8);
  assert.equal(failure(await installPack(w.ports, bad, URL_A)).code, "manifest-invalid");
  assert.equal(failure(await installPack(w.ports, "nope", URL_A)).code, "manifest-invalid");
  assert.equal(failure(await installPack(w.ports, { ...m, file: { ...m.file, size: 300 * 1024 * 1024 } }, URL_A)).code, "manifest-invalid");
});

test("schema compatibility: older packs are migrated, newer ones and lying manifests are refused", async () => {
  const w = await world();
  const old = must(await install(w, { schemaVersion: 1 }));
  const db = await w.ports.openDb(old.installed.path);
  assert.equal((await db.get<{ v: number }>("SELECT MAX(id) AS v FROM schema_migrations"))?.v, 2);
  await db.close();
  const diskHash = await sha256Hex(await w.ports.files.read("packages", old.installed.path));
  assert.equal(old.installed.sha256, diskHash, "the registry holds the hash of the file as installed (after migration)");
  assert.equal(await verifyInstalledPack(w.ports, old.installed), "ok");

  const w2 = await world();
  assert.equal(failure(await install(w2, { schemaVersion: 2, manifest: { schemaVersion: 3 } })).code, "app-too-old");
  assert.equal(failure(await install(w2, { schemaVersion: 2, manifest: { schemaVersion: 1 } })).code, "schema-error");
  const junk = new TextEncoder().encode("this is not a database".repeat(20));
  w2.serve(junk);
  assert.equal(failure(await installPack(w2.ports, await manifestFor(junk), URL_A)).code, "schema-error");
  assert.deepEqual(await leftovers(w2), []);
});

test("dependencies: a pack needs what it requires, and a required pack cannot be removed", async () => {
  const w = await world();
  const needsA = { packId: "pack-b", file: { name: "pack-b.db" }, requires: [{ packId: "pack-a", minVersion: 2 }] } as const;
  const b = async (): Promise<InstallResult> => {
    const bytes = await buildPackBytes(w.dir);
    w.serve(bytes);
    return installPack(w.ports, await manifestFor(bytes, { packId: needsA.packId, requires: [...needsA.requires], file: { name: "pack-b.db", size: bytes.length, sha256: await sha256Hex(bytes) } }), "https://packs.example.invalid/pack-b.db");
  };
  assert.equal(failure(await b()).code, "missing-dependency");
  must(await install(w, { version: 1 }));
  assert.equal(failure(await b()).code, "missing-dependency"); // version 1 is older than the required 2
  must(await install(w, { version: 2 }));
  must(await b());

  const refused = await uninstallPack(w.ports, "pack-a");
  assert.deepEqual(refused, { ok: false, code: "required-by", message: "pack-b requires pack-a" });
  assert.equal((await w.ports.registry.list()).length, 2);
  assert.deepEqual(await uninstallPack(w.ports, "pack-b"), { ok: true });
  assert.deepEqual(await uninstallPack(w.ports, "pack-a"), { ok: true });
  assert.deepEqual(await leftovers(w), []);
  assert.equal((await uninstallPack(w.ports, "pack-a")).ok, false);
});

test("removing a pack leaves the user's bookmarks and the other downloads alone", async () => {
  const w = await world();
  must(await install(w));
  await w.userDb.run("INSERT INTO bookmarks (surah_id, ayah_number, created_at) VALUES (1, 1, 1)");
  await w.userDb.run("INSERT INTO downloads (id, kind, version, path, checksum, size_bytes, installed_at) VALUES ('tr-1', 'translation', '1', 'p', 'c', 1, 1)");
  await uninstallPack(w.ports, "pack-a");
  assert.equal((await w.userDb.all("SELECT * FROM bookmarks")).length, 1);
  assert.deepEqual((await w.userDb.all<{ id: string }>("SELECT id FROM downloads")).map((r) => r.id), ["tr-1"]);
});

test("the installed version is not installed again, unless it is a repair", async () => {
  const w = await world();
  const first = must(await install(w));
  assert.equal(failure(await install(w)).code, "not-newer");
  await w.ports.files.remove("packages", first.installed.path);
  assert.equal(await verifyInstalledPack(w.ports, first.installed), "missing");
  const bytes = await buildPackBytes(w.dir);
  w.serve(bytes);
  const repaired = must(await installPack(w.ports, await manifestFor(bytes), URL_A, { allowSameVersion: true }));
  assert.equal(await verifyInstalledPack(w.ports, repaired.installed), "ok");
  await writeFile(w.ports.files.resolve("packages", repaired.installed.path), new Uint8Array([1, 2, 3]));
  assert.equal(await verifyInstalledPack(w.ports, repaired.installed), "corrupt");
});

test("downloads: retries transient errors, never retries a 404, can be cancelled, needs https", async () => {
  const w = await world();
  const bytes = await buildPackBytes(w.dir);
  const m = await manifestFor(bytes);

  w.handler = (_u, n) => (n < 3 ? new Error("connection reset") : { status: 200, bytes });
  must(await installPack(w.ports, m, URL_A));
  assert.equal(w.calls.length, 3);
  await uninstallPack(w.ports, "pack-a");

  w.calls.length = 0;
  w.handler = () => ({ status: 404 });
  assert.equal(failure(await installPack(w.ports, m, URL_A)).code, "download-failed");
  assert.equal(w.calls.length, 1);

  w.calls.length = 0;
  w.handler = () => ({ status: 503 });
  assert.equal(failure(await installPack(w.ports, m, URL_A)).code, "download-failed");
  assert.equal(w.calls.length, 3);

  w.calls.length = 0;
  w.serve(new Uint8Array([...bytes, 0]));
  assert.equal(failure(await installPack(w.ports, m, URL_A)).code, "size-mismatch");

  w.calls.length = 0;
  w.serve(bytes);
  const ctl = new AbortController();
  ctl.abort();
  assert.equal(failure(await installPack(w.ports, m, URL_A, { signal: ctl.signal })).code, "cancelled");
  assert.equal(w.calls.length, 0);

  assert.equal(failure(await installPack(w.ports, m, "http://packs.example.invalid/pack-a.db")).code, "insecure-url");
  assert.deepEqual(await w.ports.registry.list(), []);
});

test("if recording the install fails, the new files are removed and the old version stays", async () => {
  const w = await world();
  must(await install(w, { version: 1 }));
  const real = w.ports.registry;
  const failing: PackRegistry = { ...real, upsert: async () => { throw new Error("disk full"); } };
  const result = failure(await install({ ...w, ports: { ...w.ports, registry: failing } } as World, { version: 2 }));
  assert.equal(result.code, "commit-failed");
  assert.match(result.message, /disk full/);
  assert.deepEqual((await real.list()).map((p) => p.packVersion), [1]);
  assert.deepEqual(await leftovers(w), ["pack-a.v1.db", "pack-a.v1.manifest.json"]);
});

test("sweepPacks removes interrupted downloads and orphans, and keeps what is installed", async () => {
  const w = await world();
  must(await install(w));
  const junk = new Uint8Array([1]);
  for (const name of ["pack-a.v2.db.part", "pack-z.v3.db", "pack-z.v3.manifest.json"]) await w.ports.files.write("packages", `knowledge-packs/${name}`, junk);
  assert.deepEqual(await sweepPacks(w.ports), ["pack-a.v2.db.part", "pack-z.v3.db", "pack-z.v3.manifest.json"]);
  assert.deepEqual(await leftovers(w), ["pack-a.v1.db", "pack-a.v1.manifest.json"]);
  assert.deepEqual(await sweepPacks(w.ports), []);
});

test("the registry keeps packs apart from other downloads", async () => {
  const userDb = openNodeSqlite();
  await migrate(userDb, USER_MIGRATIONS);
  await userDb.run("INSERT INTO downloads (id, kind, version, path, checksum, size_bytes, installed_at) VALUES ('pack-a', 'translation', '9', 'p', 'c', 1, 1)");
  const reg = createSqlPackRegistry(userDb);
  const rec: InstalledPack = { packId: "pack-a", packVersion: 1, path: "knowledge-packs/pack-a.v1.db", sha256: "a".repeat(64), sizeBytes: 10, installedAt: 5 };
  await reg.upsert(rec);
  await reg.upsert({ ...rec, packVersion: 2, installedAt: 6 });
  assert.deepEqual(await reg.list(), [{ ...rec, packVersion: 2, installedAt: 6 }]);
  assert.equal((await reg.get("pack-a"))?.packVersion, 2);
  assert.equal(await reg.get("nope"), undefined);
  await reg.remove("pack-a");
  assert.deepEqual(await reg.list(), []);
  assert.equal((await userDb.all("SELECT * FROM downloads")).length, 1, "the unrelated row with a similar id is untouched");
});

test("packStatus: what the Library screen shows for an available pack", async () => {
  const w = await world();
  const m = await manifestFor(await buildPackBytes(w.dir), { packVersion: 2, requires: [{ packId: "base", minVersion: 1 }] });
  const rec = (packId: string, packVersion: number): InstalledPack => ({ packId, packVersion, path: "p", sha256: "s", sizeBytes: 1, installedAt: 1 });
  assert.equal(packStatus(m, [], 2), "missing-dependency");
  assert.equal(packStatus(m, [rec("base", 1)], 2), "not-installed");
  assert.equal(packStatus(m, [rec("base", 1), rec("pack-a", 1)], 2), "update-available");
  assert.equal(packStatus(m, [rec("base", 1), rec("pack-a", 2)], 2), "installed");
  assert.equal(packStatus({ ...m, schemaVersion: 3 }, [rec("base", 1)], 2), "app-too-old");
});
