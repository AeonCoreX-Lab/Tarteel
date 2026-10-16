import { parseEd25519PublicKeyPem } from "@tarteel/database";

/** The app's pack settings file: apps/mobile/src/knowledge/config.json. */
export interface AppKnowledgeConfig {
  catalogUrl: string;
  publisherKeys: string[];
}

/**
 * Builds the app's pack settings from a catalogue address and one or more publisher public keys (PEM). Several keys let a key
 * be rotated across two app releases. Refuses anything the app would reject or silently ignore.
 */
export function buildAppConfig(catalogUrl: string, keyPems: readonly string[]): { config: AppKnowledgeConfig | null; errors: string[] } {
  const errors: string[] = [];
  if (!catalogUrl.startsWith("https://")) errors.push("the catalogue address must start with https://");
  else if (/\s/.test(catalogUrl) || !catalogUrl.endsWith("catalog.json")) errors.push("the catalogue address must be the full URL of catalog.json (no spaces)");
  if (keyPems.length === 0) errors.push("at least one publisher public key is required");
  keyPems.forEach((k, i) => {
    if (/PRIVATE/.test(k)) errors.push(`key ${i + 1} is a PRIVATE key: never put it in the app`);
    else if (!parseEd25519PublicKeyPem(k)) errors.push(`key ${i + 1} is not an Ed25519 public key PEM (npm run pack:keygen prints one)`);
  });
  if (new Set(keyPems.map((k) => k.trim())).size !== keyPems.length) errors.push("the same key is listed twice");
  return errors.length > 0 ? { config: null, errors } : { config: { catalogUrl, publisherKeys: keyPems.map((k) => `${k.trim()}\n`) }, errors };
}

export const formatAppConfig = (c: AppKnowledgeConfig): string => JSON.stringify(c, null, 2) + "\n";
