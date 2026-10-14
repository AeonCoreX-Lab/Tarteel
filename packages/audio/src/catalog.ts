import { globalAyahNumber } from "./refs.ts";
import type { AyahRef, Reciter } from "./types.ts";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function httpsUrl(v: unknown): boolean {
  if (typeof v !== "string" || /\s/.test(v)) return false;
  try {
    return new URL(v.replace(/\{(surah3|ayah3|ayah)\}/g, "000")).protocol === "https:";
  } catch {
    return false;
  }
}

/** Problems with one catalog entry; empty means it is well formed. */
export function reciterProblems(raw: unknown): string[] {
  if (!isRecord(raw)) return ["entry is not an object"];
  const p: string[] = [];
  const id = raw.id;
  if (typeof id !== "string" || !ID_RE.test(id)) p.push("id must match [a-z0-9][a-z0-9-]{0,39}");
  if (!str(raw.name)) p.push("name is required");
  if (!str(raw.arabicName)) p.push("arabicName is required");
  if (!str(raw.attribution)) p.push("attribution is required");
  if (!str(raw.riwayah)) p.push("riwayah is required");
  const tpl = raw.urlTemplate;
  if (typeof tpl !== "string" || !httpsUrl(tpl)) p.push("urlTemplate must be an https URL");
  else {
    const bySurah = tpl.includes("{surah3}") && tpl.includes("{ayah3}");
    const byNumber = tpl.includes("{ayah}");
    if (!bySurah && !byNumber) p.push("urlTemplate needs {surah3} and {ayah3}, or {ayah} (the 1..6236 number)");
    else if (bySurah && byNumber) p.push("urlTemplate must use either {surah3}{ayah3} or {ayah}, not both");
    if (tpl.includes("..")) p.push("urlTemplate must not contain '..'");
  }
  const kbps = raw.bitrateKbps;
  if (typeof kbps !== "number" || !Number.isInteger(kbps) || kbps < 16 || kbps > 320) p.push("bitrateKbps must be an integer 16..320");
  if (typeof raw.enabled !== "boolean") p.push("enabled must be true or false");
  if (raw.aliases !== undefined && !(Array.isArray(raw.aliases) && raw.aliases.every((a) => typeof a === "string"))) p.push("aliases must be strings");

  const v = raw.verification;
  if (!isRecord(v)) p.push("verification is required");
  else {
    if (typeof v.licenseVerified !== "boolean") p.push("verification.licenseVerified must be true or false");
    if (typeof v.verifiedOn !== "string" || !DATE_RE.test(v.verifiedOn)) p.push("verification.verifiedOn must be YYYY-MM-DD");
    if (!str(v.verifiedBy)) p.push("verification.verifiedBy is required");
    if (!httpsUrl(v.termsUrl)) p.push("verification.termsUrl must be an https URL");
    if (raw.enabled === true && v.licenseVerified !== true) p.push("an enabled reciter needs verification.licenseVerified = true");
  }
  if (raw.timings !== undefined) {
    const t = raw.timings;
    if (!isRecord(t) || !httpsUrl(t.url) || !str(t.attribution)) p.push("timings needs an https url and an attribution");
  }
  return p;
}

export interface CatalogParse {
  reciters: Reciter[];
  /** One message per problem, prefixed with the entry's id or position. */
  errors: string[];
}

/**
 * Reads a catalog (an array of entries). Malformed entries are dropped and reported, never half-used,
 * so one bad line cannot take the whole feature down or smuggle an unverified source in.
 */
export function parseCatalog(input: unknown): CatalogParse {
  if (!Array.isArray(input)) return { reciters: [], errors: ["catalog must be an array"] };
  const reciters: Reciter[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  input.forEach((raw, i) => {
    const label = isRecord(raw) && typeof raw.id === "string" ? raw.id : `#${i}`;
    const problems = reciterProblems(raw);
    if (problems.length === 0) {
      const r = raw as unknown as Reciter;
      if (seen.has(r.id)) problems.push("duplicate id");
      else seen.add(r.id);
    }
    if (problems.length) for (const m of problems) errors.push(`${label}: ${m}`);
    else reciters.push(raw as Reciter);
  });
  return { reciters, errors };
}

/** What users are offered: enabled AND verified. A disabled entry is a record, not an option. */
export function offeredReciters(catalog: readonly Reciter[]): Reciter[] {
  return catalog.filter((r) => r.enabled && r.verification.licenseVerified);
}

export function findReciter(catalog: readonly Reciter[], id: string | null | undefined): Reciter | null {
  if (!id) return null;
  return catalog.find((r) => r.id === id) ?? null;
}

/**
 * A name folded for searching: lower case, accents and Arabic vowel marks removed, punctuation gone, and a leading
 * "al"/"el" article dropped, so "Al-Ajmi", "alajmi" and "ajmi" are one string. Used on reciters' NAMES only.
 */
export function foldForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .replace(/^(al|el)/, "");
}

export function sortedReciters(list: readonly Reciter[]): Reciter[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export function searchReciters(query: string, list: readonly Reciter[]): Reciter[] {
  const q = foldForSearch(query);
  const sorted = sortedReciters(list);
  if (!q) return sorted;
  return sorted.filter((r) => [r.name, r.arabicName, r.id, ...(r.aliases ?? [])].some((f) => foldForSearch(f).includes(q)));
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** The remote URL of one ayah's MP3. */
export function ayahUrl(reciter: Reciter, ref: AyahRef): string {
  const fill = (tpl: string, key: string, value: string) => tpl.split(key).join(value);
  let url = fill(reciter.urlTemplate, "{surah3}", pad3(ref.surahId));
  url = fill(url, "{ayah3}", pad3(ref.ayahNumber));
  return fill(url, "{ayah}", String(globalAyahNumber(ref) ?? ""));
}

/** Local file name of one ayah's MP3, e.g. `002255.mp3`. */
export function ayahFileName(ref: AyahRef): string {
  return `${pad3(ref.surahId)}${pad3(ref.ayahNumber)}.mp3`;
}

/** `002255.mp3` back into an ayah; null for anything else (`.part` files, a timings file, a stray file). */
export function parseAyahFileName(name: string): AyahRef | null {
  const m = /^(\d{3})(\d{3})\.mp3$/.exec(name);
  if (!m) return null;
  const ref = { surahId: Number(m[1]), ayahNumber: Number(m[2]) };
  return ref.surahId >= 1 && ref.surahId <= 114 && ref.ayahNumber >= 1 ? ref : null;
}

/**
 * Roughly how many hours the whole recitation runs. Murattal recitations of the whole book are about 20-30 hours,
 * so every number derived from this is shown as "about".
 */
export const APPROX_RECITATION_HOURS = 24;

/** About how many bytes a reciter's whole Quran takes. An estimate for a storage warning, not a promise. */
export function estimateReciterBytes(reciter: Reciter): number {
  return Math.round((APPROX_RECITATION_HOURS * 3600 * reciter.bitrateKbps * 1000) / 8);
}
