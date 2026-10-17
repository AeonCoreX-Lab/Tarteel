import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOOK_FILE, DUMP_BASE, syncQuranpedia } from "./sync.ts";
import type { Fetcher } from "./sync.ts";

// A fake Quranpedia: no network, synthetic bytes.
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const enc = (s: string): Buffer => Buffer.from(s, "utf8");

function remote(opts: { version: string; book: string; license?: string; liarAboutSha?: boolean }) {
  const book = enc(opts.book);
  const manifest = enc(JSON.stringify({ version: opts.version, generated_at: `${opts.version}T00:00:00+00:00`, files: [{ name: BOOK_FILE, dataset: "asbab-book-2919", sha256: opts.liarAboutSha ? "0".repeat(64) : sha(book), built_at: "x" }] }));
  const requested: string[] = [];
  const fetch: Fetcher = async (url) => {
    requested.push(url);
    const table: Record<string, Buffer> = { [`${DUMP_BASE}/manifest.json`]: manifest, [`${DUMP_BASE}/LICENSE.md`]: enc(opts.license ?? "licence v1"), [`${DUMP_BASE}/${BOOK_FILE}`]: book };
    const hit = table[url];
    return hit ? { status: 200, bytes: hit } : { status: 404, bytes: new Uint8Array() };
  };
  return { fetch, requested };
}

const tmp = async (): Promise<string> => mkdtemp(join(tmpdir(), "qp-sync-"));

test("first sync downloads the three files, then an identical dump downloads no book", async () => {
  const dir = await tmp();
  try {
    const a = remote({ version: "2099-01-01", book: "book one" });
    const r1 = await syncQuranpedia({ dir, fetch: a.fetch });
    assert.deepEqual([r1.changed, r1.bookChanged, r1.fromVersion, r1.toVersion], [true, true, null, "2099-01-01"]);
    assert.equal(await readFile(join(dir, BOOK_FILE), "utf8"), "book one");
    assert.equal(await readFile(join(dir, "LICENSE.md"), "utf8"), "licence v1");

    const b = remote({ version: "2099-02-01", book: "book one" }); // newer dump, same book
    const r2 = await syncQuranpedia({ dir, fetch: b.fetch });
    assert.equal(r2.changed, false);
    assert.ok(!b.requested.some((u) => u.endsWith(BOOK_FILE)), "the book is not downloaded when its checksum is unchanged");
    assert.equal(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")).version, "2099-01-01", "no change, no write");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a changed book is downloaded and the manifest moves forward; a changed licence is flagged", async () => {
  const dir = await tmp();
  try {
    await syncQuranpedia({ dir, fetch: remote({ version: "2099-01-01", book: "book one" }).fetch });
    const r = await syncQuranpedia({ dir, fetch: remote({ version: "2099-03-01", book: "book two", license: "licence v2" }).fetch });
    assert.deepEqual([r.changed, r.bookChanged, r.licenseChanged, r.fromVersion, r.toVersion], [true, true, true, "2099-01-01", "2099-03-01"]);
    assert.equal(await readFile(join(dir, BOOK_FILE), "utf8"), "book two");
    const only = await syncQuranpedia({ dir, fetch: remote({ version: "2099-04-01", book: "book two", license: "licence v3" }).fetch });
    assert.deepEqual([only.changed, only.bookChanged, only.licenseChanged], [true, false, true]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("nothing is written when the download does not match the manifest, or the dump is older, or a request fails", async () => {
  const dir = await tmp();
  try {
    await assert.rejects(syncQuranpedia({ dir, fetch: remote({ version: "2099-01-01", book: "x", liarAboutSha: true }).fetch }), /sha256/);
    await assert.rejects(readFile(join(dir, "manifest.json")));
    await syncQuranpedia({ dir, fetch: remote({ version: "2099-05-01", book: "good" }).fetch });
    await assert.rejects(syncQuranpedia({ dir, fetch: remote({ version: "2099-01-01", book: "older" }).fetch }), /older/);
    assert.equal(await readFile(join(dir, BOOK_FILE), "utf8"), "good");
    await assert.rejects(syncQuranpedia({ dir, fetch: async () => ({ status: 503, bytes: new Uint8Array() }) }), /HTTP 503/);
    await writeFile(join(dir, "manifest.json"), "not json");
    await assert.rejects(syncQuranpedia({ dir, fetch: remote({ version: "2099-06-01", book: "y" }).fetch }), /local manifest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
