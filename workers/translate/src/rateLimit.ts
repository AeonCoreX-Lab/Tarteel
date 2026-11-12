/**
 * A fixed-window limiter kept in memory, per Worker instance. No KV reads or writes (the free plan allows 1,000 writes a day, and
 * a request counter would use them up). Instances are not shared, so this stops one caller hammering the Worker, not a crowd of
 * different callers; the day's AI allowance is guarded separately (see `busyUntil` in index.ts).
 */
export interface Limiter {
  /** True if this caller may go on; false if it has used up the window. */
  check(key: string, nowMs: number): boolean;
  /** Seconds until the current window ends. */
  retryAfter(nowMs: number): number;
}

export function createLimiter(options: { windowSeconds: number; max: number; maxKeys?: number }): Limiter {
  const { windowSeconds, max } = options;
  const maxKeys = options.maxKeys ?? 2000;
  const counts = new Map<string, { window: number; n: number }>();
  return {
    check(key, nowMs) {
      const window = Math.floor(nowMs / 1000 / windowSeconds);
      const cur = counts.get(key);
      if (!cur || cur.window !== window) {
        counts.delete(key);
        counts.set(key, { window, n: 1 });
        while (counts.size > maxKeys) {
          const oldest = counts.keys().next().value;
          if (oldest === undefined) break;
          counts.delete(oldest);
        }
        return true;
      }
      cur.n += 1;
      return cur.n <= max;
    },
    retryAfter(nowMs) {
      const into = (nowMs / 1000) % windowSeconds;
      return Math.max(1, Math.ceil(windowSeconds - into));
    },
  };
}
