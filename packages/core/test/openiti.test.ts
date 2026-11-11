import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HadithError, blocksOf, fetchOpenItiText, foldForSearch, indexCatalogue, looksLikeOpenItiText, openItiRepo, openItiTextUrls, parseCatalogue, parseDelimited,
  parseOpenItiMetadata, parseOpenItiText, parseOpenItiUri, parseSavedIndex, searchCatalogue, serialiseCatalogue,
} from "../src/index.ts";
import type { HadithHttp } from "../src/index.ts";

// Names and texts here are invented. They only have the shape of an OpenITI URI, a metadata list and a mARkdown file.
const URI = "0310Synthetic.SyntheticBook.Shamela0000001-ara1";

test("a URI is split into its parts; anything else is refused", () => {
  const p = parseOpenItiUri(URI);
  assert.equal(p?.date, 310);
  assert.equal(p?.authorUri, "0310Synthetic");
  assert.equal(p?.bookUri, "0310Synthetic.SyntheticBook");
  assert.equal(p?.version, "Shamela0000001");
  assert.equal(p?.lang, "ara1");
  for (const bad of ["", "Synthetic.Book.V-ara1", "0310Synthetic.SyntheticBook", "../0310A.B.C-ara1", "0310A.B.C-ara1/x"]) assert.equal(parseOpenItiUri(bad), null, bad);
});

test("the repository is the 25-year block named by its last year", () => {
  assert.equal(openItiRepo(1), "0025AH");
  assert.equal(openItiRepo(25), "0025AH");
  assert.equal(openItiRepo(26), "0050AH");
  assert.equal(openItiRepo(310), "0325AH");
  assert.equal(openItiRepo(751), "0775AH");
  assert.equal(openItiRepo(1450), "1450AH");
  assert.equal(openItiRepo(1451), null);
  assert.equal(openItiRepo(0), null);
});

test("addresses: the metadata's own address first, then the usual file names", () => {
  const withMeta = openItiTextUrls(URI, `https://github.com/OpenITI/0325AH/blob/master/data/0310Synthetic/0310Synthetic.SyntheticBook/${URI}.completed`);
  assert.equal(withMeta[0], `https://raw.githubusercontent.com/OpenITI/0325AH/master/data/0310Synthetic/0310Synthetic.SyntheticBook/${URI}.completed`);
  const plain = openItiTextUrls(URI, null);
  assert.deepEqual(plain.map((u) => u.slice(u.indexOf(URI) + URI.length)), ["", ".mARkdown", ".completed", ".inProgress"]);
  assert.ok(plain.every((u) => u.startsWith("https://raw.githubusercontent.com/OpenITI/0325AH/master/data/0310Synthetic/0310Synthetic.SyntheticBook/")));
  // an address that is for another book is not trusted
  const other = openItiTextUrls(URI, "https://github.com/OpenITI/0325AH/blob/master/data/0999Other/0999Other.Thing/0999Other.Thing.V1-ara1");
  assert.equal(other.length, 4);
  // an address outside OpenITI is never used
  assert.equal(openItiTextUrls(URI, "https://evil.example/x").length, 4);
  assert.deepEqual(openItiTextUrls("nonsense", null), []);
});

test("delimited text: quotes, doubled quotes, CRLF, blank lines", () => {
  const rows = parseDelimited('a\tb\tc\r\n"x\ty"\t"he said ""hi"""\tz\r\n\r\nlast\t\t\n', "\t");
  assert.deepEqual(rows, [["a", "b", "c"], ["x\ty", 'he said "hi"', "z"], ["last", "", ""]]);
});

const TSV = [
  "version_uri\tdate\tauthor_ar\tauthor_lat\tbook\ttitle_ar\ttitle_lat\tstatus\ttok_length\turl",
  `${URI}\t310\tمؤلف تجريبي\tSynthetic Author\t0310Synthetic.SyntheticBook\tكتاب تجريبي\tSynthetic Book\tpri\t1,234\thttps://github.com/OpenITI/0325AH/blob/master/data/0310Synthetic/0310Synthetic.SyntheticBook/${URI}`,
  `0310Synthetic.SyntheticBook.Other0000002-ara1\t310\t\t\t\t\t\tsec\t10\t`,
  `0400Persian.Thing.Ver1-per1\t400\t\t\t\t\t\tpri\t10\t`,
  `${URI}\t310\t\t\t\t\t\tpri\t5\t`,
  "bad uri\t1\t\t\t\t\t\tpri\t1\t",
].join("\n");

