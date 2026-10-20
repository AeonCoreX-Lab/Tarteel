import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, createHadeethClient, hadeethLanguage, hadeethUrl } from "../src/index.ts";
import type { HadithHttp, HadithHttpResponse } from "../src/index.ts";

// Every text below is invented for the tests. No real hadith is stored in this repository.

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

const clientFor = (http: HadithHttp, extra: Record<string, unknown> = {}) => createHadeethClient({ http, minIntervalMs: 0, sleep: async () => {}, ...extra });

const one = (over: Record<string, unknown> = {}) => ({
  id: "77", title: "  Invented title ", hadeeth: "Invented hadith text.\nSecond line.", attribution: "Invented attribution", grade: "Invented grade",
  explanation: "Invented explanation.", hints: ["First hint", "", 5, "Second hint"], categories: ["3", "x", "9"], translations: ["ar", "bn", "en"],
  hadeeth_intro: "Invented intro", hadeeth_ar: "نص تجريبي", hadeeth_intro_ar: "تمهيد", explanation_ar: "شرح", hints_ar: ["فائدة"],
  words_meanings_ar: [{ word: "كلمة", meaning: "معنى" }, { word: "x" }, "junk"], attribution_ar: "متفق", grade_ar: "صحيح", ...over,
});

test("hadeeth(): parses every field and keeps the texts exactly as sent", async () => {
  const http = fakeHttp(() => ok(one()));
  const h = await clientFor(http).hadeeth("bn", "77");
  assert.equal(http.urls[0], "https://hadeethenc.com/api/v1/hadeeths/one/?language=bn&id=77");
  assert.equal(h.language, "bn");
  assert.equal(h.title, "  Invented title ", "not trimmed: the publisher's text is not altered");
  assert.equal(h.text, "Invented hadith text.\nSecond line.");
  assert.equal(h.intro, "Invented intro");
  assert.equal(h.grade, "Invented grade");
  assert.equal(h.attribution, "Invented attribution");
  assert.deepEqual(h.hints, ["First hint", "Second hint"], "empty and non-string hints dropped");
  assert.deepEqual(h.categoryIds, ["3", "9"], "non-numeric category ids dropped");
  assert.deepEqual(h.translations, ["ar", "bn", "en"]);
  assert.equal(h.textAr, "نص تجريبي");
  assert.equal(h.gradeAr, "صحيح");
  assert.deepEqual(h.hintsAr, ["فائدة"]);
  assert.deepEqual(h.wordMeaningsAr, [{ word: "كلمة", meaning: "معنى" }], "only complete word/meaning pairs");
});

