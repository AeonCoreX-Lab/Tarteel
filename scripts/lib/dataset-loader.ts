import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DatasetManifest } from "@tarteel/types";
import type { Issue, NumberingConvention } from "@tarteel/quran-data";
import { validateAyahs, validateManifest, verifyFileHashes } from "@tarteel/quran-data";

export const sha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

export interface LoadedDataset {
  dir: string;
  manifest: DatasetManifest;
  /** sha256 over the sorted "name:hash" lines of manifest.files */
  checksum: string;
  ayahs: unknown;
  issues: Issue[];
}

export function combinedChecksum(files: Record<string, string>): string {
  const lines = Object.keys(files).sort().map((k) => `${k}:${files[k]}\n`).join("");
  return createHash("sha256").update(lines).digest("hex");
}

export async function listDatasetDirs(root: string): Promise<string[]> {
  try {
    const names = await readdir(root);
    const out: string[] = [];
    for (const n of names.sort()) {
      if (n.startsWith(".")) continue;
      if ((await stat(join(root, n))).isDirectory()) out.push(join(root, n));
    }
    return out;
  } catch {
    return [];
  }
}

/** Loads + fully validates a dataset directory. Never mutates any file. */
export async function loadAndValidate(dir: string, convention: NumberingConvention, expectedKind: "quran" | "translation"): Promise<LoadedDataset> {
  const issues: Issue[] = [];
  let manifest: DatasetManifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as DatasetManifest;
  } catch (e) {
    return { dir, manifest: {} as DatasetManifest, checksum: "", ayahs: null, issues: [{ severity: "error", code: "manifest-unreadable", message: `${dir}: ${(e as Error).message}` }] };
  }
  issues.push(...validateManifest(manifest, dir));
  if (manifest.kind !== expectedKind) issues.push({ severity: "error", code: "wrong-kind", message: `${dir}: expected kind "${expectedKind}", got "${manifest.kind}"` });
  if (manifest.numberingConvention !== convention.id)
    issues.push({ severity: "error", code: "numbering-mismatch", message: `${dir}: manifest numbering "${manifest.numberingConvention}" != "${convention.id}"` });
  if (manifest.files && typeof manifest.files === "object") {
    issues.push(...(await verifyFileHashes(manifest, (n) => readFile(join(dir, n)), sha256)));
    if (!manifest.files["ayahs.json"]) issues.push({ severity: "error", code: "manifest-missing", message: `${dir}: files must include ayahs.json` });
  }
  let ayahs: unknown = null;
  try {
    ayahs = JSON.parse(await readFile(join(dir, "ayahs.json"), "utf8"));
    issues.push(...validateAyahs(ayahs, convention, manifest.id ?? dir).issues);
  } catch (e) {
    issues.push({ severity: "error", code: "ayahs-unreadable", message: `${dir}/ayahs.json: ${(e as Error).message}` });
  }
  return { dir, manifest, checksum: manifest.files ? combinedChecksum(manifest.files) : "", ayahs, issues };
}

export function printIssues(issues: Issue[]): number {
  let errors = 0;
  for (const i of issues) {
    if (i.severity === "error") errors++;
    console.log(`  ${i.severity === "error" ? "✗" : "!"} [${i.code}] ${i.message}`);
  }
  return errors;
}
