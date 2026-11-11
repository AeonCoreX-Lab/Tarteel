/**
 * Generated book covers. Tarteel draws its own cover for every book (a pattern, the title, the author) instead of showing a
 * publisher's image, so there is nothing to license, it works offline, and the library looks like a library. The colours are
 * Tarteel's own and are fixed (the same in light and dark mode, like a printed cover).
 */

export interface CoverPalette {
  /** Cover background. */
  readonly bg: string;
  /** Title and author. */
  readonly ink: string;
  /** Border, star and the pattern. */
  readonly gold: string;
}

const INK = "#FBF9F4";
const GOLD = "#E3B94F";

const PALETTES: readonly CoverPalette[] = [
  { bg: "#03402E", ink: INK, gold: GOLD }, // 0 deep green
  { bg: "#1F3A5F", ink: INK, gold: GOLD }, // 1 navy
  { bg: "#5B2A3A", ink: INK, gold: GOLD }, // 2 burgundy
  { bg: "#3E2F5B", ink: INK, gold: GOLD }, // 3 plum
  { bg: "#14505C", ink: INK, gold: GOLD }, // 4 teal
  { bg: "#4F3414", ink: INK, gold: GOLD }, // 5 brown
  { bg: "#3F3F18", ink: INK, gold: GOLD }, // 6 olive
  { bg: "#2F3E46", ink: INK, gold: GOLD }, // 7 slate
  { bg: "#512920", ink: INK, gold: GOLD }, // 8 rust
];

/** One colour per subject, so a shelf of one subject looks alike. */
const BY_GENRE: Readonly<Record<string, number>> = {
  tafsir: 0,
  aqeedah: 1,
  fiqh: 2,
  "usul-fiqh": 3,
  tasawwuf: 4,
  seerah: 5,
  tarikh: 6,
  lughah: 7,
  mantiq: 3,
  firaq: 8,
};

/** A small stable hash (FNV-1a), so the same book always gets the same colour. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The palette for a book: by its genre when it is a known one, otherwise by its id, so every book has one colour for good. */
export function bookCoverPalette(genre: string | null | undefined, key: string): CoverPalette {
  const g = (genre ?? "").trim().toLowerCase();
  const byGenre = BY_GENRE[g];
  const i = byGenre !== undefined ? byGenre : hash(key) % PALETTES.length;
  return PALETTES[i] ?? PALETTES[0]!;
}

export const BOOK_COVER_PALETTES: readonly CoverPalette[] = PALETTES;

/** The title as it fits on a cover: whitespace tidied, cut at a word end with an ellipsis if longer than `max` characters. */
export function coverTitle(title: string, max = 56): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
