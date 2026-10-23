import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, createWikiClient, parseArticle, plainSnippet, splitSections, stripArabicMarks, wikiArticleUrl, wikiHistoryUrl, wikiLanguage, wikiSurahQuery } from "../src/index.ts";
import type { HadithHttp, HadithHttpResponse } from "../src/index.ts";

// Every text below is invented for the tests. No Wikipedia text is stored in this repository.

const ok = (data: unknown): HadithHttpResponse => ({ status: 200, body: JSON.stringify(data), retryAfterSeconds: null });

function fakeHttp(answer: (url: string) => HadithHttpResponse | Error): HadithHttp & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async get(url) {
      urls.push(url);
      const a = answer(url);
      if (a instanceof Error) throw a;
      return a;
    },
  };
}

const clientFor = (http: HadithHttp, extra: Record<string, unknown> = {}) => createWikiClient({ http, minIntervalMs: 0, sleep: async () => {}, ...extra });

const articleJson = (extract: string, over: Record<string, unknown> = {}) => ({ batchcomplete: true, query: { pages: [{ pageid: 9, ns: 0, title: "Invented Title", extract, ...over }] } });

test("search(): asks the right address, reads titles, strips the highlight markup from snippets", async () => {
  const http = fakeHttp(() => ok({ query: { search: [
    { ns: 0, title: "Invented One", pageid: 1, snippet: 'about the <span class="searchmatch">invented</span> &amp; &quot;made-up&quot; thing&#39;s &#x41;' },
    { ns: 0, title: "Invented Two", pageid: 2, snippet: "" },
    { ns: 0, title: "  ", pageid: 3, snippet: "x" },
    { ns: 0, pageid: 4 },
  ] } }));
  const hits = await clientFor(http).search("en", "Surah Invented", 3);
  assert.equal(http.urls[0], "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Surah%20Invented&srnamespace=0&srlimit=3&format=json&formatversion=2");
  assert.deepEqual(hits, [{ title: "Invented One", snippet: `about the invented & "made-up" thing's A` }, { title: "Invented Two", snippet: "" }]);
});

test("search(): no match is an empty list, not an error; other languages use their own host", async () => {
  const http = fakeHttp(() => ok({ batchcomplete: true }));
  assert.deepEqual(await clientFor(http).search("bn", "কিছু"), []);
  assert.ok(http.urls[0]?.startsWith("https://bn.wikipedia.org/w/api.php?"));
  assert.ok(http.urls[0]?.includes(`srsearch=${encodeURIComponent("কিছু")}`));
  assert.deepEqual(await clientFor(fakeHttp(() => ok({ query: { search: [] } }))).search("ar", "x"), []);
});

test("an error object inside a 200 answer is mapped to something a person can be told", async () => {
  const code = async (c: string) => {
    try {
      await clientFor(fakeHttp(() => ok({ error: { code: c, info: "x" } }))).search("en", "x");
    } catch (e) {
      assert.ok(e instanceof HadithError);
      return e.code;
    }
    throw new Error("did not throw");
  };
  assert.equal(await code("ratelimited"), "rate-limited");
  assert.equal(await code("maxlag"), "rate-limited");
  assert.equal(await code("badvalue"), "bad-request");
  assert.equal(await code("internal_api_error_X"), "server");
});

test("article(): sections come out in order, the introduction first, text unchanged", async () => {
  const extract = "Intro line one.\nIntro line two.\n\n\n== First part ==\nBody of the first part.\n\n=== Sub part ===\nSub text.\n\n== Empty part ==\n\n== References ==\n\n== Last ==\nEnd.";
  const http = fakeHttp(() => ok(articleJson(extract)));
  const a = await clientFor(http).article("en", "Invented Title");
  assert.equal(http.urls[0], "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=Invented%20Title&format=json&formatversion=2");
  assert.equal(a.title, "Invented Title");
  assert.equal(a.url, "https://en.wikipedia.org/wiki/Invented_Title");
  assert.deepEqual(a.sections, [
    { heading: null, level: 0, text: "Intro line one.\nIntro line two." },
    { heading: "First part", level: 2, text: "Body of the first part." },
    { heading: "Sub part", level: 3, text: "Sub text." },
    { heading: "Last", level: 2, text: "End." },
  ]);
});

