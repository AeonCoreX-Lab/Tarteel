import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, QURANENC_EDITIONS, createQuranEncClient, findQuranEncEdition, parseQuranEncAyah, quranEncEditionsFor, quranEncUrl } from "../src/index.ts";
import type { HadithHttp, HadithHttpResponse } from "../src/index.ts";

// Every text below is invented for the tests. No QuranEnc text is stored in this repository.

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

const clientFor = (http: HadithHttp, extra: Record<string, unknown> = {}) => createQuranEncClient({ http, minIntervalMs: 0, sleep: async () => {}, ...extra });
const row = (over: Record<string, unknown> = {}) => ({ id: "9", sura: "2", aya: "255", arabic_text: "نص تجريبي", translation: "  Invented tafsir.\nSecond line.[1] ", footnotes: "[1] Invented note.", ...over });

test("aya(): asks the right address and keeps every text exactly as sent", async () => {
  const http = fakeHttp(() => ok({ result: row() }));
  const a = await clientFor(http).aya("english_saheeh", 2, 255);
  assert.equal(http.urls[0], "https://quranenc.com/api/v1/translation/aya/english_saheeh/2/255");
  assert.deepEqual(a, { sura: 2, aya: 255, arabic: "نص تجريبي", text: "  Invented tafsir.\nSecond line.[1] ", footnotes: "[1] Invented note.", range: null });
});

test("aya(): a list of one is accepted; numbers may be numbers; empty fields become null", async () => {
  const a = await clientFor(fakeHttp(() => ok({ result: [row({ sura: 1, aya: 7, footnotes: "", arabic_text: undefined })] }))).aya("english_saheeh", 1, 7);
  assert.equal(a.sura, 1);
  assert.equal(a.aya, 7);
  assert.equal(a.footnotes, null);
  assert.equal(a.arabic, null);
});

