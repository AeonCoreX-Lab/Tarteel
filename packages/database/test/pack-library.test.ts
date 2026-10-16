import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlDriver } from "@tarteel/storage";
import { openNodeSqlite } from "../../../scripts/lib/node-sqlite-driver.ts";
import { createNodeFileStore } from "../../../scripts/lib/node-file-store.ts";
import { generatePackKeyPair, sha256Hex, signManifest, signatureVerifier } from "../../../scripts/lib/pack-tools.ts";
import { buildPackDatabase, makePackManifest } from "../../../scripts/build-pack/build.ts";
import { loadPackSource } from "../../../scripts/build-pack/source.ts";
import {
  CONTENT_MIGRATIONS, USER_MIGRATIONS, base64ToBytes, createPackLibrary, createPublisherVerifier, createSqlPackRegistry, mergeLibrary, migrate, parseEd25519PublicKeyPem, parsePackCatalog, validatePackManifest,
} from "../src/index.ts";
import type { PackHttp, PackManifest, PackPorts } from "../src/index.ts";

// ALL text below is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

const FIXTURE = fileURLToPath(new URL("../../../tests/fixtures/knowledge/example-pack", import.meta.url));
const CATALOG_URL = "https://packs.example.invalid/catalog.json";
const keys = generatePackKeyPair();

const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function builtPack(version: number): Promise<{ manifest: PackManifest; bytes: Uint8Array }> {
  const r = await loadPackSource(FIXTURE);
  assert.ok(r.source);
  const source = { ...r.source, meta: { ...r.source.meta, packVersion: version } };
  const dir = await mkdtemp(join(tmpdir(), "tarteel-library-"));
  dirs.push(dir);
  const name = `example-pack.v${version}.db`;
  const built = await buildPackDatabase(source, join(dir, name));
  const bytes = new Uint8Array(await readFile(built.dbPath));
  return { manifest: signManifest(await makePackManifest(source, bytes, name, built.selection.licenses), keys.privateKeyPem), bytes };
}

