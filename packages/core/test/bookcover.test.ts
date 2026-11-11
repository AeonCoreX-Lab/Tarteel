import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOK_COVER_PALETTES, bookCoverPalette, coverTitle, ISLAMIC_BOOKS_GENRES } from "../src/index.ts";

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

test("every cover palette is readable: title 7:1, gold 4.5:1", () => {
  for (const p of BOOK_COVER_PALETTES) {
    assert.ok(contrast(p.bg, p.ink) >= 7, `ink on ${p.bg}`);
    assert.ok(contrast(p.bg, p.gold) >= 4.5, `gold on ${p.bg}`);
  }
});

test("a known genre always gets its own colour; the same book always gets the same one", () => {
  assert.equal(bookCoverPalette("tafsir", "a"), bookCoverPalette("tafsir", "b"));
  assert.notEqual(bookCoverPalette("tafsir", "a").bg, bookCoverPalette("fiqh", "a").bg);
  assert.equal(bookCoverPalette(null, "0310Tabari.Tarikh"), bookCoverPalette(undefined, "0310Tabari.Tarikh"));
  assert.equal(bookCoverPalette("unknown-genre", "x").bg, bookCoverPalette("", "x").bg);
  for (const g of ISLAMIC_BOOKS_GENRES) assert.ok(bookCoverPalette(g, "k").bg.startsWith("#"));
});

test("unknown genres spread across the palettes", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(bookCoverPalette(null, `book-${i}`).bg);
  assert.ok(seen.size >= 6);
});

test("coverTitle tidies and shortens at a word end", () => {
  assert.equal(coverTitle("  تفسير   القرآن  "), "تفسير القرآن");
  const long = "word ".repeat(30);
  const out = coverTitle(long, 20);
  assert.ok(out.endsWith("…") && out.length <= 21);
  assert.ok(!out.slice(0, -1).endsWith(" "));
  assert.equal(coverTitle("abc", 20), "abc");
});
