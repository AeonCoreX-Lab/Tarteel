/** Smallest believable ayah MP3. Anything at or under this is a bad download. */
export const MIN_AUDIO_BYTES = 1000;

/**
 * Is this the start of an MP3?
 *
 * A size check alone is not enough: a captive portal (hotel wifi, a corporate proxy) answers every request with
 * HTTP 200 and a login page several kilobytes long. That file would sit in the audio folder under an ayah's name,
 * count as downloaded, and be silent when played, offline, weeks later. An MP3 starts with an ID3 tag or an MPEG
 * frame sync (eleven set bits); HTML starts with `<` and JSON with `{`, and neither passes.
 */
export function looksLikeMp3(head: ArrayLike<number>): boolean {
  const b0 = head[0];
  const b1 = head[1];
  const b2 = head[2];
  if (b0 === 0x49 && b1 === 0x44 && b2 === 0x33) return true; // "ID3"
  return b0 === 0xff && b1 !== undefined && (b1 & 0xe0) === 0xe0;
}

/** Throws a short message when `bytes` is not plausibly one ayah's audio. */
export function assertAudioBytes(bytes: Uint8Array): void {
  if (bytes.length <= MIN_AUDIO_BYTES) throw new Error("audio: truncated");
  if (!looksLikeMp3(bytes)) throw new Error("audio: not an mp3");
}
