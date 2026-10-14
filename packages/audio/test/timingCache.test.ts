import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimingCache } from "../src/timingCache.ts";
import type { TimingTable } from "../src/timing.ts";

const table: TimingTable = { "1:1": [[0, 1, 0, 100]] };

function setup(over: { loads?: Array<TimingTable | null | "throw"> } = {}) {
  let t = 1000;
  const calls: string[] = [];
  const queue = [...(over.loads ?? [table])];
  const cache = createTimingCache({
    now: () => t,
    publishes: (id) => id !== "silent",
    load: async (id) => {
      calls.push(id);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === "throw") throw new Error("boom");
      return next ?? null;
    },
  });
  return { cache, calls, advance: (ms: number) => { t += ms; } };
}

test("a reciter without timings is answered null with no load, forever", async () => {
  const { cache, calls } = setup();
  assert.equal(await cache.get("silent"), null);
  assert.equal(await cache.get("silent"), null);
  assert.deepEqual(calls, []);
});

test("a successful load is kept", async () => {
  const { cache, calls } = setup();
  assert.equal(await cache.get("a"), table);
  assert.equal(await cache.get("a"), table);
  assert.deepEqual(calls, ["a"]);
});

test("concurrent requests share one load", async () => {
  const { cache, calls } = setup();
  const [x, y] = await Promise.all([cache.get("a"), cache.get("a")]);
  assert.equal(x, table);
  assert.equal(y, table);
  assert.deepEqual(calls, ["a"]);
});

test("a failed load is believed briefly, then asked again", async () => {
  const { cache, calls, advance } = setup({ loads: [null, table] });
  assert.equal(await cache.get("a"), null);
  advance(10_000);
  assert.equal(await cache.get("a"), null); // still inside the failure window: no new load
  assert.equal(calls.length, 1);
  advance(21_000);
  assert.equal(await cache.get("a"), table); // window over: retried, and it works now
  assert.equal(calls.length, 2);
});

test("repeated hits do not extend a believed failure", async () => {
  const { cache, calls, advance } = setup({ loads: [null, table] });
  await cache.get("a");
  for (let i = 0; i < 5; i++) {
    advance(8_000);
    await cache.get("a"); // 40 s of polling in all
  }
  assert.equal(await cache.get("a"), table);
  assert.equal(calls.length, 2);
});

test("a load that throws is a failure, not a crash", async () => {
  const { cache } = setup({ loads: ["throw"] });
  assert.equal(await cache.get("a"), null);
});

test("only the most recent reciters stay in memory", async () => {
  const { cache, calls } = setup();
  await cache.get("a");
  await cache.get("b");
  await cache.get("c"); // evicts a
  await cache.get("b"); // still there
  assert.deepEqual(calls, ["a", "b", "c"]);
  await cache.get("a"); // loaded again
  assert.deepEqual(calls, ["a", "b", "c", "a"]);
});