test("the metadata list is read by column name: Arabic, primary, once each", () => {
  const e = parseOpenItiMetadata(TSV);
  assert.equal(e.length, 1);
  assert.equal(e[0]?.uri, URI);
  assert.equal(e[0]?.titleLat, "Synthetic Book");
  assert.equal(e[0]?.authorAr, "مؤلف تجريبي");
  assert.equal(e[0]?.words, 1234);
  assert.equal(e[0]?.date, 310);
  assert.ok(e[0]?.url?.startsWith("https://github.com/OpenITI/0325AH/blob/"));
});

test("a comma list with the columns in another order works; no version column is a clear error", () => {
  const csv = `title_lat,status,id\n"Synthetic, Book",,${URI}\n`;
  const e = parseOpenItiMetadata(csv);
  assert.equal(e.length, 1);
  assert.equal(e[0]?.titleLat, "Synthetic, Book");
  assert.equal(e[0]?.url, null);
  assert.throws(() => parseOpenItiMetadata("a\tb\n1\t2\n"), HadithError);
  assert.throws(() => parseOpenItiMetadata(""), HadithError);
});

test("search folds Arabic and Latin so marks, alef and ya variants do not matter", () => {
  assert.equal(foldForSearch("الطَّبَرِيّ"), foldForSearch("الطبري"));
  assert.equal(foldForSearch("Ṭabarī"), "tabari");
  assert.equal(foldForSearch("إِبراهيم"), foldForSearch("ابراهيم"));
  const entries = parseOpenItiMetadata(
    ["version_uri\ttitle_ar\ttitle_lat\tauthor_ar\tauthor_lat",
      `0310Alpha.Tarikh.V1-ara1\tتاريخ الأمم\tTarikh al-Umam\tألفا\tAlpha`,
      `0400Beta.Fiqh.V1-ara1\tالفقه\tAl-Fiqh\tبيتا\tBeta Tarikh`,
      `0500Gamma.Other.V1-ara1\tآخر\tOther\tجاما\tGamma`].join("\n"),
  );
  const idx = indexCatalogue(entries);
  assert.deepEqual(searchCatalogue(idx, "تاريخ").map((e) => e.date), [310]);
  assert.deepEqual(searchCatalogue(idx, "tarikh").map((e) => e.date), [310, 400]); // the title match ranks above the author match
  assert.deepEqual(searchCatalogue(idx, "tarikh umam").map((e) => e.date), [310]);
  assert.deepEqual(searchCatalogue(idx, "   "), []);
  assert.deepEqual(searchCatalogue(idx, "zzz"), []);
});

test("the catalogue and the list of kept books survive being written and read back", () => {
  const entries = parseOpenItiMetadata(TSV);
  const back = parseCatalogue(serialiseCatalogue(entries, 1700));
  assert.equal(back?.at, 1700);
  assert.deepEqual(back?.entries, entries);
  assert.equal(parseCatalogue("not json"), null);
  assert.equal(parseCatalogue('{"v":2}'), null);
  const saved = parseSavedIndex(JSON.stringify([{ uri: URI, titleAr: "ك", titleLat: "B", authorAr: "", authorLat: "A", date: 310, savedAt: 5, chars: 99, from: "https://x", version: "2025.1.9" }, { uri: "bad" }, 3]));
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.chars, 99);
  assert.deepEqual(parseSavedIndex(null), []);
  assert.deepEqual(parseSavedIndex("{"), []);
});

const MARKDOWN = [
  "######OpenITI#",
  "",
  "#META# 000.SortField    :: Shamela_0000001",
  "#META# 010.BookTITLE    :: كتاب تجريبي",
  "#META#Header#End#",
  "",
  "### | باب الأول",
  "# نص تجريبي أول PageV01P001",
  "~~ويتابع هنا Ms000001",
  "# فقرة ثانية @QUR@ تجريبية",
  "### || فصل فرعي",
  "# نص الفصل الفرعي PageV01P002 %~% بعد الفاصل",
  "### | باب الثاني",
  "# نص الباب الثاني $RWY$ تجريبي",
  "# $ ",
].join("\n");

