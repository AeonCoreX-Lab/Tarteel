import { test } from "node:test";
import assert from "node:assert/strict";
import { HadithError, createIslamicBooksClient, isBookSlug, parseBookDetail, parseBookList, parseBookText, parseGenres, parseIslamicBooksSearch, unwrapIslamicBooks } from "../src/index.ts";
import type { HadithHttp } from "../src/index.ts";

// Every title, name and text below is invented (clearly synthetic): they only have the shape of the publisher's answers.
const env = (data: unknown): string => JSON.stringify({ code: 200, status: "OK", data });
const listItem = { slug: "synthetic-book", title_ar: "كتاب تجريبي", title_en: "Synthetic Book", author_id: "synthetic-author-100h", author_name_ar: "مؤلف تجريبي", author_name_en: "Synthetic Author", author_died_year_hijri: 100, genre: "general", school: null, written_year_hijri: 90, pages: 12, has_pdf: true, has_text: true, has_chapters: true };

function fakeHttp(answers: Record<string, { status?: number; body: string }>, calls: string[] = []): HadithHttp {
  return {
    async get(url) {
      calls.push(url);
      const a = answers[url.replace("https://api.islamic.app/v1/library", "")];
      if (!a) return { status: 404, body: "", retryAfterSeconds: null };
      return { status: a.status ?? 200, body: a.body, retryAfterSeconds: null };
    },
  };
}

const fast = { minIntervalMs: 0, searchIntervalMs: 0, sleep: async () => undefined };

test("the envelope is read, and so is the older bare shape", () => {
  assert.deepEqual(unwrapIslamicBooks({ code: 200, status: "OK", data: { a: 1 } }), { a: 1 });
  assert.deepEqual(unwrapIslamicBooks({ a: 1 }), { a: 1 });
  assert.throws(() => unwrapIslamicBooks({ code: 404, status: "x", data: "not_found: Book not found" }), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  assert.throws(() => unwrapIslamicBooks([1]), HadithError);
});

test("a book list keeps what it can read and drops what it cannot", () => {
  const r = parseBookList({ code: 200, status: "OK", data: { total: 87, limit: 5, offset: 10, books: [listItem, { slug: "no-title" }, "junk", { ...listItem, slug: "pdf-only", has_text: false }] } });
  assert.equal(r.total, 87);
  assert.equal(r.offset, 10);
  assert.deepEqual(r.books.map((b) => b.slug), ["synthetic-book", "pdf-only"]);
  assert.equal(r.books[0]?.authorEn, "Synthetic Author");
  assert.equal(r.books[0]?.hasText, true);
  assert.equal(r.books[1]?.hasText, false);
  assert.throws(() => parseBookList({ data: {}, code: 200 }), HadithError);
});

test("book detail carries the sources the publisher requires to be shown", () => {
  const d = parseBookDetail({ code: 200, status: "OK", data: { book: { ...listItem, description_en: "A synthetic description.", sources: [{ source_name: "usul.ai/turath", source_url: "https://app.turath.io/book/1" }, { source_name: "shamela.ws" }, { nothing: true }] } } });
  assert.equal(d.descriptionEn, "A synthetic description.");
  assert.deepEqual(d.sources, [{ name: "usul.ai/turath", url: "https://app.turath.io/book/1" }, { name: "shamela.ws", url: null }]);
  // the bare shape works too
  assert.equal(parseBookDetail({ book: listItem }).slug, "synthetic-book");
  assert.throws(() => parseBookDetail({ code: 200, data: { book: { nothing: 1 } } }), HadithError);
});

test("genres use slug and labelEn", () => {
  const g = parseGenres({ code: 200, data: { genres: [{ slug: "tafsir", labelEn: "Tafsir", descriptionEn: "x", count: 87 }, { labelEn: "no slug" }] } });
  assert.deepEqual(g, [{ slug: "tafsir", label: "Tafsir", count: 87 }]);
});

test("book text: chapters, volume as text or number, edition details, empty chapters dropped", () => {
  const t = parseBookText({
    code: 200,
    data: {
      slug: "synthetic-book", source: "turath", pageCount: 12, bibliography: { investigator: "Synthetic Editor", publicationYear: 1996 },
      chapters: [{ title: "باب", level: 2, vol: "2", page: 340, text: "نص تجريبي" }, { title: "", text: "   " }, { title: "ثان", level: 0, vol: 1, page: null, text: "نص" }, "junk"],
    },
  });
  assert.equal(t.origin, "turath");
  assert.equal(t.bibliography.year, "1996");
  assert.equal(t.bibliography.publisher, null);
  assert.equal(t.chapters.length, 2);
  assert.deepEqual(t.chapters[0], { title: "باب", level: 2, vol: "2", page: 340, text: "نص تجريبي" });
  assert.equal(t.chapters[1]?.level, 1);
  assert.equal(t.chapters[1]?.vol, "1");
  assert.throws(() => parseBookText({ code: 200, data: { slug: "x" } }), HadithError);
});

test("search results; no results is an empty list, not an error", () => {
  const hits = parseIslamicBooksSearch({ code: 200, data: { query: "q", count: 2, results: [{ book_slug: "a", book_title_en: "A", chapter_title_ar: "ب", start_page: 5, genre: "fiqh", score: 0.71 }, { nothing: 1 }] } });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.score, 0.71);
  assert.deepEqual(parseIslamicBooksSearch({ code: 200, data: { query: "", count: 0, reason: "empty_query" } }), []);
});

