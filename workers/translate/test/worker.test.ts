import { test } from "node:test";
import assert from "node:assert/strict";
import { AiError, extractText } from "../src/ai.ts";
import { cacheKey, TTL_SECONDS } from "../src/cache.ts";
import type { Ctx, Env } from "../src/env.ts";
import { createWorker } from "../src/index.ts";
import { buildMessages, systemPrompt } from "../src/prompt.ts";
import { createLimiter } from "../src/rateLimit.ts";

const AR = "حدثنا أبو بكر أحمد بن محمد عن الإمام أحمد بن حنبل رحمه الله";
const GOOD = "Narrated to us Abu Bakr Ahmad ibn Muhammad, from Imam Ahmad ibn Hanbal, may Allah have mercy on him.";

interface Fakes {
  env: Env;
  store: Map<string, { value: string; ttl: number | undefined }>;
  calls: { n: number; last: unknown };
  waits: Promise<unknown>[];
  ctx: Ctx;
}

function fakes(over: { ai?: (model: string, input: unknown) => Promise<unknown>; putFails?: boolean; vars?: Partial<Env> } = {}): Fakes {
  const store = new Map<string, { value: string; ttl: number | undefined }>();
  const calls = { n: 0, last: undefined as unknown };
  const waits: Promise<unknown>[] = [];
  const env: Env = {
    TRANSLATE_CACHE: {
      get: async (k) => store.get(k)?.value ?? null,
      put: async (k, v, o) => {
        if (over.putFails) throw new Error("KV put() limit exceeded for the day.");
        store.set(k, { value: v, ttl: o?.expirationTtl });
      },
    },
    AI: {
      run: async (model, input) => {
        calls.n += 1;
        calls.last = { model, input };
        return over.ai ? over.ai(model, input) : { response: GOOD };
      },
    },
    ...over.vars,
  };
  return { env, store, calls, waits, ctx: { waitUntil: (p) => void waits.push(p) } };
}

