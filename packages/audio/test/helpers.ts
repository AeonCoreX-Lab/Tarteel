import type { AudioHttp } from "../src/download.ts";
import type { Reciter } from "../src/types.ts";

/** Clearly synthetic: no real reciter, no real host. `.invalid` can never resolve. */
export function makeReciter(over: Partial<Reciter> = {}): Reciter {
  return {
    id: "test-reciter",
    name: "Test Reciter",
    arabicName: "قارئ تجريبي",
    urlTemplate: "https://audio.example.invalid/data/test/{surah3}{ayah3}.mp3",
    bitrateKbps: 64,
    riwayah: "hafs",
    attribution: "Synthetic test fixture",
    verification: { licenseVerified: true, verifiedOn: "2026-01-01", verifiedBy: "tests", termsUrl: "https://example.invalid/terms" },
    enabled: true,
    ...over,
  };
}

/** Bytes that pass the MP3 check: an ID3 header followed by padding. */
export function fakeMp3(size = 2000, seed = 1): Uint8Array {
  const b = new Uint8Array(size).fill(seed % 256);
  b.set([0x49, 0x44, 0x33, 0x04], 0);
  return b;
}

export type Handler = (url: string, n: number) => { status: number; bytes?: Uint8Array } | Error;

/** A scripted network. `calls` records every URL requested. */
export function fakeHttp(handler: Handler): AudioHttp & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get(url, opts) {
      calls.push(url);
      if (opts.signal?.aborted) throw new Error("aborted");
      const r = handler(url, calls.length);
      if (r instanceof Error) throw r;
      return { status: r.status, bytes: r.bytes ?? new Uint8Array() };
    },
  };
}

export const noSleep = async (): Promise<void> => undefined;
