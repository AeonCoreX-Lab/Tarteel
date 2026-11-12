import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOUD_MAX_CHARS, TranslateError, createCloudTranslator, isHttpsUrl, translateText } from "../src/index.ts";
import type { TranslateHttp } from "../src/index.ts";

interface Seen {
  url: string;
  body?: string;
}

type Answer = { status: number; body: string } | Error;

function fakeHttp(answers: { config?: Answer; translate?: Answer }): { http: TranslateHttp; seen: Seen[] } {
  const seen: Seen[] = [];
  const reply = (a: Answer | undefined) => {
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve({ status: a?.status ?? 404, body: a?.body ?? "", retryAfterSeconds: null });
  };
  return {
    seen,
    http: {
      get: (url) => {
        seen.push({ url });
        return reply(answers.config ?? { status: 200, body: JSON.stringify({ translateUrl: "https://t.example/", enabled: true }) });
      },
      post: (url, body) => {
        seen.push({ url, body });
        return reply(answers.translate ?? { status: 200, body: JSON.stringify({ text: " Hello. ", model: "m", cached: false }) });
      },
    },
  };
}

const netError = (code: string): Error => Object.assign(new Error(code), { code });
const AR = "حدثنا أبو بكر";

test("isHttpsUrl accepts only https addresses", () => {
  assert.ok(isHttpsUrl("https://t.example/"));
  assert.ok(!isHttpsUrl("http://t.example/"));
  assert.ok(!isHttpsUrl(""));
  assert.ok(!isHttpsUrl("not a url"));
});

test("it is available only with an https address, has no packs, and keeps nothing", async () => {
  const f = fakeHttp({});
  const on = createCloudTranslator({ http: f.http, baseUrl: "https://t.example" });
  assert.equal(on.id, "online");
  assert.ok(await on.available());
  assert.deepEqual(await on.downloaded(), []);
  await on.prepare("ar", "en", { wifiOnly: true });
  await on.remove("en");
  assert.ok(!(await createCloudTranslator({ http: f.http, baseUrl: "" }).available()));
  assert.ok(!(await createCloudTranslator({ http: f.http, baseUrl: "http://t.example" }).available()));
  assert.equal(f.seen.length, 0, "no request until a translation is asked for");
});

test("translate asks /config once, then posts the passage, and returns the trimmed text", async () => {
  const f = fakeHttp({});
  const e = createCloudTranslator({ http: f.http, baseUrl: "https://t.example" });
  assert.equal(await e.translate(`  ${AR}  `, "ar", "en"), "Hello.");
  await e.translate(AR, "ar", "bn");
  assert.equal(f.seen.filter((s) => s.url.endsWith("/config")).length, 1);
  const posts = f.seen.filter((s) => s.body !== undefined);
  assert.equal(posts[0]?.url, "https://t.example/v1/translate");
  assert.deepEqual(JSON.parse(posts[0]?.body ?? "{}"), { text: AR, from: "ar", to: "en" });
  assert.equal((JSON.parse(posts[1]?.body ?? "{}") as { to: string }).to, "bn");
});

test("/config can move the Worker; an http address or a failed /config keeps the built-in one", async () => {
  const moved = fakeHttp({ config: { status: 200, body: JSON.stringify({ translateUrl: "https://new.example/x", enabled: true }) } });
  await createCloudTranslator({ http: moved.http, baseUrl: "https://t.example/" }).translate(AR, "ar", "en");
  assert.equal(moved.seen[1]?.url, "https://new.example/x/v1/translate");
  const insecure = fakeHttp({ config: { status: 200, body: JSON.stringify({ translateUrl: "http://evil.example/", enabled: true }) } });
  await createCloudTranslator({ http: insecure.http, baseUrl: "https://t.example/" }).translate(AR, "ar", "en");
  assert.equal(insecure.seen[1]?.url, "https://t.example/v1/translate");
  const broken = fakeHttp({ config: { status: 500, body: "oops" } });
  await createCloudTranslator({ http: broken.http, baseUrl: "https://t.example/" }).translate(AR, "ar", "en");
  assert.equal(broken.seen[1]?.url, "https://t.example/v1/translate");
});

test("a switched-off Worker is reported as unavailable, before anything is sent", async () => {
  const f = fakeHttp({ config: { status: 200, body: JSON.stringify({ enabled: false }) } });
  await assert.rejects(createCloudTranslator({ http: f.http, baseUrl: "https://t.example/" }).translate(AR, "ar", "en"), (e: unknown) => e instanceof TranslateError && e.code === "unavailable");
  assert.equal(f.seen.filter((s) => s.body !== undefined).length, 0);
});

test("errors become the codes a screen understands", async () => {
  const code = async (translate: Answer, config?: Error): Promise<string> => {
    const f = fakeHttp(config ? { config, translate } : { translate });
    try {
      await createCloudTranslator({ http: f.http, baseUrl: "https://t.example/" }).translate(AR, "ar", "en");
      return "none";
    } catch (e) {
      return e instanceof TranslateError ? e.code : "other";
    }
  };
  assert.equal(await code({ status: 429, body: "{}" }), "busy");
  assert.equal(await code({ status: 503, body: JSON.stringify({ error: { code: "busy" } }) }), "busy");
  assert.equal(await code({ status: 503, body: JSON.stringify({ error: { code: "disabled" } }) }), "unavailable");
  assert.equal(await code({ status: 502, body: "{}" }), "failed");
  assert.equal(await code({ status: 400, body: "{}" }), "failed");
  assert.equal(await code({ status: 200, body: "not json" }), "failed");
  assert.equal(await code({ status: 200, body: JSON.stringify({ text: "  " }) }), "failed");
  assert.equal(await code(netError("timeout")), "offline");
  assert.equal(await code(netError("network")), "offline");
  assert.equal(await code(netError("cancelled")), "cancelled");
  assert.equal(await code({ status: 200, body: "{}" }, netError("network")), "offline");
});

test("it refuses what the Worker would refuse, without a request", async () => {
  const f = fakeHttp({});
  const e = createCloudTranslator({ http: f.http, baseUrl: "https://t.example/" });
  await assert.rejects(e.translate(AR, "en", "bn"), (x: unknown) => x instanceof TranslateError && x.code === "unavailable");
  await assert.rejects(e.translate(AR, "ar", "ar"), (x: unknown) => x instanceof TranslateError && x.code === "unavailable");
  await assert.rejects(e.translate("ا".repeat(CLOUD_MAX_CHARS + 1), "ar", "en"), (x: unknown) => x instanceof TranslateError && x.code === "failed");
  assert.equal(await e.translate("   ", "ar", "en"), "");
  assert.equal(f.seen.length, 0);
});

test("translateText works through it and passes the stop signal on", async () => {
  const f = fakeHttp({});
  const e = createCloudTranslator({ http: f.http, baseUrl: "https://t.example/" });
  const r = await translateText(e, "أولا. ثانيا.", "ar", "en");
  assert.equal(r.engineId, "online");
  assert.equal(r.machine, true);
  assert.equal(r.text, "Hello.");
  let got: AbortSignal | undefined;
  const spy = { ...e, translate: async (_t: string, _f: "ar" | "en" | "bn", _to: "ar" | "en" | "bn", s?: AbortSignal) => ((got = s), "x") };
  const c = new AbortController();
  await translateText(spy, "نص", "ar", "en", { signal: c.signal });
  assert.equal(got, c.signal);
});
