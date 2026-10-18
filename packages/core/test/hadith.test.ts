import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, createHadithClient, gradeLabel, parseSnippet, sunnahUrl } from "../src/index.ts";
import type { HadithHttp, HadithHttpResponse } from "../src/index.ts";

// Every text below is invented for the tests. No real hadith is stored in this repository.

const envelope = (data: unknown): string => JSON.stringify({ code: 200, status: "OK", data });
const ok = (data: unknown): HadithHttpResponse => ({ status: 200, body: envelope(data), retryAfterSeconds: null });

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

function clientFor(http: HadithHttp, extra: Record<string, unknown> = {}) {
  return createHadithClient({ http, minIntervalMs: 0, sleep: async () => {}, ...extra });
}

const entry = (over: Record<string, unknown> = {}) => ({
  collection: "bukhari", bookNumber: "3", hadithNumber: 42, chapterId: "7", chapterNumber: "7",
  chapterTitle: { en: "Test chapter", ar: "باب" },
  en: { urn: 1, text: "Invented English text.", body: "<p>must never be used</p>", grades: [{ graded_by: "Tester", grade: "Sahih" }, { graded_by: null, grade: "Hasan" }, { graded_by: "X", grade: "" }] },
  ar: { urn: 2, text: "نص تجريبي", grades: [] },
  ...over,
});

test("hadith(): parses the entry, reads only text fields, accepts a numeric hadith number", async () => {
  const http = fakeHttp(() => ok(entry()));
  const h = await clientFor(http).hadith("bukhari", "3", "42");
  assert.equal(h.hadithNumber, "42");
  assert.equal(h.en.text, "Invented English text.");
  assert.ok(!JSON.stringify(h).includes("must never be used"), "the HTML body is never read");
  assert.deepEqual(h.en.grades, [{ gradedBy: "Tester", grade: "Sahih" }, { gradedBy: null, grade: "Hasan" }], "empty grades dropped, unnamed grader stays null");
  assert.equal(h.ar.text, "نص تجريبي");
  assert.equal(http.urls[0], "https://api.islamic.app/v1/hadith/collections/bukhari/books/3/hadiths/42");
});

test("hadith(): a missing text gives null, not an empty string", async () => {
  const h = await clientFor(fakeHttp(() => ok(entry({ ar: { urn: 2 } })))).hadith("bukhari", "3", "42");
  assert.equal(h.ar.text, null);
  assert.deepEqual(h.ar.grades, []);
});

test("collections() and books()", async () => {
  const http = fakeHttp((url) =>
    url.endsWith("/collections")
      ? ok([{ slug: "bukhari", type: "hadith", name: { en: "Test Collection", ar: "مجموعة" }, intro: { en: "About." }, hasBooks: true, hasChapters: true, totalHadith: 10, totalAvailable: 9 }])
      : ok([{ collection: "bukhari", bookNumber: "1", hadithStartNumber: 1, hadithEndNumber: 5, hadithCount: 5, name: { en: "Book one", ar: "كتاب" } }]),
  );
  const c = clientFor(http);
  const cols = await c.collections();
  assert.equal(cols[0]!.nameEn, "Test Collection");
  assert.equal(cols[0]!.hasBooks, true);
  const books = await c.books("bukhari");
  assert.deepEqual([books[0]!.bookNumber, books[0]!.hadithCount, books[0]!.nameEn], ["1", 5, "Book one"]);
});

test("hadiths(): paging parameters and total", async () => {
  const http = fakeHttp(() => ok({ total: 99, offset: 20, hadiths: [entry(), entry({ hadithNumber: 43 })] }));
  const page = await clientFor(http).hadiths("muslim", "2", { limit: 20, offset: 20 });
  assert.equal(page.total, 99);
  assert.equal(page.items.length, 2);
  assert.match(http.urls[0]!, /\/collections\/muslim\/books\/2\/hadiths\?limit=20&offset=20$/);
});

test("search(): builds the query, parses marked snippets", async () => {
  const http = fakeHttp(() => ok({ total: 1, offset: 0, results: [{ ...entry(), snippet: { en: "an <mark>invented</mark> line &amp; more<script>x</script>", ar: "" } }] }));
  const r = await clientFor(http).search("  invented   word ", { collection: "bukhari", limit: 5 });
  assert.equal(http.urls[0], "https://api.islamic.app/v1/hadith/search?q=invented%20word&collection=bukhari&limit=5&offset=0");
  assert.deepEqual(r.items[0]!.snippet.en, [{ text: "an ", mark: false }, { text: "invented", mark: true }, { text: " line & morex", mark: false }]);
  assert.equal(r.items[0]!.snippet.ar, null);
});

test("parseSnippet: only <mark> matters, other tags vanish, entities decode once", () => {
  assert.deepEqual(parseSnippet("a <b>b</b> &amp;lt; <MARK>c</MARK>"), [{ text: "a b &lt; ", mark: false }, { text: "c", mark: true }]);
  assert.deepEqual(parseSnippet(""), []);
  assert.deepEqual(parseSnippet("<mark></mark>"), []);
});

