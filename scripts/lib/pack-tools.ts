import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { PackManifest } from "@tarteel/database";
import { canonicalManifestBytes } from "@tarteel/database";

/** Ed25519 signing for pack manifests. The private key stays with the publisher (a GitHub Actions secret), never in the repo. */

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

export function generatePackKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Returns the manifest with its `signature` set. Any existing signature is replaced. */
export function signManifest(manifest: PackManifest, privateKeyPem: string): PackManifest {
  const signature = sign(null, canonicalManifestBytes(manifest), createPrivateKey(privateKeyPem)).toString("base64");
  return { ...manifest, signature };
}

/** A `PackPorts.verifySignature` for one publisher key. */
export function signatureVerifier(publicKeyPem: string): (message: Uint8Array, signatureBase64: string) => Promise<boolean> {
  const key = createPublicKey(publicKeyPem);
  return async (message, signatureBase64) => verify(null, message, key, Buffer.from(signatureBase64, "base64"));
}
