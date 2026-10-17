import { HAFS_6236_AYAH_COUNTS } from "@tarteel/quran-data";

// Turns one Quranpedia asbab-book dump (book 2919, al-Wahidi) into the files of a knowledge pack directory.
//
// Rule of this module: it CONVERTS what the dump holds and writes nothing of its own. No claim is created (claims are written
// and reviewed by people), no text is shortened or rephrased, and anything it does not understand stops the import with a
// message instead of being guessed. The only judgement calls are the constants below, and each says where it comes from.

export const PACK_ID = "asbab-wahidi";
export const BOOK_ID = 2919;
export const LICENSE_ID = "quranpedia-dump";
export const WORK_ID = "work-wahidi-asbab";
export const EDITION_ID = "ed-quranpedia-2919";
const CREATED_BY = "import-quranpedia";

export interface QuranpediaManifest {
  version: string;
  generated_at: string;
  files: { name: string; dataset: string; sha256: string; built_at: string }[];
}
export interface BookContent { text: string; part: string; page: number; ayahs: string }
export interface BookDump {
  book: { id: number; name: string; language?: { code?: string } };
  ayahs: { surah: number; ayah: number; content: BookContent[] }[];
}

export interface Warning { code: string; message: string }
export interface ConvertReport {
  dumpVersion: string;
  sourceFile: { name: string; sha256: string; builtAt: string };
  rows: number;
  passages: number;
  edges: number;
  surahs: number;
  /** Passages whose own `ayahs` list (which Quranpedia gives as global ayah numbers) differs from the per-ayah rows. */
  disagreements: Warning[];
}
export interface Converted { files: Map<string, string>; report: ConvertReport }

const OFFSETS = ((): number[] => {
  const o = [0];
  for (const c of HAFS_6236_AYAH_COUNTS) o.push((o[o.length - 1] ?? 0) + c);
  return o;
})();

/** Global ayah number (1..6236) of surah:ayah in the Hafs numbering. */
export function globalAyah(surah: number, ayah: number): number {
  return (OFFSETS[surah - 1] ?? 0) + ayah;
}

/**
 * Turns the dump's HTML into plain text without touching a word. `<br />` (with the newline that follows it in the dump) becomes one line break, the `<span class="book-ayah">`
 * that wraps a quoted ayah and `<strong>` are dropped (their text stays). Any other tag or any HTML entity throws: it would mean
 * the format changed, and a silent guess could corrupt a source text.
 */
