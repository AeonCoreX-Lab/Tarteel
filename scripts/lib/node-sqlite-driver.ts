import { DatabaseSync } from "node:sqlite";
import type { RunResult, SqlDriver, SqlValue } from "@tarteel/storage";
import { createTransactionRunner } from "@tarteel/storage";

/**
 * SqlDriver backed by Node's built-in SQLite. Used by build scripts and tests.
 * `readOnly` opens an existing file without any possibility of changing it (validators use it).
 */
export function openNodeSqlite(path = ":memory:", opts: { readOnly?: boolean } = {}): SqlDriver {
  const db = new DatabaseSync(path, { readOnly: opts.readOnly === true });
  const exec = async (sql: string) => void db.exec(sql);
  return {
    exec,
    run: async (sql, params = []): Promise<RunResult> => {
      const r = db.prepare(sql).run(...(params as SqlValue[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T>(sql: string, params: readonly SqlValue[] = []) =>
      db.prepare(sql).all(...(params as SqlValue[])) as T[],
    get: async <T>(sql: string, params: readonly SqlValue[] = []) =>
      db.prepare(sql).get(...(params as SqlValue[])) as T | undefined,
    transaction: createTransactionRunner(exec),
    close: async () => void db.close(),
  };
}
