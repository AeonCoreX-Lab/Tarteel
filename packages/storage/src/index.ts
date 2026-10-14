/**
 * Storage abstraction. The app layer depends ONLY on these interfaces.
 *
 *   PreferencesStore  -> MMKV (native) / localStorage (web)    small, sync, fast
 *   SqlDriver         -> expo-sqlite (native) / SQLite WASM    structured data
 *   FileStore         -> device filesystem / OPFS              large binaries
 *
 * Platform adapters live in apps/* so this package has zero native dependencies.
 */

// ------------------------------------------------------------------ SQL

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export type SqlValue = string | number | null | Uint8Array;

export interface SqlDriver {
  /** Execute one or more statements without parameters (DDL, PRAGMA, scripts). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  /** Runs fn inside a transaction; rolls back if fn throws. Nested calls use savepoints. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Shared transaction helper so every adapter behaves identically.
 * Adapters supply a depth counter and raw exec.
 */
export function createTransactionRunner(exec: (sql: string) => Promise<void>) {
  let depth = 0;
  return async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const name = `sp_${depth}`;
    await exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${name}`);
    depth++;
    try {
      const result = await fn();
      depth--;
      await exec(depth === 0 ? "COMMIT" : `RELEASE ${name}`);
      return result;
    } catch (e) {
      depth--;
      await exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  };
}

// ---------------------------------------------------------- Key-value / prefs

/** Raw string key-value store (MMKV, localStorage, memory). */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export function createMemoryKeyValueStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getString: (k) => m.get(k),
    setString: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

/** Minimal shape of window.localStorage so this package needs no DOM typings. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export function createWebKeyValueStore(storage: StorageLike, namespace = "tarteel:"): KeyValueStore {
  return {
    getString: (k) => storage.getItem(namespace + k) ?? undefined,
    setString: (k, v) => storage.setItem(namespace + k, v),
    remove: (k) => storage.removeItem(namespace + k),
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(namespace)) out.push(k.slice(namespace.length));
      }
      return out;
    },
  };
}

/**
 * Typed, validated preferences on top of any KeyValueStore.
 * Corrupt or wrong-typed stored values fall back to the default instead of crashing.
 */
export interface PreferencesStore<S extends object> {
  get<K extends keyof S>(key: K): S[K];
  set<K extends keyof S>(key: K, value: S[K]): void;
  reset<K extends keyof S>(key: K): void;
  getAll(): S;
}

export function createPreferencesStore<S extends object>(
  kv: KeyValueStore,
  defaults: S,
  namespace = "pref.",
): PreferencesStore<S> {
  const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const get = <K extends keyof S>(key: K): S[K] => {
    const raw = kv.getString(namespace + String(key));
    const fallback = defaults[key];
    if (raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw) as S[K];
      const expected = typeOf(fallback);
      // null defaults accept any stored value; otherwise require matching type (or null).
      if (expected !== "null" && parsed !== null && typeOf(parsed) !== expected) return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  };
  return {
    get,
    set: (key, value) => kv.setString(namespace + String(key), JSON.stringify(value)),
    reset: (key) => kv.remove(namespace + String(key)),
    getAll: () => {
      const out = {} as S;
      for (const k of Object.keys(defaults) as (keyof S)[]) out[k] = get(k);
      return out;
    },
  };
}

// ---------------------------------------------------------------- Files

export type FileArea = "audio" | "fonts" | "packages" | "images" | "cache";

export interface FileStore {
  /** Resolves a relative path inside an area to a platform path/URI. */
  resolve(area: FileArea, relativePath: string): string;
  exists(area: FileArea, relativePath: string): Promise<boolean>;
  read(area: FileArea, relativePath: string): Promise<Uint8Array>;
  write(area: FileArea, relativePath: string, data: Uint8Array): Promise<void>;
  remove(area: FileArea, relativePath: string): Promise<void>;
  list(area: FileArea, relativeDir?: string): Promise<string[]>;
  size(area: FileArea, relativePath: string): Promise<number>;
  /**
   * Renames a file inside one area, replacing the destination. Downloads are written to a `.part` file and moved
   * into place only after they have been verified, so a killed app never leaves a truncated file under its real name.
   */
  move(area: FileArea, fromRelativePath: string, toRelativePath: string): Promise<void>;
  /** Names and sizes of the files directly inside a directory, in ONE call (not one `size()` per file). */
  listWithSize(area: FileArea, relativeDir?: string): Promise<FileEntry[]>;
}

export interface FileEntry {
  /** File name only, without the directory. */
  name: string;
  size: number;
}

/** Rejects path traversal and absolute paths. Adapters MUST call this. */
export function assertSafeRelativePath(p: string): void {
  if (p.startsWith("/") || p.includes("\\") || p.split("/").some((s) => s === ".." || s === "."))
    throw new Error(`Unsafe path: ${p}`);
}

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, Uint8Array>();
  const k = (a: FileArea, p: string) => {
    assertSafeRelativePath(p);
    return `${a}/${p}`;
  };
  return {
    resolve: (a, p) => k(a, p),
    exists: async (a, p) => files.has(k(a, p)),
    read: async (a, p) => {
      const v = files.get(k(a, p));
      if (!v) throw new Error(`Not found: ${k(a, p)}`);
      return v;
    },
    write: async (a, p, d) => void files.set(k(a, p), d),
    remove: async (a, p) => void files.delete(k(a, p)),
    list: async (a, dir = "") => {
      const prefix = `${a}/${dir ? dir + "/" : ""}`;
      return [...files.keys()].filter((x) => x.startsWith(prefix)).map((x) => x.slice(prefix.length));
    },
    size: async (a, p) => (files.get(k(a, p)) ?? new Uint8Array()).length,
    move: async (a, from, to) => {
      const src = k(a, from);
      const dst = k(a, to);
      const v = files.get(src);
      if (!v) throw new Error(`Not found: ${src}`);
      files.set(dst, v);
      files.delete(src);
    },
    listWithSize: async (a, dir = "") => {
      assertSafeRelativePath(dir || "x");
      const prefix = `${a}/${dir ? dir + "/" : ""}`;
      const out: FileEntry[] = [];
      for (const [key, v] of files) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (rest.includes("/")) continue; // direct children only
        out.push({ name: rest, size: v.length });
      }
      return out;
    },
  };
}