test("an ayah with no text at all, or with a bad number, is refused", async () => {
  const bad = (r: unknown) => assert.rejects(clientFor(fakeHttp(() => ok({ result: r }))).aya("english_saheeh", 1, 1), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  await bad(row({ translation: "", footnotes: "" }));
  await bad(row({ sura: "x" }));
  await bad(row({ aya: 0 }));
  await bad("text");
  await bad(null);
  await assert.rejects(clientFor(fakeHttp(() => ok({ nothing: 1 }))).aya("english_saheeh", 1, 1), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  assert.throws(() => parseQuranEncAyah([]), HadithError);
});

test("sura(): ayahs in order; one unreadable row does not hide the others; none readable is an error", async () => {
  const http = fakeHttp(() => ok({ result: [row({ aya: "3" }), row({ aya: "1" }), row({ aya: "x" }), row({ aya: "2", translation: "", footnotes: "" })] }));
  const list = await clientFor(http).sura("english_saheeh", 2);
  assert.equal(http.urls[0], "https://quranenc.com/api/v1/translation/sura/english_saheeh/2");
  assert.deepEqual(list.map((a) => a.aya), [1, 3]);
  await assert.rejects(clientFor(fakeHttp(() => ok({ result: [row({ aya: "x" })] }))).sura("english_saheeh", 2), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  await assert.rejects(clientFor(fakeHttp(() => ok({ result: row() }))).sura("english_saheeh", 2), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("input is checked before any request is made", async () => {
  const http = fakeHttp(() => ok({ result: row() }));
  const c = clientFor(http);
  const rejects = (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  await rejects(c.aya("../x", 1, 1));
  await rejects(c.aya("Bengali", 1, 1));
  await rejects(c.aya("a", 1, 1));
  await rejects(c.aya("english_saheeh/../x", 1, 1));
  await rejects(c.aya("english_saheeh", 0, 1));
  await rejects(c.aya("english_saheeh", 115, 1));
  await rejects(c.aya("english_saheeh", 1, 0));
  await rejects(c.aya("english_saheeh", 1, 287));
  await rejects(c.aya("english_saheeh", 1.5, 1));
  await rejects(c.sura("english_saheeh", 0));
  assert.equal(http.urls.length, 0);
});

test("errors: 404, 429 with Retry-After, 5xx, other statuses, bad JSON, oversize, network, timeout", async () => {
  const code = async (res: HadithHttpResponse | Error) => {
    try {
      await clientFor(fakeHttp(() => res)).aya("english_saheeh", 1, 1);
    } catch (e) {
      assert.ok(e instanceof HadithError);
      return e;
    }
    throw new Error("did not throw");
  };
  assert.equal((await code({ status: 404, body: "", retryAfterSeconds: null })).code, "not-found");
  const rate = await code({ status: 429, body: "", retryAfterSeconds: 4 });
  assert.equal(rate.code, "rate-limited");
  assert.equal(rate.retryAfterSeconds, 4);
  assert.equal((await code({ status: 502, body: "", retryAfterSeconds: null })).code, "server");
  assert.equal((await code({ status: 301, body: "", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "<html>", retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code({ status: 200, body: "x".repeat(3_000_001), retryAfterSeconds: null })).code, "bad-response");
  assert.equal((await code(new Error("offline"))).code, "network");
  assert.equal((await code(new HadithError("timeout", "slow"))).code, "timeout");
});

test("answers are remembered briefly, spaced apart, and a request cancelled before it starts never goes out", async () => {
  let t = 0;
  const http = fakeHttp(() => ok({ result: row() }));
  const c = clientFor(http, { now: () => t, cacheTtlMs: 1000 });
  await c.aya("english_saheeh", 2, 255);
  await c.aya("english_saheeh", 2, 255);
  assert.equal(http.urls.length, 1);
  await c.aya("english_rwwad", 2, 255);
  assert.equal(http.urls.length, 2, "another edition is another answer");
  t = 1500;
  await c.aya("english_saheeh", 2, 255);
  assert.equal(http.urls.length, 3, "expired");
  c.clearCache();
  await c.aya("english_saheeh", 2, 255);
  assert.equal(http.urls.length, 4);

  let now = 1000;
  const sleeps: number[] = [];
  const spaced = createQuranEncClient({ http, minIntervalMs: 250, now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; }, cacheTtlMs: 0 });
  await Promise.all([spaced.aya("english_saheeh", 1, 1), spaced.aya("english_saheeh", 1, 2), spaced.aya("english_saheeh", 1, 3)]);
  assert.deepEqual(sleeps, [250, 250]);
  const ctl = new AbortController();
  ctl.abort();
  const before = http.urls.length;
  await assert.rejects(spaced.aya("english_saheeh", 1, 4, ctl.signal), (e: unknown) => e instanceof HadithError && e.code === "cancelled");
  assert.equal(http.urls.length, before);
});

test("editions: unique keys, both titles, the app language's own come first, addresses are checked", () => {
  const keys = QURANENC_EDITIONS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const e of QURANENC_EDITIONS) assert.ok(e.title.en && e.title.bn, e.key);
  assert.equal(quranEncEditionsFor("bn")[0]?.key, "bengali_mokhtasar");
  assert.equal(quranEncEditionsFor("en")[0]?.key, "english_saheeh");
  assert.equal(quranEncEditionsFor("ar")[0]?.key, "arabic_saadi");
  assert.equal(quranEncEditionsFor("bn").length, QURANENC_EDITIONS.length);
  assert.equal(findQuranEncEdition("arabic_saadi")?.kind, "tafsir");
  assert.equal(findQuranEncEdition("nope"), undefined);
  assert.equal(quranEncUrl("ar", "arabic_saadi", 2, 255), "https://quranenc.com/ar/browse/arabic_saadi/2/255");
  assert.equal(quranEncUrl("en", "english_saheeh", 2), "https://quranenc.com/en/browse/english_saheeh/2");
  assert.equal(quranEncUrl("en", "../x", 2), null);
  assert.equal(quranEncUrl("en", "english_saheeh", 200), null);
  assert.equal(quranEncUrl("en", "english_saheeh", 2, 0), null);
});

const block = (over: Record<string, unknown> = {}) => ({ id: 5, sura: 2, from_aya: 255, to_aya: 255, type: "tafsir", text: "Invented block text.", ...over });

test("tafsir/aya: blocks are read as the docs describe, joined unchanged, with their ayah range", async () => {
  const http = fakeHttp(() => ok({ result: [block({ id: 7, from_aya: 254, to_aya: 256, text: "Second." }), block({ id: 6, from_aya: 254, to_aya: 254, text: " First, with spaces. " })] }));
  const a = await clientFor(http).aya("arabic_saadi", 2, 255);
  assert.equal(http.urls[0], "https://quranenc.com/api/v1/tafsir/aya/arabic_saadi/2/255");
  assert.deepEqual(a, { sura: 2, aya: 254, arabic: null, text: " First, with spaces. \n\nSecond.", footnotes: null, range: { from: 254, to: 256 } });
  // Without a `result` wrapper, and as one block, it reads the same.
  const b = await clientFor(fakeHttp(() => ok(block()))).aya("arabic_saadi", 2, 255);
  assert.equal(b.text, "Invented block text.");
  assert.equal(b.range, null);
});

test("tafsir/sura: one entry for each ayah a block starts at, in order; blocks without text are skipped", async () => {
  const http = fakeHttp(() => ok({ result: [block({ from_aya: 3, to_aya: 5 }), block({ from_aya: 1, to_aya: 1, text: "A" }), block({ from_aya: 1, to_aya: 1, text: "B", id: 9 }), block({ from_aya: 2, text: "" })] }));
  const list = await clientFor(http).sura("arabic_saadi", 2);
  assert.equal(http.urls[0], "https://quranenc.com/api/v1/tafsir/sura/arabic_saadi/2");
  assert.deepEqual(list.map((x) => [x.aya, x.range]), [[1, null], [3, { from: 3, to: 5 }]]);
  assert.equal(list[0]?.text, "A\n\nB");
  await assert.rejects(clientFor(fakeHttp(() => ok({ result: [block({ text: "" })] }))).sura("arabic_saadi", 2), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("an edition that is not in the first family is found in the other, and the answer is remembered", async () => {
  const http = fakeHttp((url) => (url.includes("/tafsir/") ? { status: 404, body: "", retryAfterSeconds: null } : ok({ result: row() })));
  const c = clientFor(http, { cacheTtlMs: 0 });
  const a = await c.aya("english_rwwad", 2, 255);
  assert.equal(a.aya, 255);
  assert.deepEqual(http.urls, ["https://quranenc.com/api/v1/translation/aya/english_rwwad/2/255"]);
  const tf = fakeHttp((url) => (url.includes("/tafsir/") ? { status: 404, body: "", retryAfterSeconds: null } : ok({ result: row() })));
  const c2 = clientFor(tf, { cacheTtlMs: 0 });
  await c2.aya("arabic_saadi", 2, 255);
  assert.deepEqual(tf.urls, ["https://quranenc.com/api/v1/tafsir/aya/arabic_saadi/2/255", "https://quranenc.com/api/v1/translation/aya/arabic_saadi/2/255"]);
  await c2.aya("arabic_saadi", 2, 256);
  assert.equal(tf.urls[2], "https://quranenc.com/api/v1/translation/aya/arabic_saadi/2/256", "goes straight to the family that worked");
  // A network failure is not retried in the other family.
  const down = fakeHttp(() => new Error("offline"));
  await assert.rejects(clientFor(down).aya("arabic_saadi", 1, 1), (e: unknown) => e instanceof HadithError && e.code === "network");
  assert.equal(down.urls.length, 1);
  // When neither family has it, the first error is the one reported.
  await assert.rejects(clientFor(fakeHttp(() => ({ status: 404, body: "", retryAfterSeconds: null }))).aya("arabic_saadi", 1, 1), (e: unknown) => e instanceof HadithError && e.code === "not-found");
});

test("versions(): read from both lists; one list failing is fine, both failing is an error", async () => {
  const http = fakeHttp((url) =>
    url.endsWith("/translations/list")
      ? ok({ translations: [{ key: "english_saheeh", language_iso_code: "en", version: "1.0.9", last_update: "1730000000", title: "t" }, { key: "Bad Key", version: "9" }] })
      : ok({ tafsirs: [{ key: "arabic_saadi", version: "1.0.0", last_update: 1785148809 }] }),
  );
  const v = await clientFor(http).versions();
  assert.deepEqual(v, { english_saheeh: { version: "1.0.9", lastUpdate: "1730000000" }, arabic_saadi: { version: "1.0.0", lastUpdate: "1785148809" } });
  const half = await clientFor(fakeHttp((url) => (url.endsWith("/tafsirs/list") ? { status: 500, body: "", retryAfterSeconds: null } : ok({ translations: [{ key: "english_saheeh", version: "1" }] })))).versions();
  assert.equal(half.english_saheeh?.version, "1");
  await assert.rejects(clientFor(fakeHttp(() => ({ status: 500, body: "", retryAfterSeconds: null }))).versions(), (e: unknown) => e instanceof HadithError && e.code === "server");
});

test("bengali_mokhtasar: the answer the publisher really gives (checked on a device) reads as it is: numbered text, null notes, escaped Arabic", async () => {
  // The shape is the real one; every text is invented.
  const http = fakeHttp(() => ok({ result: [{ id: "2", sura: "1", aya: "2", arabic_text: "\u0627\u0644\u062d\u0645\u062f", translation: "\u09e8. \u09aa\u09b0\u09c0\u0995\u09cd\u09b7\u09be\u09ae\u09c2\u09b2\u0995 \u09aa\u09be\u09a0\u0964", footnotes: null }, { id: "1", sura: "1", aya: "1", arabic_text: "\u0628\u0633\u0645", translation: "\u09e7. \u09aa\u09b0\u09c0\u0995\u09cd\u09b7\u09be\u0964", footnotes: null }] }));
  const list = await clientFor(http).sura("bengali_mokhtasar", 1);
  assert.equal(http.urls[0], "https://quranenc.com/api/v1/translation/sura/bengali_mokhtasar/1");
  assert.deepEqual(list.map((a) => a.aya), [1, 2]);
  assert.equal(list[0]?.text?.startsWith("\u09e7."), true, "the ayah number the publisher put in front stays");
  assert.equal(list[0]?.footnotes, null);
  assert.equal(list[0]?.range, null);
});
