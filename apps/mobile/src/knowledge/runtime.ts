import { CONTENT_MIGRATIONS, createKnowledgeReader, createPackLibrary, createSqlPackRegistry, isPackTrusted } from "@tarteel/database";
import type { KnowledgeReader, PackLibrary, PackPorts } from "@tarteel/database";
import { createExpoFileStore } from "../audio/fileStore";
import { createFetchHttp } from "../audio/http";
import { getDatabases } from "../platform/database";
import { openExpoDbAtUri } from "../platform/expo-sqlite-driver";
import { makeSignatureVerifier, sha256Hex } from "./crypto";

/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("./config.json") as { catalogUrl: string; publisherKeys: string[] };

/**
 * Knowledge packs are offered only when the build has BOTH a pack catalogue address and a publisher key. A build without
 * them shows no Library and never touches the network for packs: the Quran, search, bookmarks and notes do not depend on it.
 */
export const knowledgeConfigured: boolean = config.catalogUrl.startsWith("https://") && config.publisherKeys.length > 0;

let ports: Promise<PackPorts> | null = null;

/** The ports every pack operation uses, built once from the open databases. */
function getPorts(): Promise<PackPorts> {
  ports ??= (async () => {
    const { content, user } = await getDatabases();
    const files = createExpoFileStore();
    return {
      files,
      http: createFetchHttp(),
      registry: createSqlPackRegistry(user),
      sha256: sha256Hex,
      verifySignature: makeSignatureVerifier(config.publisherKeys),
      openDb: (relativePath: string) => openExpoDbAtUri(files.resolve("packages", relativePath)),
      quran: content,
      appSchemaVersion: CONTENT_MIGRATIONS.length,
    };
  })();
  return ports;
}

let library: Promise<PackLibrary> | null = null;

/** The app's one pack library. */
export function getLibrary(): Promise<PackLibrary> {
  library ??= getPorts().then((p) => createPackLibrary(p, { catalogUrl: config.catalogUrl }));
  return library;
}

let reader: Promise<KnowledgeReader> | null = null;

/**
 * The app's one reader of installed packs. It reads the registry on every question, so a pack installed, updated or removed
 * in the Library is picked up without any restart. A pack is opened only if its stored manifest still verifies against the
 * publisher keys in `config.json` (so removing a key from the app, or tampering with a pack's manifest, hides that pack).
 * With no pack installed it opens nothing.
 */
export function getReader(): Promise<KnowledgeReader> {
  reader ??= getPorts().then((p) => createKnowledgeReader({ registry: p.registry, openDb: p.openDb, trust: (pack) => isPackTrusted(p, pack) }));
  return reader;
}

// ------------------------------------------------------------------- "the installed packs changed"

let packsVersion = 0;
const packListeners = new Set<() => void>();

/** What the screens subscribe to: it changes every time the installed packs changed (installed, repaired, removed) or a read is asked to start over. */
export const packsVersionStore = {
  subscribe(listener: () => void): () => void {
    packListeners.add(listener);
    return () => {
      packListeners.delete(listener);
    };
  },
  get: (): number => packsVersion,
};

/**
 * Call after a pack was installed, repaired or removed, or when the person asks to try again. The reader closes the pack files it
 * had open and forgets nothing else, and every screen reading packs reads again. Without this a screen that was already open
 * could keep showing what it read before the change.
 */
export async function packsChanged(): Promise<void> {
  if (reader) await (await reader).close().catch(() => undefined);
  packsVersion += 1;
  for (const l of [...packListeners]) l();
}
