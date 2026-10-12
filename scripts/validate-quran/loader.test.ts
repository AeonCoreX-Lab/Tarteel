import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { combinedChecksum, loadAndValidate, sha256 } from "../lib/dataset-loader.ts";

const TINY = { id: "tiny", ayahCounts: [1, 2] };
// Synthetic placeholder text, NOT Quran content.
const ayahs = JSON.stringify([{ surah: 1, ayah: 1, text: "a" }, { surah: 2, ayah: 1, text: "b" }, { surah: 2, ayah: 2, text: "c" }]);

async function makeDir(ayahsText: string, hashOverride?: string) {
  const dir = await mkdtemp(join(tmpdir(), "tarteel-"));
  const hash = hashOverride ?? (await sha256(new TextEncoder().encode(ayahsText)));
  await writeFile(join(dir, "ayahs.json"), ayahsText);
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    id: "t", kind: "quran", version: "1", language: "ar", languageName: "Arabic", direction: "rtl",
    source: { name: "s", url: "https://example.org" }, license: { name: "l" }, copyright: "c", attribution: "a",
    numberingConvention: "tiny", redistributionPermitted: true, importedAt: "2026-01-01", files: { "ayahs.json": hash },
  }));
  return dir;
}

test("a correct dataset directory validates cleanly", async () => {
  const d = await loadAndValidate(await makeDir(ayahs), TINY, "quran");
  assert.deepEqual(d.issues.filter((i) => i.severity === "error"), []);
  assert.equal(d.checksum, combinedChecksum(d.manifest.files));
});

test("any change to the file after hashing is caught (unexpected text change)", async () => {
  const d = await loadAndValidate(await makeDir(ayahs.replace('"a"', '"A"'), await sha256(new TextEncoder().encode(ayahs))), TINY, "quran");
  assert.ok(d.issues.some((i) => i.code === "checksum-mismatch"));
});

test("missing manifest and wrong kind fail", async () => {
  assert.ok((await loadAndValidate("/nonexistent", TINY, "quran")).issues.some((i) => i.code === "manifest-unreadable"));
  assert.ok((await loadAndValidate(await makeDir(ayahs), TINY, "translation")).issues.some((i) => i.code === "wrong-kind"));
});