const post = (o: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request =>
  new Request("https://t.example/v1/translate", { method: "POST", body: JSON.stringify({ text: AR, from: "ar", to: "en", ...o }), headers: { "CF-Connecting-IP": "1.2.3.4", ...headers } });

async function call(w: ReturnType<typeof createWorker>, f: Fakes, req: Request): Promise<{ status: number; body: Record<string, unknown>; res: Response }> {
  const res = await w.fetch(req, f.env, f.ctx);
  await Promise.all(f.waits);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

test("a miss asks the AI once, stores the answer for 90 days, and the next ask is a hit", async () => {
  const f = fakes();
  const w = createWorker();
  const a = await call(w, f, post());
  assert.equal(a.status, 200);
  assert.equal(a.body["text"], GOOD);
  assert.equal(a.body["cached"], false);
  assert.equal(a.res.headers.get("X-Cache"), "MISS");
  assert.equal(f.calls.n, 1);
  assert.equal(f.store.size, 1);
  assert.equal([...f.store.values()][0]?.ttl, TTL_SECONDS);
  const b = await call(w, f, post());
  assert.equal(b.body["cached"], true);
  assert.equal(b.res.headers.get("X-Cache"), "HIT");
  assert.equal(f.calls.n, 1);
});

test("the same sentence spelled with other spacing shares one cache entry, another language does not", async () => {
  const f = fakes();
  const w = createWorker();
  await call(w, f, post());
  await call(w, f, post({ text: `  ${AR}   ` }));
  assert.equal(f.calls.n, 1);
  await call(w, f, post({ to: "bn" }));
  assert.equal(f.calls.n, 2);
});

test("the AI is told to transliterate names and gets the passage as the user message", async () => {
  const f = fakes();
  await call(createWorker(), f, post());
  const input = (f.calls.last as { model: string; input: { messages: Array<{ role: string; content: string }>; temperature: number } }).input;
  assert.equal(input.temperature, 0);
  assert.equal(input.messages[1]?.role, "user");
  assert.equal(input.messages[1]?.content, AR);
  assert.match(input.messages[0]?.content ?? "", /Ibn Battah/);
  assert.match(systemPrompt("bn"), /Bengali/);
  assert.equal(buildMessages("x", "en").length, 2);
});

test("a poor answer is refused and not cached", async () => {
  const f = fakes({ ai: async () => ({ response: "ok" }) });
  const r = await call(createWorker(), f, post());
  assert.equal(r.status, 502);
  assert.deepEqual((r.body["error"] as { code: string }).code, "bad-output");
  assert.equal(f.store.size, 0);
});

test("when the daily AI allowance is used up, cached answers still work and new ones wait out a cooldown", async () => {
  let t = 1_000_000;
  const f = fakes();
  const w = createWorker({ now: () => t, busyCooldownSeconds: 600 });
  await call(w, f, post()); // cached
  f.env.AI.run = async () => {
    throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
  };
  const busy = await call(w, f, post({ text: AR + " وسلم" }));
  assert.equal(busy.status, 503);
  assert.equal((busy.body["error"] as { code: string }).code, "busy");
  let ran = 0;
  f.env.AI.run = async () => {
    ran += 1;
    return { response: GOOD };
  };
  t += 60_000;
  const still = await call(w, f, post({ text: AR + " وسلم" }));
  assert.equal(still.status, 503);
  assert.equal(ran, 0, "no AI call during the cooldown");
  assert.equal((await call(w, f, post())).body["cached"], true, "a cached answer is still served");
  t += 600_000;
  assert.equal((await call(w, f, post({ text: AR + " وسلم" }))).status, 200);
  assert.equal(ran, 1);
});

test("another AI failure is a 502 and is not treated as the allowance running out", async () => {
  const f = fakes({
    ai: async () => {
      throw new Error("model exploded");
    },
  });
  const w = createWorker();
  const a = await call(w, f, post());
  assert.equal(a.status, 502);
  f.env.AI.run = async () => ({ response: GOOD });
  assert.equal((await call(w, f, post())).status, 200);
});

test("a KV write that fails (daily limit) does not stop the person getting the translation", async () => {
  const f = fakes({ putFails: true });
  const r = await call(createWorker(), f, post());
  assert.equal(r.status, 200);
  assert.equal(r.body["text"], GOOD);
});

test("callers are limited per address: requests, and fresh translations separately", async () => {
  const f = fakes();
  const w = createWorker({ requestsPerMinute: 3, freshPerMinute: 2 });
  assert.equal((await call(w, f, post({ text: AR + " ١" }))).status, 200);
  assert.equal((await call(w, f, post({ text: AR + " ٢" }))).status, 200);
  const third = await call(w, f, post({ text: AR + " ٣" }));
  assert.equal(third.status, 429);
  assert.ok(Number(third.res.headers.get("Retry-After")) >= 1);
  const other = await call(w, f, post({ text: AR + " ٤" }, { "CF-Connecting-IP": "5.6.7.8" }));
  assert.equal(other.status, 200);
  const hits = createWorker({ requestsPerMinute: 10, freshPerMinute: 1 });
  const g = fakes();
  assert.equal((await call(hits, g, post())).status, 200);
  assert.equal((await call(hits, g, post())).status, 200, "a hit costs no fresh allowance");
});

test("bad requests are refused before anything is asked of the AI", async () => {
  const f = fakes();
  const w = createWorker();
  assert.equal((await call(w, f, post({ to: "fr" }))).status, 400);
  assert.equal((await call(w, f, post({ text: "hello world" }))).status, 400);
  assert.equal((await call(w, f, post({ text: "ا".repeat(601) }))).status, 413);
  assert.equal((await call(w, f, new Request("https://t.example/v1/translate", { method: "POST", body: "x".repeat(5000) }))).status, 413);
  assert.equal((await call(w, f, new Request("https://t.example/v1/translate"))).status, 405);
  assert.equal((await call(w, f, new Request("https://t.example/nope"))).status, 404);
  assert.equal(f.calls.n, 0);
});

test("TRANSLATE_ENABLED=false switches it off; /config and /health answer", async () => {
  const off = fakes({ vars: { TRANSLATE_ENABLED: "false" } });
  const w = createWorker();
  assert.equal((await call(w, off, post())).status, 503);
  const cfg = await call(w, off, new Request("https://t.example/config"));
  assert.equal(cfg.body["enabled"], false);
  assert.equal(cfg.body["translateUrl"], "https://t.example/");
  const moved = fakes({ vars: { CURRENT_TRANSLATE_URL: "https://translate.example.org/" } });
  assert.equal((await call(w, moved, new Request("https://t.example/config"))).body["translateUrl"], "https://translate.example.org/");
  assert.equal((await call(w, moved, new Request("https://t.example/health"))).body["ok"], true);
});

test("the cache key holds no readable text, stays short for long text, and changes with model, prompt version and language", async () => {
  const base: Env = fakes().env;
  const k = await cacheKey(base, "en", AR);
  assert.ok(!k.includes("حدثنا"));
  assert.ok(k.length < 200);
  assert.equal(await cacheKey(base, "en", AR), k);
  assert.notEqual(await cacheKey(base, "bn", AR), k);
  assert.notEqual(await cacheKey({ ...base, PROMPT_VERSION: "p2" }, "en", AR), k);
  assert.notEqual(await cacheKey({ ...base, TRANSLATE_MODEL: "@cf/other/model" }, "en", AR), k);
  assert.ok((await cacheKey(base, "en", "ا".repeat(600))).length < 200);
});

test("extractText reads both Workers AI answer shapes", () => {
  assert.equal(extractText({ response: "a" }), "a");
  assert.equal(extractText({ choices: [{ message: { content: "b" } }] }), "b");
  assert.equal(extractText({ choices: [{ message: { content: [{ text: "c" }, { text: "d" }] } }] }), "cd");
  assert.equal(extractText("e"), "e");
  assert.equal(extractText({}), null);
  assert.equal(extractText(null), null);
  assert.ok(new AiError("busy", "x") instanceof Error);
});

test("the limiter counts per key per window and forgets old keys", () => {
  const l = createLimiter({ windowSeconds: 60, max: 2, maxKeys: 3 });
  assert.ok(l.check("a", 0));
  assert.ok(l.check("a", 1000));
  assert.ok(!l.check("a", 2000));
  assert.ok(l.check("a", 61_000), "a new window starts again");
  for (const k of ["b", "c", "d", "e"]) l.check(k, 0);
  assert.ok(l.check("b", 0), "an evicted key starts fresh");
  assert.equal(l.retryAfter(30_000), 30);
});