interface World {
  ports: PackPorts;
  served: Map<string, { status: number; bytes: Uint8Array }>;
  calls: string[];
  userDb: SqlDriver;
}
async function world(): Promise<World> {
  const dir = await mkdtemp(join(tmpdir(), "tarteel-library-w-"));
  dirs.push(dir);
  const files = createNodeFileStore(join(dir, "files"));
  const userDb = openNodeSqlite();
  await migrate(userDb, USER_MIGRATIONS);
  const quran = openNodeSqlite();
  await migrate(quran, CONTENT_MIGRATIONS);
  await quran.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
  `);
  const served = new Map<string, { status: number; bytes: Uint8Array }>();
  const calls: string[] = [];
  const http: PackHttp = {
    async get(url, o) {
      calls.push(url);
      if (o.signal?.aborted) throw new Error("aborted");
      const r = served.get(url);
      if (!r) throw new Error("connection refused");
      return r;
    },
  };
  const ports: PackPorts = {
    files, http, registry: createSqlPackRegistry(userDb), sha256: sha256Hex, verifySignature: signatureVerifier(keys.publicKeyPem),
    openDb: async (rel) => openNodeSqlite(files.resolve("packages", rel)), quran, appSchemaVersion: CONTENT_MIGRATIONS.length, now: () => 1_000, sleep: async () => {},
  };
  return { ports, served, calls, userDb };
}

const json = (v: unknown): { status: number; bytes: Uint8Array } => ({ status: 200, bytes: new TextEncoder().encode(JSON.stringify(v)) });
const catalogOf = (...packs: { manifest: PackManifest; url: string }[]): unknown => ({ schema: 1, packs });
const dbUrl = (v: number): string => `https://packs.example.invalid/example-pack.v${v}.db`;

test("the manifest carries the optional title and description, and rejects malformed ones", async () => {
  const { manifest } = await builtPack(1);
  assert.equal(manifest.title?.en, "Synthetic example pack");
  assert.deepEqual(validatePackManifest(manifest).issues, []);
  const bad = validatePackManifest({ ...manifest, title: { en: "" } });
  assert.equal(bad.manifest, null);
  assert.match(bad.issues[0]?.message ?? "", /title/);
  assert.equal(validatePackManifest({ ...manifest, description: { en: "x".repeat(401) } }).manifest, null);
});

test("parsePackCatalog keeps good entries, drops bad ones with a warning, keeps the newest version", async () => {
  const v1 = await builtPack(1);
  const v2 = await builtPack(2);
  const { signature: _omit, ...unsigned } = v1.manifest;
  void _omit;
  const r = parsePackCatalog(
    catalogOf(
      { manifest: v1.manifest, url: dbUrl(1) },
      { manifest: v2.manifest, url: dbUrl(2) },
      { manifest: unsigned as PackManifest, url: dbUrl(1) },
      { manifest: v2.manifest, url: "http://insecure.example.invalid/x.db" },
      { manifest: { nonsense: true }, url: dbUrl(1) },
    ),
  );
  assert.deepEqual(r.entries.map((e) => [e.manifest.packId, e.manifest.packVersion]), [["example-pack", 2]]);
  assert.equal(r.issues.filter((i) => i.code === "catalog-entry-ignored").length, 3);
  assert.equal(r.issues.some((i) => i.severity === "error"), false);
  for (const unknown of [null, [], { schema: 2, packs: [] }, { schema: 1 }]) assert.equal(parsePackCatalog(unknown).issues[0]?.code, "catalog-invalid");
});

test("refreshCatalog offers only packs whose signature verifies, and is the only call that fetches the catalogue", async () => {
  const w = await world();
  const v1 = await builtPack(1);
  const forged = { ...signManifest(v1.manifest, generatePackKeyPair().privateKeyPem), packId: "forged-pack" };
  w.served.set(CATALOG_URL, json(catalogOf({ manifest: v1.manifest, url: dbUrl(1) }, { manifest: forged, url: dbUrl(1) })));
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  assert.deepEqual(w.calls, []); // creating the library and reading rows never touch the network
  assert.deepEqual(await lib.rows(), []);
  assert.deepEqual(w.calls, []);
  const r = await lib.refreshCatalog();
  assert.ok(r.ok);
  assert.deepEqual(r.entries.map((e) => e.manifest.packId), ["example-pack"]);
  assert.equal(r.ignored, 1);
  assert.deepEqual(w.calls, [CATALOG_URL]);
});

test("refreshCatalog reports each failure with a code and leaves the previous catalogue in place", async () => {
  const w = await world();
  const v1 = await builtPack(1);
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  w.served.set(CATALOG_URL, json(catalogOf({ manifest: v1.manifest, url: dbUrl(1) })));
  assert.ok((await lib.refreshCatalog()).ok);

  w.served.set(CATALOG_URL, { status: 503, bytes: new Uint8Array() });
  assert.equal((await lib.refreshCatalog()).ok, false);
  w.served.set(CATALOG_URL, { status: 200, bytes: new TextEncoder().encode("<html>captive portal</html>") });
  const html = await lib.refreshCatalog();
  assert.ok(!html.ok && html.code === "catalog-invalid");
  w.served.set(CATALOG_URL, { status: 200, bytes: new Uint8Array(1024 * 1024 + 1) });
  const big = await lib.refreshCatalog();
  assert.ok(!big.ok && big.code === "catalog-invalid");
  w.served.delete(CATALOG_URL);
  const down = await lib.refreshCatalog();
  assert.ok(!down.ok && down.code === "download-failed");
  const controller = new AbortController();
  controller.abort();
  const stopped = await lib.refreshCatalog(controller.signal);
  assert.ok(!stopped.ok && stopped.code === "cancelled");
  assert.equal((await lib.rows()).length, 1, "the last good catalogue is still shown");
  assert.equal((await createPackLibrary(w.ports, { catalogUrl: "http://packs.example.invalid/catalog.json" }).refreshCatalog()).ok, false);
});

test("install, update, repair and remove through the library", async () => {
  const w = await world();
  const v1 = await builtPack(1);
  const v2 = await builtPack(2);
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  w.served.set(CATALOG_URL, json(catalogOf({ manifest: v1.manifest, url: dbUrl(1) })));
  w.served.set(dbUrl(1), { status: 200, bytes: v1.bytes });
  w.served.set(dbUrl(2), { status: 200, bytes: v2.bytes });

  assert.ok((await lib.refreshCatalog()).ok);
  let row = (await lib.rows())[0];
  assert.equal(row?.status, "not-installed");
  assert.ok(row?.offer);
  assert.equal((await lib.install(row.offer)).ok, true);

  row = (await lib.rows())[0];
  assert.equal(row?.status, "installed");
  assert.equal(row?.offer, null);
  assert.equal(row?.installed?.packVersion, 1);
  assert.equal(row?.manifest?.title?.en, "Synthetic example pack");

  // a newer version appears in the catalogue
  w.served.set(CATALOG_URL, json(catalogOf({ manifest: v2.manifest, url: dbUrl(2) })));
  await lib.refreshCatalog();
  row = (await lib.rows())[0];
  assert.equal(row?.status, "update-available");
  assert.ok(row?.offer);
  assert.equal((await lib.install(row.offer)).ok, true);
  assert.equal((await lib.rows())[0]?.installed?.packVersion, 2);

  // damage the file: startup notices, and a repair re-downloads the same version
  const path = (await w.ports.registry.get("example-pack"))?.path ?? "";
  await w.ports.files.write("packages", path, new Uint8Array([1, 2, 3]));
  const report = await lib.startup();
  assert.deepEqual(report.damaged.map((d) => [d.pack.packId, d.integrity]), [["example-pack", "corrupt"]]);
  row = (await lib.rows())[0];
  assert.equal(row?.status, "installed");
  assert.ok(row?.listed);
  assert.equal((await lib.install(row.listed, { allowSameVersion: true })).ok, true);
  assert.deepEqual((await lib.startup()).damaged, []);

  assert.equal((await lib.remove("example-pack")).ok, true);
  assert.equal((await lib.remove("example-pack")).ok, false);
  const after = (await lib.rows())[0];
  assert.equal(after?.status, "not-installed");
  assert.equal(after?.installed, null);
});

test("a pack installed earlier stays visible and removable without a catalogue", async () => {
  const w = await world();
  const v1 = await builtPack(1);
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  w.served.set(dbUrl(1), { status: 200, bytes: v1.bytes });
  assert.equal((await lib.install({ manifest: v1.manifest, url: dbUrl(1) })).ok, true);
  const offline = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  const rows = await offline.rows();
  assert.deepEqual(rows.map((r) => [r.packId, r.status, r.manifest?.title?.en]), [["example-pack", "not-listed", "Synthetic example pack"]]);
});

test("operations are serialized: two installs of the same pack at once end in one clean install", async () => {
  const w = await world();
  const v1 = await builtPack(1);
  w.served.set(dbUrl(1), { status: 200, bytes: v1.bytes });
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  const entry = { manifest: v1.manifest, url: dbUrl(1) };
  const [a, b] = await Promise.all([lib.install(entry), lib.install(entry)]);
  assert.equal(a.ok, true);
  assert.ok(!b.ok && b.code === "not-newer");
  assert.equal((await w.ports.registry.list()).length, 1);
  assert.deepEqual((await w.ports.files.listWithSize("packages", "knowledge-packs")).map((f) => f.name).sort(), ["example-pack.v1.db", "example-pack.v1.manifest.json"]);
});

test("mergeLibrary: app too old and missing dependency show as such and offer nothing", async () => {
  const v1 = await builtPack(1);
  const tooNew = { manifest: { ...v1.manifest, schemaVersion: 99 }, url: dbUrl(1) };
  const needs = { manifest: { ...v1.manifest, packId: "second-pack", requires: [{ packId: "base-pack", minVersion: 1 }] }, url: dbUrl(1) };
  const rows = mergeLibrary([tooNew, needs], [], CONTENT_MIGRATIONS.length);
  assert.deepEqual(rows.map((r) => [r.packId, r.status, r.offer]), [["example-pack", "app-too-old", null], ["second-pack", "missing-dependency", null]]);
});

test("parseEd25519PublicKeyPem reads what pack:keygen prints and nothing else", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const raw = publicKey.export({ type: "spki", format: "der" }).subarray(12);
  assert.deepEqual(Array.from(parseEd25519PublicKeyPem(pem) ?? []), Array.from(raw));
  assert.equal(parseEd25519PublicKeyPem(""), null);
  assert.equal(parseEd25519PublicKeyPem(pem.replace("PUBLIC KEY", "PRIVATE KEY")), null);
  assert.equal(parseEd25519PublicKeyPem(pem.replace(/\n[^\n-]+\n/, "\nAAAA\n")), null);
  const { publicKey: rsa } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.equal(parseEd25519PublicKeyPem(rsa.export({ type: "spki", format: "pem" }).toString()), null);
  assert.equal(base64ToBytes("not base64!"), null);
  assert.deepEqual(Array.from(base64ToBytes("AQID") ?? []), [1, 2, 3]);
});

