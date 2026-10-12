import type { DatasetManifest } from "@tarteel/types";
import type { NumberingConvention } from "./numbering.ts";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: Issue[];
  stats: { surahs: number; ayahs: number };
}

const MAX_REPORTED_PER_CODE = 20;

class Collector {
  issues: Issue[] = [];
  private counts = new Map<string, number>();
  add(severity: Severity, code: string, message: string): void {
    const n = (this.counts.get(code) ?? 0) + 1;
    this.counts.set(code, n);
    if (n <= MAX_REPORTED_PER_CODE) this.issues.push({ severity, code, message });
    else if (n === MAX_REPORTED_PER_CODE + 1)
      this.issues.push({ severity, code, message: `(further "${code}" issues suppressed)` });
  }
  get hasErrors(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/**
 * Validates an ayahs.json payload (Quran or translation) against a numbering
 * convention. Text content is never altered or normalised here: only inspected.
 */
export function validateAyahs(
  records: unknown,
  convention: NumberingConvention,
  label = "dataset",
): ValidationReport {
  const c = new Collector();
  const counts = convention.ayahCounts;
  let ayahTotal = 0;
  const seen = new Set<string>();
  const perSurah = new Map<number, Set<number>>();

  if (!Array.isArray(records)) {
    c.add("error", "not-array", `${label}: ayahs file must be a JSON array`);
    return { ok: false, issues: c.issues, stats: { surahs: 0, ayahs: 0 } };
  }

  let prevSurah = 0;
  let prevAyah = 0;
  records.forEach((r: unknown, idx) => {
    const where = `${label} record #${idx}`;
    if (typeof r !== "object" || r === null) {
      c.add("error", "bad-record", `${where}: not an object`);
      return;
    }
    const { surah, ayah, text } = r as Record<string, unknown>;
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) {
      c.add("error", "bad-numbering", `${where}: surah/ayah must be integers`);
      return;
    }
    const s = surah as number;
    const a = ayah as number;
    ayahTotal++;
    if (s < 1 || s > counts.length) {
      c.add("error", "extra-surah", `${where}: surah ${s} is outside 1..${counts.length}`);
      return;
    }
    if (a < 1 || a > (counts[s - 1] as number)) {
      c.add("error", "invalid-ayah-number", `${where}: ${s}:${a} outside 1..${counts[s - 1]}`);
      return;
    }
    const key = `${s}:${a}`;
    if (seen.has(key)) c.add("error", "duplicate-ayah", `${where}: duplicate ${key}`);
    seen.add(key);
    if (!perSurah.has(s)) perSurah.set(s, new Set());
    perSurah.get(s)?.add(a);

    if (s < prevSurah || (s === prevSurah && a <= prevAyah))
      c.add("error", "bad-order", `${where}: ${key} is out of order after ${prevSurah}:${prevAyah}`);
    prevSurah = s;
    prevAyah = a;

    if (typeof text !== "string") {
      c.add("error", "bad-text", `${where} (${key}): text must be a string`);
      return;
    }
    if (text.trim().length === 0) c.add("error", "empty-verse", `${key}: empty text`);
    if (text.includes("\uFFFD")) c.add("error", "broken-utf8", `${key}: contains U+FFFD replacement character`);
    if (hasLoneSurrogate(text)) c.add("error", "broken-utf8", `${key}: lone surrogate`);
    if (CONTROL_CHARS.test(text)) c.add("error", "control-char", `${key}: control character in text`);
    if (text !== text.trim()) c.add("warning", "untrimmed", `${key}: leading/trailing whitespace`);
  });

  let surahsPresent = 0;
  for (let s = 1; s <= counts.length; s++) {
    const have = perSurah.get(s);
    const expected = counts[s - 1] as number;
    if (!have) {
      c.add("error", "missing-surah", `surah ${s} is missing entirely`);
      continue;
    }
    surahsPresent++;
    if (have.size !== expected) {
      const missing: number[] = [];
      for (let a = 1; a <= expected; a++) if (!have.has(a)) missing.push(a);
      c.add(
        "error",
        "missing-ayah",
        `surah ${s}: expected ${expected} ayahs, found ${have.size}; missing ${missing.slice(0, 10).join(",")}${missing.length > 10 ? ",…" : ""}`,
      );
    }
  }
  const expectedTotal = counts.reduce((x, y) => x + y, 0);
  if (ayahTotal !== expectedTotal)
    c.add("error", "total-mismatch", `${label}: ${ayahTotal} records, expected ${expectedTotal} (${convention.id})`);

  return { ok: !c.hasErrors, issues: c.issues, stats: { surahs: surahsPresent, ayahs: ayahTotal } };
}

const REQUIRED_STRINGS = [
  "id", "version", "language", "languageName", "copyright", "attribution",
  "numberingConvention", "importedAt",
] as const;

export function validateManifest(m: unknown, label = "manifest"): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, message: string) => out.push({ severity: "error", code, message: `${label}: ${message}` });
  if (typeof m !== "object" || m === null) {
    err("manifest-invalid", "not an object");
    return out;
  }
  const o = m as Record<string, unknown>;
  for (const k of REQUIRED_STRINGS)
    if (typeof o[k] !== "string" || (o[k] as string).trim() === "") err("manifest-missing", `"${k}" is required`);
  if (o["kind"] !== "quran" && o["kind"] !== "translation") err("manifest-missing", `"kind" must be quran|translation`);
  if (o["direction"] !== "ltr" && o["direction"] !== "rtl") err("manifest-missing", `"direction" must be ltr|rtl`);
  const src = o["source"] as Record<string, unknown> | undefined;
  if (!src || typeof src["name"] !== "string" || typeof src["url"] !== "string" || !src["name"] || !src["url"])
    err("manifest-missing", `"source.name" and "source.url" are required`);
  const lic = o["license"] as Record<string, unknown> | undefined;
  if (!lic || typeof lic["name"] !== "string" || !lic["name"]) err("manifest-missing", `"license.name" is required`);
  if (typeof o["redistributionPermitted"] !== "boolean") err("manifest-missing", `"redistributionPermitted" must be boolean`);
  else if (o["redistributionPermitted"] !== true)
    err("not-redistributable", `redistributionPermitted is not true: this dataset must not be bundled`);
  if (o["kind"] === "translation" && (typeof o["translator"] !== "string" || !o["translator"]))
    err("manifest-missing", `"translator" is required for translations`);
  const files = o["files"];
  if (typeof files !== "object" || files === null || Object.keys(files).length === 0) err("manifest-missing", `"files" (name -> sha256) is required`);
  else
    for (const [name, h] of Object.entries(files as Record<string, unknown>))
      if (typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h)) err("manifest-bad-hash", `files["${name}"] is not a lowercase sha256`);
  return out;
}

/** Verifies file bytes against the manifest. hash(bytes) must return lowercase hex sha256. */
export async function verifyFileHashes(
  manifest: Pick<DatasetManifest, "files">,
  readFile: (name: string) => Promise<Uint8Array>,
  sha256: (bytes: Uint8Array) => Promise<string>,
): Promise<Issue[]> {
  const out: Issue[] = [];
  for (const [name, expected] of Object.entries(manifest.files)) {
    let actual: string;
    try {
      actual = await sha256(await readFile(name));
    } catch (e) {
      out.push({ severity: "error", code: "file-unreadable", message: `${name}: ${(e as Error).message}` });
      continue;
    }
    if (actual !== expected)
      out.push({ severity: "error", code: "checksum-mismatch", message: `${name}: sha256 ${actual} != manifest ${expected}` });
  }
  return out;
}
