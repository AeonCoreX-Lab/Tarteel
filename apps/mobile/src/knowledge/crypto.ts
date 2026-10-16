import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { createPublisherVerifier } from "@tarteel/database";

/**
 * Hashing and signature checking for knowledge packs, in pure JavaScript (the audited @noble libraries, MIT): Hermes has no
 * WebCrypto, and the app only ever VERIFIES, so there is no private key and no randomness involved. SHA-256 in JS handles
 * a few MB per second at worst, which is fine for packs of a few MB; if packs grow large, swap `sha256Hex` for a native digest.
 */
const HEX = "0123456789abcdef";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = sha256(bytes);
  let out = "";
  for (const b of digest) out += HEX[b >> 4]! + HEX[b & 15]!;
  return out;
}

/** Verifies against the publisher keys in `config.json`. With no key configured nothing verifies. */
export const makeSignatureVerifier = (publicKeyPems: readonly string[]) => createPublisherVerifier(publicKeyPems, (signature, message, publicKey) => ed25519.verify(signature, message, publicKey));