test("createPublisherVerifier: any built-in key may sign, nothing verifies without a key, garbage is just false", async () => {
  const { createPublicKey, verify } = await import("node:crypto");
  const SPKI = Buffer.from("302a300506032b6570032100", "hex");
  const nodeVerify = (sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean =>
    verify(null, msg, createPublicKey({ key: Buffer.concat([SPKI, pub]), format: "der", type: "spki" }), sig);
  const a = generatePackKeyPair();
  const b = generatePackKeyPair();
  const { manifest } = await builtPack(1); // signed with `keys`
  const bytes = (await import("../src/index.ts")).canonicalManifestBytes(manifest);
  const sig = manifest.signature ?? "";
  assert.equal(await createPublisherVerifier([a.publicKeyPem, keys.publicKeyPem], nodeVerify)(bytes, sig), true);
  assert.equal(await createPublisherVerifier([a.publicKeyPem, b.publicKeyPem], nodeVerify)(bytes, sig), false);
  assert.equal(await createPublisherVerifier([], nodeVerify)(bytes, sig), false);
  assert.equal(await createPublisherVerifier(["not a key"], nodeVerify)(bytes, sig), false);
  const v = createPublisherVerifier([keys.publicKeyPem], nodeVerify);
  assert.equal(await v(bytes, "!!!"), false);
  assert.equal(await v(bytes, "AAAA"), false);
  assert.equal(await v(new TextEncoder().encode("other message"), sig), false);
  assert.equal(await createPublisherVerifier([keys.publicKeyPem], () => { throw new Error("boom"); })(bytes, sig), false);
});

test("key rotation and revocation: installed packs are re-checked against the keys THIS app trusts", async () => {
  const { isPackTrusted, verifyInstalledPack } = await import("../src/index.ts");
  const { createPublicKey, verify } = await import("node:crypto");
  const SPKI = Buffer.from("302a300506032b6570032100", "hex");
  const nodeVerify = (sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean =>
    verify(null, msg, createPublicKey({ key: Buffer.concat([SPKI, pub]), format: "der", type: "spki" }), sig);
  const w = await world(); // trusts `keys`
  const v1 = await builtPack(1);
  w.served.set(dbUrl(1), { status: 200, bytes: v1.bytes });
  const lib = createPackLibrary(w.ports, { catalogUrl: CATALOG_URL });
  assert.equal((await lib.install({ manifest: v1.manifest, url: dbUrl(1) })).ok, true);
  const pack = (await w.ports.registry.get("example-pack"))!;
  assert.equal(await isPackTrusted(w.ports, pack), true);
  assert.equal(await verifyInstalledPack(w.ports, pack), "ok");

  // the old key is revoked: an app that trusts only a new key no longer trusts what the old key signed
  const next = generatePackKeyPair();
  const rotated: PackPorts = { ...w.ports, verifySignature: createPublisherVerifier([next.publicKeyPem], nodeVerify) };
  assert.equal(await isPackTrusted(rotated, pack), false);
  assert.equal(await verifyInstalledPack(rotated, pack), "untrusted");
  assert.deepEqual((await createPackLibrary(rotated, { catalogUrl: CATALOG_URL }).startup()).damaged.map((d) => [d.pack.packId, d.integrity]), [["example-pack", "untrusted"]]);

  // during a rotation the app trusts both keys: nothing is lost
  const both: PackPorts = { ...w.ports, verifySignature: createPublisherVerifier([next.publicKeyPem, keys.publicKeyPem], nodeVerify) };
  assert.equal(await isPackTrusted(both, pack), true);

  // a manifest next to the pack that was edited (here: claims another version) is not trusted either
  const sidecar = pack.path.replace(/\.db$/, ".manifest.json");
  const stored = JSON.parse(new TextDecoder().decode(await w.ports.files.read("packages", sidecar))) as Record<string, unknown>;
  await w.ports.files.write("packages", sidecar, new TextEncoder().encode(JSON.stringify({ ...stored, changelog: "tampered" })));
  assert.equal(await isPackTrusted(w.ports, pack), false);
  await w.ports.files.write("packages", sidecar, new TextEncoder().encode(JSON.stringify({ ...stored, packVersion: 7 })));
  assert.equal(await isPackTrusted(w.ports, pack), false);
  await w.ports.files.remove("packages", sidecar);
  assert.equal(await isPackTrusted(w.ports, pack), false, "no manifest, no trust");
});
