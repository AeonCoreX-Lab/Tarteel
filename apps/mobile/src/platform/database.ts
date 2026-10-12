import * as SQLite from "expo-sqlite";
import { CONTENT_MIGRATIONS, USER_MIGRATIONS, createRepositories, migrate } from "@tarteel/database";
import type { Repositories } from "@tarteel/database";
import type { SqlDriver } from "@tarteel/storage";
import { openExpoDb } from "./expo-sqlite-driver";

// Produced by `npm run build:db` (CI does this before every app build).
/* eslint-disable @typescript-eslint/no-require-imports */
const bundledVersion = require("../../assets/db/content-version.json") as { contentVersion: string };
const bundledDbAsset = require("../../assets/db/quran.db") as number;

const CONTENT_DB = "tarteel-content.db"; // read-only, replaced on content updates
const USER_DB = "tarteel-user.db"; //       private, migrated, NEVER replaced

async function installedContentVersion(db: SqlDriver): Promise<string | null> {
  try {
    const row = await db.get<{ value: string }>("SELECT value FROM content_meta WHERE key = 'content_version'");
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function openContent(): Promise<SqlDriver> {
  let db = await openExpoDb(CONTENT_DB).catch(() => null);
  if (db && (await installedContentVersion(db)) === bundledVersion.contentVersion) return db;
  // First launch, or the app shipped a newer content database: replace ONLY the content file.
  await db?.close();
  await SQLite.importDatabaseFromAssetAsync(CONTENT_DB, { assetId: bundledDbAsset, forceOverwrite: true });
  db = await openExpoDb(CONTENT_DB);
  if ((await installedContentVersion(db)) !== bundledVersion.contentVersion)
    throw new Error("Content database failed its integrity check after install.");
  return db;
}

let ready: Promise<Repositories> | null = null;

export function initDatabases(): Promise<Repositories> {
  ready ??= (async () => {
    const content = await openContent();
    const user = await openExpoDb(USER_DB);
    await user.exec("PRAGMA journal_mode = WAL;");
    await migrate(user, USER_MIGRATIONS);
    // Content schema is created at build time; verify the app understands it.
    const schema = await content.get<{ value: string }>("SELECT value FROM content_meta WHERE key = 'schema_version'");
    if (Number(schema?.value) > CONTENT_MIGRATIONS.length) throw new Error("Content database is newer than this app supports.");
    return createRepositories(content, user);
  })();
  return ready;
}
