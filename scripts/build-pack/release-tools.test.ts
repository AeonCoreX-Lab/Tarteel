import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  CONTENT_MIGRATIONS, USER_MIGRATIONS, createKnowledgeReader, createPackLibrary, createPublisherVerifier, createSqlPackRegistry, migrate,
} from "@tarteel/database";
import type { PackHttp, PackPorts } from "@tarteel/database";
import { createPublicKey, verify } from "node:crypto";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { createNodeFileStore } from "../lib/node-file-store.ts";
import { generatePackKeyPair, sha256Hex } from "../lib/pack-tools.ts";
import { buildAppConfig, formatAppConfig } from "./app-config.ts";
import { buildDemoPacks } from "./demo-lib.ts";

// ALL pack text here is synthetic placeholder text. No Quran, hadith or tafsir content belongs in tests.

const run = promisify(execFile);
const dirs: string[] = [];
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), "tarteel-release-"));
  dirs.push(d);
  return d;
};
const CATALOG = "https://packs.example.invalid/catalog.json";
const exitsWith1 = (e: unknown): boolean => (e as { code?: number }).code === 1 && /✗/.test((e as { stdout?: string }).stdout ?? "");

test("buildAppConfig accepts an https catalogue address with public keys and refuses everything else", () => {
  const a = generatePackKeyPair();
  const b = generatePackKeyPair();
  const ok = buildAppConfig(CATALOG, [a.publicKeyPem, b.publicKeyPem]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config?.publisherKeys.length, 2);
  assert.ok(ok.config?.publisherKeys.every((k) => k.endsWith("-----\n")));
  const bad = (url: string, keys: string[]): string => buildAppConfig(url, keys).errors.join(" | ");
  assert.match(bad("http://packs.example.invalid/catalog.json", [a.publicKeyPem]), /https/);
  assert.match(bad("https://packs.example.invalid/", [a.publicKeyPem]), /catalog\.json/);
  assert.match(bad("https://packs.example.invalid/ catalog.json", [a.publicKeyPem]), /catalog\.json/);
  assert.match(bad(CATALOG, []), /at least one/);
  assert.match(bad(CATALOG, [a.privateKeyPem]), /PRIVATE/);
  assert.match(bad(CATALOG, ["nonsense"]), /not an Ed25519/);
  assert.match(bad(CATALOG, [a.publicKeyPem, a.publicKeyPem + "\n"]), /twice/);
  assert.equal(buildAppConfig("nope", []).config, null);
});

test("pack:configure writes the app config, and --check notices when it is out of date", async () => {
  const dir = await tmp();
  const keys = generatePackKeyPair();
  const keyPath = join(dir, "key.pub.pem");
  const configPath = join(dir, "config.json");
  await writeFile(keyPath, keys.publicKeyPem);
  const cli = (...extra: string[]) => run("node", ["--no-warnings", "scripts/build-pack/configure-app.ts", "--catalog-url", CATALOG, "--key", keyPath, "--config", configPath, ...extra], { cwd: process.cwd() });

  await assert.rejects(cli("--check"), exitsWith1); // nothing written yet
  const wrote = await cli();
  assert.match(wrote.stdout, /wrote/);
  const written = JSON.parse(await readFile(configPath, "utf8")) as { catalogUrl: string; publisherKeys: string[] };
  assert.equal(written.catalogUrl, CATALOG);
  assert.equal(written.publisherKeys[0]?.trim(), keys.publicKeyPem.trim());
  assert.match((await cli("--check")).stdout, /up to date/);
  await writeFile(configPath, formatAppConfig({ catalogUrl: CATALOG, publisherKeys: [] }));
  await assert.rejects(cli("--check"), exitsWith1);
  await assert.rejects(run("node", ["--no-warnings", "scripts/build-pack/configure-app.ts", "--catalog-url", "http://x.invalid/catalog.json", "--key", keyPath, "--config", configPath], { cwd: process.cwd() }), exitsWith1);
});

