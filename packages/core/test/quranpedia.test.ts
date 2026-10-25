import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, QURANPEDIA_BOOKS, cleanQuranpediaText, createQuranpediaClient, findQuranpediaBook, parseBookAnswer, parseSurahInfo } from "../src/index.ts";
import type { HadithHttp, HadithHttpResponse } from "../src/index.ts";

// Every text below is invented for the tests. No Quranpedia text is stored in this repository.

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
const clientFor = (http: HadithHttp, extra: Record<string, unknown> = {}) => createQuranpediaClient({ http, minIntervalMs: 0, sleep: async () => {}, ...extra });
const bookJson = (over: Record<string, unknown> = {}) => ({
  book: { id: 2919, name: "كتاب تجريبي", short_name: "ت", language: { id: 1, name: "Arabic", code: "ar", direction: "rtl" }, author: { id: 5, ar_name: "مؤلف", full_name: "مؤلف تجريبي" } },
  content: [{ text: "نص<br />تجريبي <span>واحد</span>", part: 1, page: "12", ayahs: "2:255-2:256" }],
  ...over,
});

test("cleanQuranpediaText: line breaks kept, markup removed, common references decoded, nothing else changed", () => {
  assert.equal(cleanQuranpediaText("a<br />b<BR>c"), "a\nb\nc");
  assert.equal(cleanQuranpediaText("<span class=\"x\">one</span> <strong>two</strong>"), "one two");
  assert.equal(cleanQuranpediaText("A &amp; B &lt;i&gt; &quot;q&quot; &#39;s&#39;"), "A & B <i> \"q\" 's'");
  assert.equal(cleanQuranpediaText("<p>x</p><p>y</p>"), "x\ny");
  assert.equal(cleanQuranpediaText("  بسم  "), "  بسم  ", "spacing is the server's; only empty lines at either end go");
  assert.equal(cleanQuranpediaText("\n\nx\n\n"), "x");
  assert.equal(cleanQuranpediaText("<br />"), null);
  assert.equal(cleanQuranpediaText(5), null);
  assert.equal(cleanQuranpediaText(null), null);
});

test("surah information: the server's headings and texts, in a fixed order, empty ones left out", () => {
  const info = parseSurahInfo({
    ayahs_count: { title: "عدد الآيات", value: 7 },
    surah_number: { title: "رقم", value: 1 },
    purposes: { title: "مقاصد", value: "<br />مقصد" },
    introduction: { title: "مقدمة", value: "نص" },
    grace: { title: "فضل", value: "" },
    topics: { title: "موضوعات", value: ["أ", "ب"] },
    "Bad Key": { title: "x", value: "y" },
  });
  assert.deepEqual(info.sections.map((s) => s.key), ["introduction", "topics", "purposes", "ayahs_count"]);
  assert.equal(info.sections[0]?.title, "مقدمة");
  assert.equal(info.sections[1]?.text, "أ\nب");
  assert.equal(info.sections[3]?.text, "7");
  assert.throws(() => parseSurahInfo([]), HadithError);
  assert.throws(() => parseSurahInfo({ introduction: { title: "t", value: "" } }), HadithError);
});

