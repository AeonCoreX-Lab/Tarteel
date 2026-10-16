import type { AyahMetaRecord, AyahRecord, SajdahType, SurahRecord } from "@tarteel/types";

// Pure parsing helpers for the Tanzil downloads (https://tanzil.net). No I/O here, so they can be unit-tested with
// synthetic text. The Quran text itself is never normalised: the only transformation is the documented Bismillah strip.

const VERSE_LINE = /^(\d+)\|(\d+)\|(.*)$/;

/** Parses Tanzil's "surah|ayah|text" files. Comment (#) and blank lines are skipped; any other line is an error. */
export function parseVerseLines(source: string): AyahRecord[] {
  const out: AyahRecord[] = [];
  source.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "" || line.startsWith("#")) return;
    const m = VERSE_LINE.exec(line);
    if (!m) throw new Error(`line ${i + 1}: expected "surah|ayah|text"`);
    out.push({ surah: Number(m[1]), ayah: Number(m[2]), text: m[3] as string });
  });
  return out;
}

/** The "# ..." block Tanzil asks to keep with every copy / derived file, byte for byte (without line endings). */
export function commentBlock(source: string): string {
  return source.split(/\r?\n/).filter((l) => l.startsWith("#")).join("\n") + "\n";
}

/** Reads a "#  Field: value" line from a translation header. */
export function headerField(source: string, field: string): string | undefined {
  return new RegExp(`^#\\s+${field}:\\s*(.+?)\\s*$`, "m").exec(source)?.[1];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "April 30, 2011" -> "2011-04-30" */
export function isoFromTanzilDate(text: string): string {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  const month = m ? MONTHS.indexOf((m[1] as string).toLowerCase()) + 1 : 0;
  if (!m || month === 0) throw new Error(`unrecognised date "${text}"`);
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

export interface BismillahStrip {
  ayahs: AyahRecord[];
  /** surahs whose first ayah had the Bismillah removed */
  stripped: number[];
  /** subset of `stripped` whose prefix carried the known extra-shadda variant */
  variants: number[];
}

/**
 * Tanzil prepends the Bismillah to the first ayah of every surah except Al-Fatihah (where it IS ayah 1) and At-Tawbah
 * (which has none). Under the hafs-6236 convention it is not part of those verses, so it is removed from them, and only
 * from them. The prefix must match exactly; the one tolerated variant is the copy in surahs 95 and 97, which carries an
 * extra shadda (U+0651) after the first letter. Anything else throws instead of being guessed at.
 */
export function stripPrefixedBismillah(input: readonly AyahRecord[]): BismillahStrip {
  const fatiha = input.find((a) => a.surah === 1 && a.ayah === 1);
  if (!fatiha) throw new Error("1:1 (the Bismillah) is missing");
  const bism = fatiha.text;
  const variant = bism.slice(0, 1) + "\u0651" + bism.slice(1);
  const stripped: number[] = [];
  const variants: number[] = [];
  const ayahs = input.map((a) => {
    if (a.ayah !== 1 || a.surah === 1) return a;
    if (a.surah === 9) {
      if (a.text.startsWith(bism) || a.text.startsWith(variant)) throw new Error("9:1 unexpectedly starts with the Bismillah");
      return a;
    }
    for (const [prefix, isVariant] of [[bism, false], [variant, true]] as const) {
      if (!a.text.startsWith(prefix + " ")) continue;
      const rest = a.text.slice(prefix.length + 1);
      if (rest.trim() === "") throw new Error(`${a.surah}:1 is empty once the Bismillah is removed`);
      stripped.push(a.surah);
      if (isVariant) variants.push(a.surah);
      return { ...a, text: rest };
    }
    throw new Error(`${a.surah}:1 does not start with the Bismillah prefix; refusing to guess`);
  });
  return { ayahs, stripped, variants };
}

// ------------------------------------------------------------------ quran-data.xml

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    return String.fromCodePoint(e.startsWith("#x") ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) out[m[1] as string] = decodeEntities(m[2] as string);
  return out;
}

function tags(xml: string, name: string): Record<string, string>[] {
  return [...xml.matchAll(new RegExp(`<${name}\\s+([^>]*?)\\s*/?>`, "g"))].map((m) => attrsOf(m[1] as string));
}

function int(a: Record<string, string>, key: string, ctx: string): number {
  const v = Number(a[key]);
  if (a[key] === undefined || a[key] === "" || !Number.isInteger(v)) throw new Error(`${ctx}: "${key}" is not an integer`);
  return v;
}

export interface SurahMeta {
  record: SurahRecord;
  /** ayah count declared by the metadata file, cross-checked against the numbering convention by the caller */
  ayas: number;
}

export function parseSurahs(xml: string): SurahMeta[] {
  const rows = tags(xml, "sura");
  if (rows.length !== 114) throw new Error(`expected 114 <sura> entries, found ${rows.length}`);
  return rows.map((a, i) => {
    const ctx = `<sura #${i + 1}>`;
    if (int(a, "index", ctx) !== i + 1) throw new Error(`${ctx}: index is not sequential`);
    const type = a["type"];
    if (type !== "Meccan" && type !== "Medinan") throw new Error(`${ctx}: unknown revelation type "${type}"`);
    const [nameAr, translit, nameEn] = [a["name"], a["tname"], a["ename"]];
    if (!nameAr || !translit || !nameEn) throw new Error(`${ctx}: name, tname and ename are required`);
    return {
      ayas: int(a, "ayas", ctx),
      record: { id: i + 1, name_ar: nameAr, name_translit: translit, name_en: nameEn, revelation: type === "Meccan" ? "makkah" : "madinah" },
    };
  });
}

/**
 * The revelation order Tanzil's metadata file gives each surah (`order`, 1..114). It is Tanzil's order, stored with that
 * source: it is not presented as the only scholarly view. Throws unless the 114 values are exactly 1..114.
 */
export function parseRevelationOrder(xml: string): { surah: number; order: number }[] {
  const rows = tags(xml, "sura");
  if (rows.length !== 114) throw new Error(`expected 114 <sura> entries, found ${rows.length}`);
  const out = rows.map((a, i) => {
    const ctx = `<sura #${i + 1}>`;
    if (int(a, "index", ctx) !== i + 1) throw new Error(`${ctx}: index is not sequential`);
    return { surah: i + 1, order: int(a, "order", ctx) };
  });
  const sorted = out.map((r) => r.order).sort((x, y) => x - y);
  if (sorted.some((v, i) => v !== i + 1)) throw new Error("revelation orders are not exactly 1..114 without repeats");
  return out;
}

export interface Marker { index: number; surah: number; ayah: number; type?: string }
export interface Markers { juz: Marker[]; quarter: Marker[]; page: Marker[]; sajda: Marker[] }

const pos = (m: { surah: number; ayah: number }): number => m.surah * 1000 + m.ayah;

function markers(xml: string, tag: string, expected: number | null, mustStartAtOne: boolean): Marker[] {
  const out = tags(xml, tag).map((a, i): Marker => {
    const ctx = `<${tag} #${i + 1}>`;
    const m: Marker = { index: int(a, "index", ctx), surah: int(a, "sura", ctx), ayah: int(a, "aya", ctx) };
    if (a["type"] !== undefined) m.type = a["type"];
    return m;
  });
  if (expected !== null && out.length !== expected) throw new Error(`expected ${expected} <${tag}> entries, found ${out.length}`);
  out.forEach((m, i) => {
    if (m.index !== i + 1) throw new Error(`<${tag}> index ${m.index} is not sequential at position ${i + 1}`);
    const prev = out[i - 1];
    if (prev && pos(m) <= pos(prev)) throw new Error(`<${tag}> ${m.index} is not after the previous marker`);
  });
  const first = out[0];
  if (mustStartAtOne && (!first || first.surah !== 1 || first.ayah !== 1)) throw new Error(`<${tag}> must start at 1:1`);
  return out;
}

export function parseMarkers(xml: string): Markers {
  return {
    juz: markers(xml, "juz", 30, true),
    quarter: markers(xml, "quarter", 240, true),
    page: markers(xml, "page", 604, true),
    sajda: markers(xml, "sajda", null, false),
  };
}

const SAJDAH_TYPES: readonly string[] = ["recommended", "obligatory"];

/** One row per ayah: juz, hizb quarter and mushaf page from the start markers; sajdah only where one is declared. */
export function buildAyahMeta(ayahs: readonly AyahRecord[], m: Markers): AyahMetaRecord[] {
  const sajdah = new Map<string, SajdahType>();
  for (const s of m.sajda) {
    if (!s.type || !SAJDAH_TYPES.includes(s.type)) throw new Error(`<sajda ${s.index}>: unknown type "${s.type}"`);
    sajdah.set(`${s.surah}:${s.ayah}`, s.type as SajdahType);
  }
  const cursor = { juz: 0, quarter: 0, page: 0 };
  const advance = (list: Marker[], key: keyof typeof cursor, a: AyahRecord): number => {
    while (cursor[key] + 1 < list.length && pos(list[cursor[key] + 1] as Marker) <= pos(a)) cursor[key]++;
    return (list[cursor[key]] as Marker).index;
  };
  const out = ayahs.map((a): AyahMetaRecord => {
    const rec: AyahMetaRecord = {
      surah: a.surah,
      ayah: a.ayah,
      juz: advance(m.juz, "juz", a),
      hizb_quarter: advance(m.quarter, "quarter", a),
      page: advance(m.page, "page", a),
    };
    const sj = sajdah.get(`${a.surah}:${a.ayah}`);
    if (sj) rec.sajdah = sj;
    return rec;
  });
  const have = new Set(ayahs.map((a) => `${a.surah}:${a.ayah}`));
  for (const key of sajdah.keys()) if (!have.has(key)) throw new Error(`sajdah at ${key} does not match any ayah`);
  return out;
}
