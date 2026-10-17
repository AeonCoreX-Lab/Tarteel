import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryFileStore, createMemoryKeyValueStore, createPreferencesStore,
  createGuardedDriver, createTransactionRunner, createWebKeyValueStore, assertSafeRelativePath,
} from "../src/index.ts";

const defaults = { theme: "system" as string, size: 24, last: null as { s: number } | null, flag: false };

test("preferences: defaults, set/get, reset", () => {
  const p = createPreferencesStore(createMemoryKeyValueStore(), defaults);
  assert.equal(p.get("theme"), "system");
  p.set("theme", "amoled");
  p.set("last", { s: 2 });
  assert.equal(p.get("theme"), "amoled");
  assert.deepEqual(p.get("last"), { s: 2 });
  p.reset("theme");
  assert.equal(p.get("theme"), "system");
  assert.equal(p.getAll().size, 24);
});

test("preferences: corrupt / wrong-typed values fall back to defaults", () => {
  const kv = createMemoryKeyValueStore();
  kv.setString("pref.size", "not json{");
  kv.setString("pref.theme", "42");
  const p = createPreferencesStore(kv, defaults);
  assert.equal(p.get("size"), 24);
  assert.equal(p.get("theme"), "system");
});

test("web key-value store namespaces keys", () => {
  const data = new Map<string, string>();
  const ls = {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k), get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
  data.set("other", "x");
  const kv = createWebKeyValueStore(ls);
  kv.setString("a", "1");
  assert.deepEqual(kv.keys(), ["a"]);
  assert.equal(data.get("tarteel:a"), "1");
});

test("file store rejects traversal", () => {
  for (const bad of ["../x", "/abs", "a/../b", "a\\b", "./x"]) assert.throws(() => assertSafeRelativePath(bad));
  assert.doesNotThrow(() => assertSafeRelativePath("reciter/001.mp3"));
});

test("memory file store round trip", async () => {
  const fs = createMemoryFileStore();
  await fs.write("audio", "r/1.mp3", new Uint8Array([1, 2, 3]));
  assert.equal(await fs.exists("audio", "r/1.mp3"), true);
  assert.equal(await fs.size("audio", "r/1.mp3"), 3);
  assert.deepEqual(await fs.list("audio", "r"), ["1.mp3"]);
  await fs.remove("audio", "r/1.mp3");
  assert.equal(await fs.exists("audio", "r/1.mp3"), false);
});

test("memory file store move replaces the destination and listWithSize reads direct children only", async () => {
  const fs = createMemoryFileStore();
  await fs.write("audio", "r/1.mp3.part", new Uint8Array([1, 2, 3]));
  await fs.write("audio", "r/1.mp3", new Uint8Array([9]));
  await fs.write("audio", "r/sub/2.mp3", new Uint8Array([7, 7]));
  await fs.move("audio", "r/1.mp3.part", "r/1.mp3");
  assert.equal(await fs.exists("audio", "r/1.mp3.part"), false);
  assert.equal(await fs.size("audio", "r/1.mp3"), 3);
  assert.deepEqual(await fs.listWithSize("audio", "r"), [{ name: "1.mp3", size: 3 }]);
  await assert.rejects(fs.move("audio", "r/missing", "r/x"));
  await assert.rejects(fs.move("audio", "r/1.mp3", "../escape"));
});

test("transaction runner nests with savepoints and rolls back", async () => {
  const log: string[] = [];
  const tx = createTransactionRunner(async (s) => void log.push(s));
  await tx(async () => { await tx(async () => {}); });
  assert.deepEqual(log, ["BEGIN IMMEDIATE", "SAVEPOINT sp_1", "RELEASE sp_1", "COMMIT"]);
  log.length = 0;
  await assert.rejects(tx(async () => { throw new Error("boom"); }));
  assert.deepEqual(log, ["BEGIN IMMEDIATE", "ROLLBACK"]);
});

// ---- guarded driver: closing a native database must never overlap a running query or happen twice ----

/** A fake native database that records what happened and lets a test hold an operation open. */
function fakeNative() {
  const log: string[] = [];
  let release: (() => void) | null = null;
  let closes = 0;
  const raw = {
    exec: async (sql: string) => void log.push(`exec ${sql}`),
    run: async () => ({ changes: 1, lastInsertRowId: 1 }),
    all: async <T>(sql: string) => {
      log.push(`all ${sql} start`);
      if (sql === "SLOW") await new Promise<void>((r) => (release = r));
      log.push(`all ${sql} end`);
      return [] as T[];
    },
    get: async <T>() => undefined as T | undefined,
    close: async () => {
      closes++;
      log.push("native close");
    },
  };
  return { raw, log, finishSlow: () => release?.(), closes: () => closes };
}

test("guarded driver: close waits for a running query, then closes once", async () => {
  const n = fakeNative();
  const db = createGuardedDriver(n.raw);
  const slow = db.all("SLOW");
  await Promise.resolve();
  const closed = db.close();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(n.closes(), 0, "the native close must not run while a query is in flight");
  n.finishSlow();
  await slow;
  await closed;
  assert.deepEqual(n.log, ["all SLOW start", "all SLOW end", "native close"]);
});

test("guarded driver: close is idempotent and operations after close are refused, not forwarded", async () => {
  const n = fakeNative();
  const db = createGuardedDriver(n.raw);
  await db.exec("A");
  await Promise.all([db.close(), db.close()]);
  await db.close();
  assert.equal(n.closes(), 1);
  await assert.rejects(db.exec("B"), /closed/);
  await assert.rejects(db.all("C"), /closed/);
  await assert.rejects(db.transaction(async () => 1), /closed/);
  assert.deepEqual(n.log, ["exec A", "native close"]);
});

test("guarded driver: a close that fails is reported to every caller, and is not retried", async () => {
  let closes = 0;
  const db = createGuardedDriver({
    exec: async () => undefined, run: async () => ({ changes: 0, lastInsertRowId: 0 }), all: async () => [], get: async () => undefined,
    close: async () => { closes++; throw new Error("native close failed"); },
  });
  const a = db.close();
  const b = db.close();
  await assert.rejects(a, /native close failed/);
  await assert.rejects(b, /native close failed/);
  assert.equal(closes, 1);
});

test("guarded driver: operations run normally, transactions commit and roll back through the guard", async () => {
  const n = fakeNative();
  const db = createGuardedDriver(n.raw);
  assert.equal(await db.transaction(async () => "ok"), "ok");
  await assert.rejects(db.transaction(async () => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(n.log, ["exec BEGIN IMMEDIATE", "exec COMMIT", "exec BEGIN IMMEDIATE", "exec ROLLBACK"]);
  await db.close();
});
