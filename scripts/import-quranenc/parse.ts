// Pure parsing helpers for a QuranEnc.com CSV download (https://quranenc.com). No I/O here, so they can be unit-tested
// with synthetic text. The translation text and footnotes are never normalised: they are carried over exactly as published.

export interface QuranEncInfo {
  /** The "Translation Info" block, one entry per line, without line endings. QuranEnc's terms require keeping it. */
  lines: string[];
  /** QuranEnc's translation key, e.g. "tagalog_rwwad". */
  id: string;
  language: string;
  url: string;
  /** e.g. "1.1.4" (from "v1.1.4-csv.1") */
  version: string;
  /** ISO date of "Last update" */
  updatedAt: string;
  checkUrl: string;
}

export interface QuranEncRow {
  surah: number;
  ayah: number;
  text: string;
  /** Empty string when the ayah has no footnotes. Several footnotes are separated by "\n". */
  footnotes: string;
}

export interface ParsedQuranEnc {
  info: QuranEncInfo;
  rows: QuranEncRow[];
}

/** RFC 4180 reader: quoted fields may hold commas, doubled quotes and line breaks. Malformed quoting is an error. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
        i++;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else {
        inQuotes = false;
        i++;
        const next = text[i];
        if (next !== undefined && next !== "," && next !== "\r" && next !== "\n") throw new Error(`CSV: unexpected "${next}" after a closing quote (offset ${i})`);
      }
    } else if (ch === '"') {
      if (field !== "") throw new Error(`CSV: quote inside an unquoted field (offset ${i})`);
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
      i++;
    }
  }
  if (inQuotes) throw new Error("CSV: a quoted field is never closed");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function infoField(lines: readonly string[], name: string): string {
  const prefix = `# ${name}: `;
  const line = lines.find((l) => l.startsWith(prefix));
  if (line === undefined) throw new Error(`header: no "${name}" line: wrong file?`);
  return line.slice(prefix.length).trim();
}

/** Reads the quoted "Translation Info:" block QuranEnc puts in the first CSV cell. */
export function parseInfo(block: string): QuranEncInfo {
  const lines = block.split(/\r?\n/);
  if (lines[0] !== "Translation Info:") throw new Error('header: the first cell does not start with "Translation Info:": not a QuranEnc CSV?');
  const updated = infoField(lines, "Last update");
  const m = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2} \(v(\d+\.\d+\.\d+)-csv\.\d+\)$/.exec(updated);
  if (!m) throw new Error(`header: unrecognised "Last update" value "${updated}"`);
  return {
    lines,
    id: infoField(lines, "Translation ID"),
    language: infoField(lines, "Language"),
    url: infoField(lines, "URL"),
    version: m[2] as string,
    updatedAt: m[1] as string,
    checkUrl: infoField(lines, "Check for updates"),
  };
}

const COLUMNS = ["id", "sura", "aya", "translation", "footnotes"];
const INT = /^[1-9]\d*$/;

/** Parses a QuranEnc CSV: the info block, the column header, then one row per ayah in order. Refuses to guess. */
export function parseQuranEncCsv(source: string): ParsedQuranEnc {
  const records = parseCsv(source);
  const first = records[0];
  if (!first || first.length !== COLUMNS.length || first.slice(1).some((c) => c !== "")) throw new Error("header: the info block is not a single quoted cell");
  const info = parseInfo(first[0] as string);
  const columns = records[1];
  if (!columns || columns.join(",") !== COLUMNS.join(",")) throw new Error(`header: expected columns ${COLUMNS.join(",")}`);
  const rows: QuranEncRow[] = [];
  records.slice(2).forEach((r, i) => {
    const where = `row ${i + 1}`;
    if (r.length !== COLUMNS.length) throw new Error(`${where}: ${r.length} fields, expected ${COLUMNS.length}`);
    const [id, sura, aya, translation, footnotes] = r as [string, string, string, string, string];
    if (![id, sura, aya].every((v) => INT.test(v))) throw new Error(`${where}: id/sura/aya must be positive integers`);
    if (Number(id) !== i + 1) throw new Error(`${where}: id ${id} is not sequential`);
    rows.push({ surah: Number(sura), ayah: Number(aya), text: translation, footnotes });
  });
  return { info, rows };
}

/** "[1] first\n[2] second" -> ["1", "2"] */
export function footnoteLabels(footnotes: string): string[] {
  return [...footnotes.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1] as string);
}

/** "text[1] more[2]" -> ["1", "2"] */
export function textMarkers(text: string): string[] {
  return [...text.matchAll(/\[(\d+)\]/g)].map((m) => m[1] as string);
}
