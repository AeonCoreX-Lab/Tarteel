import * as SQLite from "expo-sqlite";
import { createGuardedDriver } from "@tarteel/storage";
import type { SqlDriver, SqlValue } from "@tarteel/storage";

type Bind = SQLite.SQLiteBindValue[];

/**
 * Open options for EVERY database this app opens.
 *
 * `finalizeUnusedStatementsBeforeClosing: false` works around a native crash in expo-sqlite (15.2.0 up to at least 57.0.4,
 * https://github.com/expo/expo/issues/38168): on close, expo-sqlite walks `sqlite3_next_stmt` and finalizes every statement,
 * which also finalizes statements that belong to virtual tables (FTS5, R-tree). SQLite then finalizes them again inside
 * `sqlite3_close`, a double free, and Android aborts the process (Scudo "invalid chunk state when deallocating", SIGABRT in
 * libexpo-sqlite.so). A JavaScript try/catch cannot catch that.
 *
 * It is safe here because this adapter never keeps a prepared statement: runAsync / getAllAsync / getFirstAsync / execAsync
 * prepare, run and finalize their own statement before they return. Do not use `prepareAsync` without finalizing it: with this
 * option off, an unfinalized statement makes the close fail instead of being cleaned up.
 *
 * The option is typed but marked @hidden in expo-sqlite, so it can change between SDKs: re-check it when upgrading Expo.
 */
export const OPEN_OPTIONS: SQLite.SQLiteOpenOptions & { finalizeUnusedStatementsBeforeClosing: boolean } = { finalizeUnusedStatementsBeforeClosing: false };

export function wrapExpoDb(db: SQLite.SQLiteDatabase): SqlDriver {
  // The guard makes close() wait for running queries, run once, and refuse later use (see createGuardedDriver).
  return createGuardedDriver({
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params as SqlValue[] as Bind);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(sql, params as SqlValue[] as Bind),
    get: async <T>(sql: string, params: readonly SqlValue[] = []) =>
      (await db.getFirstAsync<T>(sql, params as SqlValue[] as Bind)) ?? undefined,
    close: () => db.closeAsync(),
  });
}

export async function openExpoDb(name: string): Promise<SqlDriver> {
  return wrapExpoDb(await SQLite.openDatabaseAsync(name, OPEN_OPTIONS));
}

/**
 * Opens a database file that is NOT in the default SQLite directory (knowledge packs live in the app's documents
 * directory). Takes the `file://` address a FileStore gives out and splits it into the directory and file name that
 * expo-sqlite wants.
 */
export async function openExpoDbAtUri(fileUri: string): Promise<SqlDriver> {
  const path = decodeURI(fileUri.replace(/^file:\/\//, ""));
  const slash = path.lastIndexOf("/");
  return wrapExpoDb(await SQLite.openDatabaseAsync(path.slice(slash + 1), OPEN_OPTIONS, path.slice(0, slash)));
}