test("book answer: passages with page and part, the author and language from the server; nothing in the book is not-found", () => {
  const a = parseBookAnswer(bookJson());
  assert.equal(a.bookName, "كتاب تجريبي");
  assert.equal(a.author, "مؤلف تجريبي");
  assert.equal(a.language, "ar");
  assert.deepEqual(a.passages, [{ text: "نص\nتجريبي واحد", part: "1", page: "12", ayahs: "2:255-2:256" }]);
  assert.throws(() => parseBookAnswer(bookJson({ content: [] })), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  assert.throws(() => parseBookAnswer(bookJson({ content: [{ text: "<br />" }] })), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  assert.throws(() => parseBookAnswer({ book: {} }), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  assert.throws(() => parseBookAnswer("x"), HadithError);
  assert.equal(parseBookAnswer(bookJson({ book: {} })).author, null);
});

test("the client asks the documented addresses, with or without a `result` wrapper", async () => {
  const http = fakeHttp((url) => (url.includes("/surah/information/") ? ok({ result: { introduction: { title: "t", value: "x" } } }) : ok(bookJson())));
  const c = clientFor(http);
  assert.equal((await c.surahInfo(2)).sections[0]?.text, "x");
  assert.equal((await c.ayahBook(2919, 2, 255)).passages.length, 1);
  assert.deepEqual(http.urls, ["https://api.quranpedia.net/v1/surah/information/2", "https://api.quranpedia.net/v1/ayah/2/255/book/2919"]);
  const wrapped = await clientFor(fakeHttp(() => ok({ result: bookJson() }))).ayahBook(4, 1, 1);
  assert.equal(wrapped.author, "مؤلف تجريبي");
});

test("only the named books are asked for, and numbers are checked before any request", async () => {
  const http = fakeHttp(() => ok(bookJson()));
  const c = clientFor(http);
  const rejects = (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  await rejects(c.ayahBook(999999, 1, 1));
  await rejects(c.ayahBook(2919, 0, 1));
  await rejects(c.ayahBook(2919, 115, 1));
  await rejects(c.ayahBook(2919, 1, 0));
  await rejects(c.ayahBook(2919, 1, 287));
  await rejects(c.ayahBook(2919, 1.5, 1));
  await rejects(c.surahInfo(0));
  assert.equal(http.urls.length, 0);
});

test("errors: 404, 429 with Retry-After, 5xx, other statuses, bad JSON, oversize, network, timeout", async () => {
  const code = async (res: HadithHttpResponse | Error) => {
    try {
      await clientFor(fakeHttp(() => res)).ayahBook(2919, 1, 1);
    } catch (e) {
      assert.ok(e instanceof HadithError);
      return e;
    }
    throw new Error("did not throw");
  };
  assert.equal((await code({ status: 404, body: "", retryAfterSeconds: null })).code, "not-found");
  const rate = await code({ status: 429, body: "", retryAfterSeconds: 30 });
  assert.equal(rate.code, "rate-limited");
  assert.equal(rate.retryAfterSeconds, 30);
  assert.equal((await code({ status: 503, body: "", retryAfterSeconds: null })).code, "server");
  assert.equal((await code({ status: 301, body: "", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "<html>", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "x".repeat(3_000_001), retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code(new Error("offline"))).code, "network");
  assert.equal((await code(new HadithError("timeout", "slow"))).code, "timeout");
});

test("answers are remembered briefly, requests are spaced, and a request cancelled before it starts never goes out", async () => {
  let t = 0;
  const http = fakeHttp(() => ok(bookJson()));
  const c = clientFor(http, { now: () => t, cacheTtlMs: 1000 });
  await c.ayahBook(2919, 2, 255);
  await c.ayahBook(2919, 2, 255);
  assert.equal(http.urls.length, 1);
  t = 1500;
  await c.ayahBook(2919, 2, 255);
  assert.equal(http.urls.length, 2, "expired");

  let now = 1000;
  const sleeps: number[] = [];
  const spaced = createQuranpediaClient({ http, now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; }, cacheTtlMs: 0 });
  await Promise.all([spaced.ayahBook(2919, 1, 1), spaced.ayahBook(2919, 1, 2), spaced.ayahBook(2919, 1, 3)]);
  assert.deepEqual(sleeps, [700, 700], "well under the 120 requests a minute the publisher allows");
  const ctl = new AbortController();
  ctl.abort();
  const before = http.urls.length;
  await assert.rejects(spaced.ayahBook(2919, 1, 4, ctl.signal), (e: unknown) => e instanceof HadithError && e.code === "cancelled");
  assert.equal(http.urls.length, before);
});

test("the book list: unique ids, both titles, exactly one asbab book, all named by their own Arabic title", () => {
  const ids = QURANPEDIA_BOOKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of QURANPEDIA_BOOKS) assert.ok(b.arabic && b.title.en && b.title.bn, String(b.id));
  assert.equal(QURANPEDIA_BOOKS.filter((b) => b.kind === "asbab").length, 1);
  assert.equal(findQuranpediaBook(2919)?.kind, "asbab");
  assert.equal(findQuranpediaBook(460), undefined, "al-Muharrar is a modern compilation: not cleared");
});
