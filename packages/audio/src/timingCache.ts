import type { TimingTable } from "./timing.ts";

export interface TimingCacheOptions {
  /** Loads one reciter's timings. Resolves null on any failure; must not throw. */
  load: (reciterId: string) => Promise<TimingTable | null>;
  /** Whether a reciter publishes timings at all. One that does not is answered null for good, with no load. */
  publishes: (reciterId: string) => boolean;
  now?: () => number;
  /** How long a FAILED load is believed. Default 30 s. */
  failureTtlMs?: number;
  /** Reciters kept parsed in memory. Default 2. */
  maxEntries?: number;
}

export interface TimingCache {
  get(reciterId: string): Promise<TimingTable | null>;
  clear(): void;
}

/**
 * Parsed timing tables, kept in memory for the reciter being heard.
 *
 * Two rules come from how this goes wrong. A failed load (a download racing the same connection, a brief outage) is
 * remembered only briefly: caching it for the life of the process would leave the words dark however good the
 * network got. And a table is megabytes once parsed, so only a couple are kept, oldest out.
 */
export function createTimingCache(opts: TimingCacheOptions): TimingCache {
  const now = opts.now ?? Date.now;
  const failureTtl = opts.failureTtlMs ?? 30_000;
  const max = opts.maxEntries ?? 2;
  const entries = new Map<string, { table: TimingTable | null; expires: number }>();
  const inFlight = new Map<string, Promise<TimingTable | null>>();

  const store = (id: string, table: TimingTable | null, expires: number) => {
    entries.delete(id); // re-insert: a hit counts as a use, and Map order is the LRU order
    entries.set(id, { table, expires });
    while (entries.size > max) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  };

  const remember = (id: string, table: TimingTable | null) => store(id, table, table ? Infinity : now() + failureTtl);

  return {
    async get(id) {
      if (!opts.publishes(id)) return null;
      const hit = entries.get(id);
      if (hit && now() < hit.expires) {
        store(id, hit.table, hit.expires); // a use, but a believed failure keeps its original expiry
        return hit.table;
      }
      const pending = inFlight.get(id);
      if (pending) return pending;
      const p = opts.load(id).then(
        (table) => {
          remember(id, table);
          inFlight.delete(id);
          return table;
        },
        () => {
          remember(id, null);
          inFlight.delete(id);
          return null;
        },
      );
      inFlight.set(id, p);
      return p;
    },
    clear() {
      entries.clear();
      inFlight.clear();
    },
  };
}