test("the demo packs behave like the device checklist expects: install v1, update to v2, wrong key refused", async () => {
  const dir = await tmp();
  const demo = await buildDemoPacks(join(dir, "out"), "https://demo.example.invalid/tarteel/");
  assert.deepEqual(demo.files.sort(), ["catalog-v2.json", "catalog.json", "demo-publisher-key.pub.pem", "example-pack.v1.db", "example-pack.v2.db"]);
  assert.equal(demo.catalogV1.packs[0]?.url, "https://demo.example.invalid/tarteel/example-pack.v1.db");
  assert.equal(demo.catalogV2.packs[0]?.manifest.packVersion, 2);
  await assert.rejects(buildDemoPacks(join(dir, "x"), "http://insecure.invalid/"), /https/);

  const served = new Map<string, Uint8Array>();
  const serve = async (name: string, as: string): Promise<void> => void served.set(`https://demo.example.invalid/tarteel/${as}`, new Uint8Array(await readFile(join(dir, "out", name))));
  await serve("catalog.json", "catalog.json");
  await serve("example-pack.v1.db", "example-pack.v1.db");
  await serve("example-pack.v2.db", "example-pack.v2.db");
  const http: PackHttp = { get: async (url) => (served.has(url) ? { status: 200, bytes: served.get(url)! } : { status: 404, bytes: new Uint8Array() }) };

  const files = createNodeFileStore(join(dir, "files"));
  const userDb = openNodeSqlite();
  await migrate(userDb, USER_MIGRATIONS);
  const quran = openNodeSqlite();
  await migrate(quran, CONTENT_MIGRATIONS);
  await quran.exec(`
    INSERT INTO surahs (id, name_arabic, name_transliteration, name_english, revelation_place, ayah_count) VALUES (1, 'a', 'One', 'First', 'makkah', 2);
    INSERT INTO ayahs (id, surah_id, ayah_number, text_arabic, text_search) VALUES (1, 1, 1, 'x', 'x'), (2, 1, 2, 'y', 'y');
  `);
  // The app's own verifier shape (raw Ed25519 check against the PEM in config.json), here backed by node:crypto.
  const SPKI = Buffer.from("302a300506032b6570032100", "hex");
  const nodeVerify = (sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean => verify(null, msg, createPublicKey({ key: Buffer.concat([SPKI, pub]), format: "der", type: "spki" }), sig);
  const ports = (pem: string): PackPorts => ({
    files, http, registry: createSqlPackRegistry(userDb), sha256: sha256Hex, verifySignature: createPublisherVerifier([pem], nodeVerify),
    openDb: async (rel) => openNodeSqlite(files.resolve("packages", rel)), quran, appSchemaVersion: CONTENT_MIGRATIONS.length,
  });

  // an app built with some OTHER key sees nothing and installs nothing
  const stranger = createPackLibrary(ports(generatePackKeyPair().publicKeyPem), { catalogUrl: "https://demo.example.invalid/tarteel/catalog.json" });
  const none = await stranger.refreshCatalog();
  assert.ok(none.ok && none.entries.length === 0);

  const lib = createPackLibrary(ports(demo.publicKeyPem), { catalogUrl: "https://demo.example.invalid/tarteel/catalog.json" });
  const reader = createKnowledgeReader({ registry: createSqlPackRegistry(userDb), openDb: async (rel) => openNodeSqlite(files.resolve("packages", rel)) });
  assert.deepEqual(await reader.coverage(1), { surahClaims: 0, surahEntities: 0, ayahs: [] }, "nothing installed yet");

  const first = await lib.refreshCatalog();
  assert.ok(first.ok && first.entries.length === 1);
  const entry1 = first.ok ? first.entries[0]! : (undefined as never);
  assert.equal((await lib.install(entry1)).ok, true);
  assert.deepEqual((await reader.surah(1, "en")).map((c) => c.key), ["example-pack:c-disputed", "example-pack:c-published-1", "example-pack:c-published-2"]);
  const disputed = (await reader.surah(1, "en"))[0]!;
  assert.equal(disputed.evidenceLabel, "disputed");
  assert.ok(disputed.uncertaintyNote && disputed.contradicts.length === 1 && disputed.supports.length === 1);
  assert.equal((await reader.surah(1, "en")).some((c) => c.text === "Synthetic claim one."), true);
  assert.deepEqual((await reader.coverage(1)).ayahs, [1, 2], "ayah 1 by a report, claim and event; ayah 2 by the place that is mentioned in it");
  assert.equal((await reader.surah(1, "bn")).find((c) => c.key === "example-pack:c-published-1")?.text, "কৃত্রিম দাবি এক।");

  // version 2 is published: the catalogue changes, the Library offers an update, the reader shows the edit and the retraction
  await serve("catalog-v2.json", "catalog.json");
  await lib.refreshCatalog();
  const row = (await lib.rows())[0]!;
  assert.equal(row.status, "update-available");
  assert.equal((await lib.install(row.offer!)).ok, true);
  const after2 = await reader.surah(1, "en");
  assert.equal(after2.find((c) => c.key === "example-pack:c-published-1")?.text, "Synthetic claim one, edited in version 2.");
  assert.deepEqual(after2.map((c) => c.key), ["example-pack:c-disputed", "example-pack:c-published-1"], "the retracted claim is gone");
  assert.equal((await lib.remove("example-pack")).ok, true);
  assert.deepEqual(await reader.surah(1, "en"), []);
  await reader.close();
});
