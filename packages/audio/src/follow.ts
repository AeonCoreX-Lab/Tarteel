import type { AyahRef } from "./types.ts";

export interface FollowInput {
  /** The reader has not been scrolled away from the recitation by hand. */
  following: boolean;
  playing: boolean;
  /** The ayah being recited, or null. */
  active: AyahRef | null;
  /** The surah this screen shows. */
  surahId: number;
  /** The last list index this logic asked the screen to scroll to (-1 for none). */
  lastScrolled: number;
}

/**
 * The 0-based list index the reader should scroll to so the recited ayah stays in view, or null for "leave it".
 *
 * The list holds the whole surah, so the index is the ayah number minus one. It scrolls only while a recitation of
 * THIS surah is playing and the reader has not taken over, and only once per ayah: scrolling again to the same
 * place would fight a reader who is nudging the list.
 */
export function followTarget(i: FollowInput): number | null {
  if (!i.following || !i.playing || !i.active || i.active.surahId !== i.surahId) return null;
  // The Bismillah (ayah 0) sits in the list header, above the first row: nothing to scroll to.
  if (i.active.ayahNumber < 1) return null;
  const index = i.active.ayahNumber - 1;
  return index === i.lastScrolled ? null : index;
}