test("inputs are validated before any request is made", async () => {
  const http = fakeHttp(() => ok([]));
  const c = clientFor(http);
  for (const bad of ["", "../x", "a/b", "Bukhari", "x".repeat(40), "a?b=1"])
    await assert.rejects(c.books(bad), (e) => e instanceof HadithError && e.code === "bad-request", bad);
  await assert.rejects(c.hadith("bukhari", "1/../2", "3"), (e) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(c.hadith("bukhari", "1", "%2e"), (e) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(c.search("a"), (e) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(c.search("x".repeat(201)), (e) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(c.hadiths("bukhari", "1", { limit: 500 }), (e) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(c.hadiths("bukhari", "1", { offset: -1 }), (e) => e instanceof HadithError && e.code === "bad-request");
  assert.deepEqual(http.urls, [], "nothing reached the network");
});

test("errors: not found, rate limit with Retry-After, server, bad status, not JSON, wrong envelope, wrong shape", async () => {
  const code = async (res: HadithHttpResponse) => {
    try {
      await clientFor(fakeHttp(() => res)).hadith("bukhari", "1", "1");
      return "none";
    } catch (e) {
      return e instanceof HadithError ? `${e.code}:${e.retryAfterSeconds}` : "other";
    }
  };
  assert.equal(await code({ status: 404, body: "", retryAfterSeconds: null }), "not-found:null");
  assert.equal(await code({ status: 429, body: "", retryAfterSeconds: 30 }), "rate-limited:30");
  assert.equal(await code({ status: 503, body: "", retryAfterSeconds: null }), "server:null");
  assert.equal(await code({ status: 302, body: "", retryAfterSeconds: null }), "bad-response:null");
  assert.equal(await code({ status: 200, body: "<html>", retryAfterSeconds: null }), "bad-response:null");
  assert.equal(await code({ status: 200, body: JSON.stringify({ code: 500, data: {} }), retryAfterSeconds: null }), "bad-response:null");
  assert.equal(await code({ status: 200, body: JSON.stringify({ code: 200 }), retryAfterSeconds: null }), "bad-response:null");
  assert.equal(await code(ok({ collection: "bukhari" })), "bad-response:null");
  assert.equal(await code(ok([])), "bad-response:null");
  assert.equal(await code({ status: 200, body: envelope("x".repeat(2_000_001)), retryAfterSeconds: null }), "bad-response:null");
});

test("network failures become HadithError; typed errors pass through", async () => {
  await assert.rejects(clientFor(fakeHttp(() => new Error("boom"))).collections(), (e) => e instanceof HadithError && e.code === "network");
  await assert.rejects(clientFor(fakeHttp(() => new HadithError("timeout", "slow"))).collections(), (e) => e instanceof HadithError && e.code === "timeout");
});

test("a cancelled request reports cancelled and makes no call", async () => {
  const http = fakeHttp(() => ok([]));
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(clientFor(http).collections(ctl.signal), (e) => e instanceof HadithError && e.code === "cancelled");
  assert.deepEqual(http.urls, []);
});

test("memory cache: a repeat is not fetched again, expires, and can be cleared; failures are not cached", async () => {
  let t = 0;
  const http = fakeHttp(() => ok([]));
  const c = clientFor(http, { now: () => t, cacheTtlMs: 1000 });
  await c.collections();
  await c.collections();
  assert.equal(http.urls.length, 1);
  t = 1001;
  await c.collections();
  assert.equal(http.urls.length, 2);
  c.clearCache();
  await c.collections();
  assert.equal(http.urls.length, 3);

  let fail = true;
  const flaky = fakeHttp(() => (fail ? { status: 503, body: "", retryAfterSeconds: null } : ok([])));
  const c2 = clientFor(flaky);
  await assert.rejects(c2.collections());
  fail = false;
  await c2.collections();
  assert.equal(flaky.urls.length, 2);
});

test("cache is bounded and caching can be turned off", async () => {
  const http = fakeHttp(() => ok([]));
  const small = clientFor(http, { cacheMax: 2 });
  await small.books("a");
  await small.books("b");
  await small.books("c");
  await small.books("a");
  assert.equal(http.urls.length, 4, "the oldest was dropped");
  const none = clientFor(http, { cacheTtlMs: 0 });
  const before = http.urls.length;
  await none.collections();
  await none.collections();
  assert.equal(http.urls.length, before + 2);
});

test("requests are spaced by the minimum interval, even when asked for together", async () => {
  let t = 1000;
  const sleeps: number[] = [];
  const c = createHadithClient({ http: fakeHttp(() => ok([])), minIntervalMs: 200, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, cacheTtlMs: 0 });
  await Promise.all([c.collections(), c.books("a"), c.books("b")]);
  assert.equal(sleeps.length, 2);
  assert.equal(t, 1400, "the third request starts 400 ms after the first");
});

test("sunnahUrl and gradeLabel", () => {
  assert.equal(sunnahUrl("bukhari", "42"), "https://sunnah.com/bukhari:42");
  assert.equal(sunnahUrl("forty", "5"), "https://sunnah.com/nawawi40:5");
  assert.equal(sunnahUrl("bukhari", "42a"), null, "no guessing for non-numeric numbers");
  assert.equal(sunnahUrl("unknowncollection", "1"), null);
  assert.equal(gradeLabel({ gradedBy: "A", grade: "Sahih" }), "Sahih (A)");
  assert.equal(gradeLabel({ gradedBy: null, grade: "Sahih" }), "Sahih");
});