test("article(): a missing page, or one with no text, is 'not found'", async () => {
  const nf = (json: unknown) => assert.rejects(clientFor(fakeHttp(() => ok(json))).article("en", "X"), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  await nf({ query: { pages: [{ title: "X", missing: true }] } });
  await nf({ query: { pages: [{ title: "X", invalid: true }] } });
  await nf({ query: { pages: [] } });
  await nf(articleJson(""));
  await nf(articleJson("   \n\n  "));
  await assert.rejects(clientFor(fakeHttp(() => ok({ not: "it" }))).article("en", "X"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("parseArticle(): the title is the one Wikipedia gives (after a redirect), and the address is built from it", () => {
  const a = parseArticle("bn", articleJson("টেক্সট।", { title: "সূরা আল-ফাতিহা" }));
  assert.equal(a.title, "সূরা আল-ফাতিহা");
  assert.equal(a.url, `https://bn.wikipedia.org/wiki/${encodeURIComponent("সূরা_আল-ফাতিহা")}`);
});

test("splitSections(): CRLF, odd spacing, and a heading mark inside a sentence is not a heading", () => {
  const s = splitSections("Intro.\r\n==  Spaced  ==\r\nText with == inside it.\r\n");
  assert.deepEqual(s, [{ heading: null, level: 0, text: "Intro." }, { heading: "Spaced", level: 2, text: "Text with == inside it." }]);
  assert.deepEqual(splitSections(""), []);
});

test("input is checked before any request is made", async () => {
  const http = fakeHttp(() => ok({}));
  const c = clientFor(http);
  const rejects = (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  await rejects(c.search("en", ""));
  await rejects(c.search("en", "   "));
  await rejects(c.search("en", "x".repeat(201)));
  await rejects(c.search("en", "line\nbreak"));
  await rejects(c.search("en", "x", 0));
  await rejects(c.search("en", "x", 21));
  await rejects(c.search("de" as never, "x"));
  await rejects(c.article("en", ""));
  await rejects(c.article("en", "a\u0000b"));
  await rejects(c.article("en", "x".repeat(256)));
  assert.equal(http.urls.length, 0);
});

test("errors: 404, 429 with Retry-After, 5xx, other statuses, bad JSON, oversize, network, timeout", async () => {
  const code = async (res: HadithHttpResponse | Error) => {
    try {
      await clientFor(fakeHttp(() => res)).search("en", "x");
    } catch (e) {
      assert.ok(e instanceof HadithError);
      return e;
    }
    throw new Error("did not throw");
  };
  assert.equal((await code({ status: 404, body: "", retryAfterSeconds: null })).code, "not-found");
  const rate = await code({ status: 429, body: "", retryAfterSeconds: 7 });
  assert.equal(rate.code, "rate-limited");
  assert.equal(rate.retryAfterSeconds, 7);
  assert.equal((await code({ status: 503, body: "", retryAfterSeconds: null })).code, "server");
  assert.equal((await code({ status: 302, body: "", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "<html>", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "x".repeat(3_000_001), retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code(new Error("offline"))).code, "network");
  assert.equal((await code(new HadithError("timeout", "slow"))).code, "timeout");
});

test("answers are remembered briefly, and clearCache forgets them", async () => {
  let t = 0;
  const http = fakeHttp(() => ok(articleJson("Text.")));
  const c = clientFor(http, { now: () => t, cacheTtlMs: 1000 });
  await c.article("en", "A");
  await c.article("en", "A");
  assert.equal(http.urls.length, 1);
  await c.article("bn", "A");
  assert.equal(http.urls.length, 2, "another language is another answer");
  t = 1500;
  await c.article("en", "A");
  assert.equal(http.urls.length, 3, "expired");
  c.clearCache();
  await c.article("en", "A");
  assert.equal(http.urls.length, 4);
});

test("requests start at least minIntervalMs apart, and a request cancelled before it starts never reaches the network", async () => {
  let t = 1000;
  const sleeps: number[] = [];
  const http = fakeHttp(() => ok({ query: { search: [] } }));
  const c = createWikiClient({ http, minIntervalMs: 250, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, cacheTtlMs: 0 });
  await Promise.all([c.search("en", "a"), c.search("en", "b"), c.search("en", "c")]);
  assert.deepEqual(sleeps, [250, 250]);
  const ctl = new AbortController();
  ctl.abort();
  const before = http.urls.length;
  await assert.rejects(c.search("en", "d", 5, ctl.signal), (e: unknown) => e instanceof HadithError && e.code === "cancelled");
  assert.equal(http.urls.length, before);
});

test("what to search for, and the addresses", () => {
  assert.equal(wikiLanguage("bn"), "bn");
  assert.equal(wikiLanguage("ar"), "ar");
  assert.equal(wikiLanguage("en"), "en");
  assert.equal(wikiLanguage("fr"), "en");
  assert.equal(stripArabicMarks("ٱلْبَقَرَةِ"), "ٱلبقرة");
  const s = { nameArabic: "سُورَةُ ٱلْفَاتِحَةِ", nameTransliteration: "Al-Fatihah" };
  assert.equal(wikiSurahQuery("en", s), "Surah Al-Fatihah");
  assert.equal(wikiSurahQuery("ar", s), "سورة ٱلفاتحة");
  assert.equal(wikiSurahQuery("bn", s), "ٱلفاتحة সূরা");
  assert.equal(wikiSurahQuery("bn", { nameArabic: "", nameTransliteration: "Al-Fatihah" }), "সূরা Al-Fatihah");
  assert.equal(wikiArticleUrl("en", "A b/c"), "https://en.wikipedia.org/wiki/A_b%2Fc");
  assert.equal(wikiHistoryUrl("en", "A b"), "https://en.wikipedia.org/w/index.php?title=A_b&action=history");
  assert.equal(plainSnippet("&#0;&#xD800;&bogus;<b>x</b>"), "&#0;&#xD800;&bogus;x");
});
