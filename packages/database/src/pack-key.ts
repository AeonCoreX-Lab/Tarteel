/**
 * Reading the publisher's Ed25519 public key. The key is a standard SPKI PEM (what `npm run pack:keygen` prints); the
 * signature check itself needs the raw 32 bytes. Pure TypeScript: `atob` exists in Node and in Hermes.
 */

// DER for SubjectPublicKeyInfo of an Ed25519 key: SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING (33 bytes, 0 unused bits) }.
const SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];

/** Base64 to bytes, or null when the text is not valid base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The raw 32-byte Ed25519 public key inside a PEM, or null when the text is not exactly that. */
export function parseEd25519PublicKeyPem(pem: string): Uint8Array | null {
  const m = /^\s*-----BEGIN PUBLIC KEY-----([A-Za-z0-9+/=\s]+)-----END PUBLIC KEY-----\s*$/.exec(pem);
  if (!m?.[1]) return null;
  const der = base64ToBytes(m[1]);
  if (!der || der.length !== SPKI_PREFIX.length + 32) return null;
  for (let i = 0; i < SPKI_PREFIX.length; i++) if (der[i] !== SPKI_PREFIX[i]) return null;
  return der.slice(SPKI_PREFIX.length);
}

/** The raw Ed25519 check an adapter provides (for example `ed25519.verify` from @noble/curves). May throw on malformed input. */
export type Ed25519Verify = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => boolean;

/**
 * `PackPorts.verifySignature` for the publisher keys built into the app. Any one of the keys may have signed (so a key can
 * be rotated across two app releases). With no usable key nothing verifies, so a build without a publisher key installs no
 * pack. A malformed signature or a throwing verifier means "not verified", never an exception.
 */
export function createPublisherVerifier(publicKeyPems: readonly string[], verify: Ed25519Verify): (message: Uint8Array, signatureBase64: string) => Promise<boolean> {
  const keys = publicKeyPems.map(parseEd25519PublicKeyPem).filter((k): k is Uint8Array => k !== null);
  return async (message, signatureBase64) => {
    const signature = base64ToBytes(signatureBase64);
    if (!signature || signature.length !== 64) return false;
    for (const key of keys) {
      try {
        if (verify(signature, message, key)) return true;
      } catch {
        /* not this key */
      }
    }
    return false;
  };
}
