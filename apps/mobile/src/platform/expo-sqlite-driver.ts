import * as SQLite from "expo-sqlite";
import { createTransactionRunner } from "@tarteel/storage";
import type { SqlDriver, SqlValue } from "@tarteel/storage";

type Bind = SQLite.SQLiteBindValue[];

export function wrapExpoDb(db: SQLite.SQLiteDatabase): SqlDriver {
  const exec = (sql: string) => db.execAsync(sql);
  return {
    exec,
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params as SqlValue[] as Bind);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(sql, params as SqlValue[] as Bind),
    get: async <T>(sql: string, params: readonly SqlValue[] = []) =>
      (await db.getFirstAsync<T>(sql, params as SqlValue[] as Bind)) ?? undefined,
    transaction: createTransactionRunner(exec),
    close: () => db.closeAsync(),
  };
}

export async function openExpoDb(name: string): Promise<SqlDriver> {
  return wrapExpoDb(await SQLite.openDatabaseAsync(name));
}