test("mARkdown becomes chapters: headings by depth, continuation lines joined, markers removed", () => {
  const r = parseOpenItiText(MARKDOWN);
  assert.equal(r.title, "كتاب تجريبي");
  assert.equal(r.chapters.length, 3);
  assert.deepEqual(r.chapters.map((c) => [c.title, c.level]), [["باب الأول", 1], ["فصل فرعي", 2], ["باب الثاني", 1]]);
  assert.equal(r.chapters[0]?.text, "نص تجريبي أول ويتابع هنا\n\nفقرة ثانية تجريبية");
  assert.equal(r.chapters[1]?.text, "نص الفصل الفرعي بعد الفاصل");
  assert.equal(r.chapters[2]?.text, "نص الباب الثاني تجريبي");
  for (const c of r.chapters) {
    assert.ok(!/PageV|Ms0|@QUR|\$RWY|%~%/.test(c.text));
    assert.equal(c.page, null);
  }
});

test("a text with no headings is cut into parts, never one huge chapter", () => {
  const para = "كلمة ".repeat(500).trim();
  const raw = Array.from({ length: 20 }, () => `# ${para}`).join("\n");
  const r = parseOpenItiText(raw);
  assert.ok(r.chapters.length >= 3, String(r.chapters.length));
  assert.ok(r.chapters.every((c) => c.title === "" && c.text.length > 0 && c.text.length < 20000));
  assert.deepEqual(parseOpenItiText("").chapters, []);
});

test("long chapters are cut into blocks at spaces; short paragraphs stay whole", () => {
  const words = Array.from({ length: 1200 }, (_, i) => `كلمة${i}`).join(" ");
  const blocks = blocksOf(`قصير\n\n${words}\n\n\n\nآخر`, 2500);
  assert.equal(blocks[0], "قصير");
  assert.equal(blocks.at(-1), "آخر");
  assert.ok(blocks.length >= 4);
  assert.ok(blocks.every((b) => b.length <= 2500));
  assert.equal(blocks.slice(1, -1).join(" "), words);
});

function fakeHttp(map: Record<string, { status: number; body: string }>, calls: string[]): HadithHttp {
  return { async get(url) { calls.push(url); const a = map[url]; return a ? { status: a.status, body: a.body, retryAfterSeconds: null } : { status: 404, body: "", retryAfterSeconds: null }; } };
}
const BASE = `https://raw.githubusercontent.com/OpenITI/0325AH/master/data/0310Synthetic/0310Synthetic.SyntheticBook/${URI}`;

test("a text is fetched from the first address that has it; only a 404 moves on", async () => {
  const calls: string[] = [];
  const r = await fetchOpenItiText(fakeHttp({ [`${BASE}.mARkdown`]: { status: 200, body: MARKDOWN } }, calls), { uri: URI, url: null });
  assert.equal(r.from, `${BASE}.mARkdown`);
  assert.deepEqual(calls, [BASE, `${BASE}.mARkdown`]);
});

test("not found anywhere, a web page, a rate limit and a server fault are told apart", async () => {
  await assert.rejects(() => fetchOpenItiText(fakeHttp({}, []), { uri: URI, url: null }), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  await assert.rejects(() => fetchOpenItiText(fakeHttp({ [BASE]: { status: 200, body: "<!DOCTYPE html><html>" + "x".repeat(300) } }, []), { uri: URI, url: null }), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  await assert.rejects(() => fetchOpenItiText(fakeHttp({ [BASE]: { status: 429, body: "" } }, []), { uri: URI, url: null }), (e: unknown) => e instanceof HadithError && e.code === "rate-limited");
  await assert.rejects(() => fetchOpenItiText(fakeHttp({ [BASE]: { status: 502, body: "" } }, []), { uri: URI, url: null }), (e: unknown) => e instanceof HadithError && e.code === "server");
  await assert.rejects(() => fetchOpenItiText(fakeHttp({}, []), { uri: "nonsense", url: null }), (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => fetchOpenItiText(fakeHttp({}, []), { uri: URI, url: null }, { signal: ac.signal }), (e: unknown) => e instanceof HadithError && e.code === "cancelled");
});

test("what looks like an OpenITI text and what does not", () => {
  assert.equal(looksLikeOpenItiText(MARKDOWN), true);
  assert.equal(looksLikeOpenItiText("<html><body>Sign in to the network</body></html>"), false);
  assert.equal(looksLikeOpenItiText("short"), false);
  assert.equal(looksLikeOpenItiText("plain prose with no markers ".repeat(20)), false);
});