export function htmlToText(html: string): string {
  let out = html.replace(/<br\s*\/?>(\r?\n)?/gi, "\n");
  out = out.replace(/<span class="book-ayah text-primary">|<\/span>|<strong>|<\/strong>/g, "");
  const left = out.match(/<[^>]*>|&[#a-zA-Z0-9]+;/);
  if (left) throw new Error(`unhandled markup ${JSON.stringify(left[0])}; the dump format has changed, extend htmlToText on purpose`);
  return out.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const fail = (msg: string): never => {
  throw new Error(msg);
};

/** True when two conversions carry the same passages and ayah links. The dump version and other metadata may differ. */
export function sameContent(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  const passages = (m: ReadonlyMap<string, string>): string => JSON.stringify((JSON.parse(m.get("sources.json") ?? "{}") as { passages?: unknown }).passages ?? null);
  return passages(a) === passages(b) && a.get("edges.json") === b.get("edges.json");
}

export function convertBook(args: { manifest: QuranpediaManifest; sourceName: string; sourceSha256: string; dump: BookDump; packVersion?: number }): Converted {
  const { manifest, dump } = args;
  const packVersion = args.packVersion ?? 1;
  if (!Number.isInteger(packVersion) || packVersion < 1) fail("packVersion must be a whole number >= 1");
  const entry = manifest.files.find((f) => f.name === args.sourceName);
  if (!entry) fail(`manifest.json does not list ${args.sourceName}`);
  if (entry!.sha256 !== args.sourceSha256) fail(`${args.sourceName}: sha256 ${args.sourceSha256} is not the one in manifest.json (${entry!.sha256}); the file is damaged or not from this dump`);
  if (dump.book?.id !== BOOK_ID) fail(`expected book ${BOOK_ID}, the file holds book ${String(dump.book?.id)}`);
  if (!Array.isArray(dump.ayahs) || dump.ayahs.length === 0) fail("the file has no ayahs");

  // One passage per distinct (volume, page, text). Quranpedia repeats the same passage under every ayah it concerns.
  interface Group { part: string; page: number; text: string; rows: [number, number][]; listed: Set<string> }
  const groups = new Map<string, Group>();
  let rows = 0;
  for (const row of dump.ayahs) {
    const count = HAFS_6236_AYAH_COUNTS[row.surah - 1];
    if (!Number.isInteger(row.surah) || !Number.isInteger(row.ayah) || count === undefined || row.ayah < 1 || row.ayah > count)
      fail(`row ${String(row.surah)}:${String(row.ayah)} is not an ayah of the Hafs numbering`);
    if (!Array.isArray(row.content) || row.content.length === 0) fail(`row ${row.surah}:${row.ayah} has no content`);
    for (const c of row.content) {
      if (typeof c.text !== "string" || !Number.isInteger(c.page) || typeof c.part !== "string" || c.part === "") fail(`row ${row.surah}:${row.ayah}: content needs text, part and page`);
      const text = htmlToText(c.text);
      if (text === "") fail(`row ${row.surah}:${row.ayah}: content is empty`);
      const key = `${c.part}\u0000${c.page}\u0000${text}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { part: c.part, page: c.page, text, rows: [], listed: new Set() }));
      if (g.rows.some(([s, a]) => s === row.surah && a === row.ayah)) fail(`row ${row.surah}:${row.ayah} lists the same passage twice`);
      g.rows.push([row.surah, row.ayah]);
      g.listed.add(c.ayahs);
      rows += 1;
    }
  }

  // Stable ids: page, then the order in which the dump first shows the passages of that page.
  const ordered = [...groups.values()];
  const perPage = new Map<string, number>();
  const passages = ordered.map((g) => {
    const pk = `${g.part}/${g.page}`;
    const n = (perPage.get(pk) ?? 0) + 1;
    perPage.set(pk, n);
    return { g, id: `qp${BOOK_ID}-v${g.part}-p${g.page}-${n}` };
  });
  passages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const disagreements: Warning[] = [];
  const edges: object[] = [];
  const surahs = new Set<number>();
  for (const { g, id } of passages) {
    g.rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [s, a] of g.rows) {
      surahs.add(s);
      edges.push({
        id: `e-${id}-${s}-${a}`,
        type: "REPORT_REFERENCES_AYAH",
        fromKind: "source_passage", fromId: id,
        toKind: "ayah", toId: `${s}:${a}`,
        editorialStatus: "published",
        createdBy: CREATED_BY,
        passages: [id],
      });
    }
    // Cross-check with the passage's own list. It is global ayah numbers in all but one passage of this book (local numbers
    // there); a different set is reported, never merged in: the per-ayah rows are what the dump says is linked.
    const mine = g.rows.map(([s, a]) => globalAyah(s, a)).join(",");
    const local = g.rows.map(([, a]) => a).join(",");
    for (const listed of g.listed)
      if (listed !== mine && listed !== local)
        disagreements.push({ code: "ayah-list-differs", message: `${id} (page ${g.page}): its own list is [${listed}], the per-ayah rows give [${mine}]; the rows were used` });
  }

  const sourceFile = { name: args.sourceName, sha256: args.sourceSha256, builtAt: entry!.built_at };
  const version = manifest.version;
  const files = new Map<string, string>();
  files.set("pack.json", json({
    packId: PACK_ID,
    packVersion,
    languages: ["ar"],
    title: { en: "Occasions of revelation: al-Wahidi (source passages)", ar: "أسباب نزول القرآن - الواحدي" },
    description: {
      en: `The reports of al-Wahidi's Asbab al-Nuzul, each linked to the ayahs Quranpedia.net lists it under. Source passages only: no explanation is added. Text from Quranpedia.net (dump ${version}), links imported as listed there and not yet reviewed by Tarteel editors.`,
    },
    requires: [],
    publishedAt: manifest.generated_at,
    changelog: packVersion === 1
      ? `First version: ${passages.length} passages of book ${BOOK_ID} linked to ${edges.length} ayah references, imported unchanged from the Quranpedia.net dump ${version}. No claims.`
      : `Version ${packVersion}: re-imported from the Quranpedia.net dump ${version} (${passages.length} passages, ${edges.length} ayah references). Quranpedia corrects its text continuously; passages and links are exactly as that dump lists them. No claims.`,
  }));
  files.set("licenses.json", json([{
    id: LICENSE_ID,
    name: `Quranpedia.net data licence (dump ${version})`,
    url: "https://quranpedia.net/dumps/LICENSE.md",
    redistribution: "yes",
    nonCommercialOnly: false,
    shareAlike: false,
    attribution: `الموسوعة القرآنية quranpedia.net, https://quranpedia.net, dump version ${version}`,
    termsNote: `Republishing the data as a downloadable dataset needs credit to Quranpedia.net with a link and the dump version (stated here and in PROVENANCE.md). The classical text is heritage nobody claims; the digitisation is Quranpedia's. Covers this book only: other books in the dump carry their authors' and publishers' rights, and the dump's word-morphology (GPL) and i'rab (MIT) fields have their own licences and are not used. Commercial use is not addressed by the terms; Tarteel is non-commercial. Source file ${sourceFile.name} built ${sourceFile.builtAt}. Not confirmed with Quranpedia in writing.`,
    inventoryRef: "docs/licensing/INVENTORY.md: Quranpedia dumps (book 2919)",
  }]));
  files.set("sources.json", json({
    works: [{
      id: WORK_ID,
      title: "Asbab al-Nuzul (al-Wahidi)",
      titleArabic: dump.book.name,
      author: "al-Wahidi (d. 468 AH)",
      originalLanguage: "ar",
      workType: "asbab",
    }],
    editions: [{
      id: EDITION_ID,
      workId: WORK_ID,
      editionLabel: `Quranpedia.net digital text, book ${BOOK_ID}, dump ${version}`,
      publisher: "Quranpedia.net",
      identifier: `quranpedia:book:${BOOK_ID}`,
      url: "https://quranpedia.net",
      licenseId: LICENSE_ID,
      transcriptionStatus: "unverified",
    }],
    passages: passages.map(({ g, id }) => ({ id, editionId: EDITION_ID, volume: g.part, page: String(g.page), quote: g.text, quoteLanguage: "ar" })),
  }));
  files.set("claims.json", "[]\n");
  files.set("edges.json", json(edges));
  files.set("PROVENANCE.md", [
    "# Provenance",
    "",
    `Generated by \`npm run import:quranpedia\` from \`data/knowledge/_incoming/quranpedia/${sourceFile.name}\`. Do not edit by hand: change the importer and run it again.`,
    "",
    `- Source: الموسوعة القرآنية (Quranpedia.net), https://quranpedia.net, book ${BOOK_ID} (${dump.book.name})`,
    `- Dump version: ${version} (generated ${manifest.generated_at}); this file built ${sourceFile.builtAt}`,
    `- File sha256 (equals the one in the dump's manifest.json): \`${sourceFile.sha256}\``,
    `- Licence: https://quranpedia.net/dumps/LICENSE.md, summarised in \`docs/licensing/INVENTORY.md\`. Credit and the dump version are required when this data is republished, and are stored in the pack's licence row.`,
    "- Content is corrected by Quranpedia continuously (https://quranpedia.net/api/v1/changes). Re-import from a newer dump and raise `packVersion` to follow it.",
    "",
    "## What was converted",
    `- ${rows} per-ayah rows → ${passages.length} distinct passages (same page and text) → ${edges.length} \`REPORT_REFERENCES_AYAH\` edges across ${surahs.size} surahs.`,
    "- Passage text: the dump's text with `<br />` turned into line breaks and the `<span>`/`<strong>` wrappers removed. No word changed.",
    "- Volume and page are Quranpedia's. The transcription is marked `unverified` here: Tarteel has not proofread it.",
    "- Links are exactly the (surah, ayah) rows of the dump. Nothing was added, merged or inferred, and no claim was written.",
    "- The dump's per-passage `ayahs` field was NOT used (it is global ayah numbers, local ones in one passage). It was only compared with the rows.",
    "",
  ].join("\n"));

  return { files, report: { dumpVersion: version, sourceFile, rows, passages: passages.length, edges: edges.length, surahs: surahs.size, disagreements } };
}