test("only the publisher's slug alphabet reaches an address", () => {
  assert.equal(isBookSlug("al-aqeedah-al-wasitiyya"), true);
  assert.equal(isBookSlug("a.b:c'd"), true);
  for (const s of ["", "../x", "a/b", "a\\b", "A", "a b", "a?x=1", ".hidden"]) assert.equal(isBookSlug(s), false, s);
});

test("the client asks the right addresses and never an address built from outside text", async () => {
  const calls: string[] = [];
  const http = fakeHttp(
    {
      "/books?genre=fiqh&limit=30&offset=0": { body: env({ total: 1, limit: 30, offset: 0, books: [listItem] }) },
      "/books/synthetic-book": { body: env({ book: listItem }) },
      "/books/synthetic-book/text": { body: env({ slug: "synthetic-book", chapters: [{ title: "t", text: "x" }] }) },
      "/search?q=%D8%B7%D9%87%D8%A7%D8%B1%D8%A9&limit=12": { body: env({ results: [] }) },
    },
    calls,
  );
  const c = createIslamicBooksClient({ http, ...fast });
  assert.equal((await c.books({ genre: "fiqh" }, undefined)).books.length, 1);
  assert.equal((await c.book("synthetic-book")).slug, "synthetic-book");
  assert.equal((await c.text("synthetic-book")).chapters.length, 1);
  assert.deepEqual(await c.search("طهارة", {}), []);
  assert.equal(c.pdfUrl("synthetic-book"), "https://api.islamic.app/v1/library/books/synthetic-book/file?format=pdf");
  await assert.rejects(() => c.book("../etc"), (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  await assert.rejects(() => c.books({ genre: "fiqh&x=1" }, undefined), (e: unknown) => e instanceof HadithError && e.code === "bad-request");
  assert.deepEqual(await c.search("a", {}), []); // too short: no request
  assert.equal(calls.length, 4);
});

test("a repeat within the cache time makes no second request; clearing forgets", async () => {
  const calls: string[] = [];
  const c = createIslamicBooksClient({ http: fakeHttp({ "/books/synthetic-book": { body: env({ book: listItem }) } }, calls), ...fast });
  await c.book("synthetic-book");
  await c.book("synthetic-book");
  assert.equal(calls.length, 1);
  c.clearCache();
  await c.book("synthetic-book");
  assert.equal(calls.length, 2);
});

test("answers that are not what the publisher documents become coded errors", async () => {
  const mk = (status: number, body = ""): ReturnType<typeof createIslamicBooksClient> => createIslamicBooksClient({ http: fakeHttp({ "/books/synthetic-book": { status, body } }), ...fast });
  await assert.rejects(() => mk(404).book("synthetic-book"), (e: unknown) => e instanceof HadithError && e.code === "not-found");
  await assert.rejects(() => mk(429).book("synthetic-book"), (e: unknown) => e instanceof HadithError && e.code === "rate-limited");
  await assert.rejects(() => mk(503).book("synthetic-book"), (e: unknown) => e instanceof HadithError && e.code === "server");
  await assert.rejects(() => mk(200, "<html>").book("synthetic-book"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
  await assert.rejects(() => mk(200, "[]").book("synthetic-book"), (e: unknown) => e instanceof HadithError && e.code === "bad-response");
});

test("searches are spaced further apart than other requests", async () => {
  let clock = 0;
  const waits: number[] = [];
  const c = createIslamicBooksClient({
    http: fakeHttp({ "/search?q=aa&limit=12": { body: env({ results: [] }) }, "/search?q=bb&limit=12": { body: env({ results: [] }) } }),
    minIntervalMs: 1000,
    searchIntervalMs: 6500,
    now: () => clock,
    sleep: async (ms) => { waits.push(ms); clock += ms; },
  });
  await c.search("aa", {});
  await c.search("bb", {});
  assert.deepEqual(waits, [6500]);
});