test("hadeeth(): empty optional fields become null; a hadith with no text at all is refused", async () => {
  const h = await clientFor(fakeHttp(() => ok(one({ explanation: "", grade: undefined, hadeeth_intro: "  " })))).hadeeth("en", "77");
  assert.equal(h.explanation, null);
  assert.equal(h.grade, null);
  assert.equal(h.intro, null);
  await assert.rejects(clientFor(fakeHttp(() => ok(one({ hadeeth: "", hadeeth_ar: "" })))).hadeeth("en", "77"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("hadeeth(): an Arabic-only hadith is accepted (some have no translation yet)", async () => {
  const h = await clientFor(fakeHttp(() => ok(one({ hadeeth: undefined })))).hadeeth("bn", "77");
  assert.equal(h.text, null);
  assert.equal(h.textAr, "نص تجريبي");
});

test("categories(): ids and counts may be strings or numbers; a parent of 0 or null is top level", async () => {
  const http = fakeHttp(() => ok([
    { id: "1", title: "Faith", hadeeths_count: "12", parent_id: null },
    { id: 2, title: "Prayer", hadeeths_count: 7, parent_id: "1" },
    { id: "3", title: "Root two", hadeeths_count: "0", parent_id: "0" },
  ]));
  const cats = await clientFor(http).categories("en");
  assert.equal(http.urls[0], "https://hadeethenc.com/api/v1/categories/list/?language=en");
  assert.deepEqual(cats, [
    { id: "1", title: "Faith", hadeethsCount: 12, parentId: null },
    { id: "2", title: "Prayer", hadeethsCount: 7, parentId: "1" },
    { id: "3", title: "Root two", hadeethsCount: 0, parentId: null },
  ]);
  await assert.rejects(clientFor(fakeHttp(() => ok([{ id: "1" }]))).categories("en"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  await assert.rejects(clientFor(fakeHttp(() => ok({ not: "an array" }))).categories("en"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("hadeeths(): a page of titles with the paging numbers, whatever type they come as", async () => {
  const http = fakeHttp(() => ok({ data: [{ id: "5", title: "One", translations: ["en"] }, { id: 6, title: "Two" }, { id: "x", title: "bad id" }, { id: "7", title: "" }], meta: { current_page: "2", last_page: 5, total_items: "93", per_page: "20" } }));
  const page = await clientFor(http).hadeeths("bn", "4", { page: 2, perPage: 20 });
  assert.equal(http.urls[0], "https://hadeethenc.com/api/v1/hadeeths/list/?language=bn&category_id=4&page=2&per_page=20");
  assert.deepEqual(page, { items: [{ id: "5", title: "One" }, { id: "6", title: "Two" }], page: 2, lastPage: 5, total: 93, perPage: 20 });
});

test("hadeeths(): missing meta falls back to what was asked for", async () => {
  const page = await clientFor(fakeHttp(() => ok({ data: [{ id: "5", title: "One" }] }))).hadeeths("en", "4");
  assert.deepEqual(page, { items: [{ id: "5", title: "One" }], page: 1, lastPage: 1, total: 1, perPage: 20 });
});

test("input is checked before any request is made", async () => {
  const http = fakeHttp(() => ok([]));
  const c = clientFor(http);
  const rejects = (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  await rejects(c.hadeeth("en", "7/../x"));
  await rejects(c.hadeeth("en", ""));
  await rejects(c.hadeeths("en", "4&x=1"));
  await rejects(c.hadeeths("en", "4", { perPage: 0 }));
  await rejects(c.hadeeths("en", "4", { perPage: 51 }));
  await rejects(c.hadeeths("en", "4", { page: 1.5 }));
  await rejects(c.categories("en&x=1" as never));
  assert.equal(http.urls.length, 0);
});

test("errors: 404, 429 with Retry-After, 5xx, other statuses, bad JSON, oversize, network", async () => {
  const code = async (res: HadithHttpResponse | Error) => {
    try {
      await clientFor(fakeHttp(() => res)).hadeeth("en", "1");
    } catch (e) {
      assert.ok(e instanceof HadithError);
      return e;
    }
    throw new Error("did not throw");
  };
  assert.equal((await code({ status: 404, body: "", retryAfterSeconds: null })).code, "not-found");
  const rate = await code({ status: 429, body: "", retryAfterSeconds: 9 });
  assert.equal(rate.code, "rate-limited");
  assert.equal(rate.retryAfterSeconds, 9);
  assert.equal((await code({ status: 503, body: "", retryAfterSeconds: null })).code, "server");
  assert.equal((await code({ status: 302, body: "", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "<html>", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "x".repeat(2_000_001), retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code(new Error("offline"))).code, "network");
  assert.equal((await code(new HadithError("timeout", "slow"))).code, "timeout");
});

test("answers are remembered briefly, and clearCache forgets them", async () => {
  let t = 0;
  const http = fakeHttp(() => ok(one()));
  const c = clientFor(http, { now: () => t, cacheTtlMs: 1000 });
  await c.hadeeth("en", "77");
  await c.hadeeth("en", "77");
  assert.equal(http.urls.length, 1);
  await c.hadeeth("bn", "77");
  assert.equal(http.urls.length, 2, "another language is another answer");
  t = 1500;
  await c.hadeeth("en", "77");
  assert.equal(http.urls.length, 3, "expired");
  c.clearCache();
  await c.hadeeth("en", "77");
  assert.equal(http.urls.length, 4);
});

test("requests start at least minIntervalMs apart", async () => {
  let t = 1000;
  const sleeps: number[] = [];
  const http = fakeHttp(() => ok(one()));
  const c = createHadeethClient({ http, minIntervalMs: 250, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, cacheTtlMs: 0 });
  await Promise.all([c.hadeeth("en", "1"), c.hadeeth("en", "2"), c.hadeeth("en", "3")]);
  assert.deepEqual(sleeps, [250, 250]);
});

test("a request cancelled before it starts never reaches the network", async () => {
  const http = fakeHttp(() => ok(one()));
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(clientFor(http).hadeeth("en", "1", ctl.signal), (e: unknown) => e instanceof HadithError && e.code === "cancelled");
  assert.equal(http.urls.length, 0);
});

test("hadeethLanguage() and hadeethUrl()", () => {
  assert.equal(hadeethLanguage("bn"), "bn");
  assert.equal(hadeethLanguage("ar"), "ar");
  assert.equal(hadeethLanguage("en"), "en");
  assert.equal(hadeethLanguage("anything else"), "en");
  assert.equal(hadeethUrl("bn", "2962"), "https://hadeethenc.com/bn/browse/hadith/2962");
  assert.equal(hadeethUrl("en", "../x"), null);
});
