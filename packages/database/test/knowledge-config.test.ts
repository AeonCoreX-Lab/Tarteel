import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEd25519PublicKeyPem } from "../src/index.ts";

// The app's pack settings live in apps/mobile/src/knowledge/config.json. A wrong value there silently disables packs or,
// worse, trusts the wrong key, so CI checks the file against the publisher key committed in data/knowledge/.
const CONFIG = fileURLToPath(new URL("../../../apps/mobile/src/knowledge/config.json", import.meta.url));
const PUBLISHER_KEY = fileURLToPath(new URL("../../../data/knowledge/PUBLISHER-KEY.pub.pem", import.meta.url));

test("the app's pack config is well formed: https catalogue address, valid Ed25519 public keys", async () => {
  const c = JSON.parse(await readFile(CONFIG, "utf8")) as { catalogUrl: unknown; publisherKeys: unknown };
  assert.equal(typeof c.catalogUrl, "string");
  assert.ok(c.catalogUrl === "" || (c.catalogUrl as string).startsWith("https://"), "catalogUrl must be empty (packs off) or start with https://");
  assert.ok(Array.isArray(c.publisherKeys));
  for (const k of c.publisherKeys as unknown[]) {
    assert.equal(typeof k, "string");
    assert.ok(parseEd25519PublicKeyPem(k as string), "every publisherKeys entry must be an Ed25519 public key PEM (npm run pack:keygen prints one)");
    assert.doesNotMatch(k as string, /PRIVATE/);
  }
});

test("when the publisher key file is committed, the app trusts exactly that key", async () => {
  if (!existsSync(PUBLISHER_KEY)) return; // no key generated yet: packs stay off, which the first test allows
  const c = JSON.parse(await readFile(CONFIG, "utf8")) as { publisherKeys: string[] };
  const committed = (await readFile(PUBLISHER_KEY, "utf8")).trim();
  assert.ok(parseEd25519PublicKeyPem(committed), "data/knowledge/PUBLISHER-KEY.pub.pem is not an Ed25519 public key");
  assert.ok(c.publisherKeys.some((k) => k.trim() === committed), "apps/mobile/src/knowledge/config.json does not list data/knowledge/PUBLISHER-KEY.pub.pem");
});
