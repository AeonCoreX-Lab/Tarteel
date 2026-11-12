// ═══════════════════════════════════════════════════════════════════
//  Tarteel translation Worker
//  ──────────────────────────
//  An optional online engine for the app's "translate this passage" button. The app sends one short Arabic passage; the Worker
//  answers from a shared cache (Workers KV, 90 days) or, on a miss, asks a Gemma model on Workers AI and stores the answer. So a
//  passage that many people open is translated once, not once each.
//
//  What it never does: it has no accounts, keeps no user id, and does not write the text or the caller's address to any log.
//  The only thing kept is the cache entry: a hash of the passage and its translation, for up to 90 days.
//
//  Routes
//    POST /v1/translate   { "text": "...", "from": "ar", "to": "en" | "bn" }  ->  { "text", "model", "cached" }
//    GET  /config         { "translateUrl", "enabled", "version", "maxChars" }   (lets the address move without a new app)
//    GET  /health         { "ok": true }
// ═══════════════════════════════════════════════════════════════════

import { AiError, modelOf, translateWithAi } from "./ai.ts";
import { cacheKey, readCached, writeCached } from "./cache.ts";
import type { Ctx, Env } from "./env.ts";
import { createLimiter } from "./rateLimit.ts";
import { checkOutput, MAX_BODY_BYTES, MAX_CHARS, parseRequest } from "./validate.ts";

type ErrorCode = "bad-request" | "too-long" | "not-arabic" | "rate-limited" | "busy" | "disabled" | "bad-output" | "failed" | "not-found" | "method-not-allowed";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function fail(code: ErrorCode, message: string, status: number, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, headers);
}

export interface WorkerOptions {
  now?: () => number;
  /** Requests a caller may make a minute (hits and misses). */
  requestsPerMinute?: number;
  /** Fresh translations (cache misses, which cost AI allowance) a caller may make a minute. */
  freshPerMinute?: number;
  /** How long to stop calling the AI after its daily allowance has run out. Cached answers are still served. */
  busyCooldownSeconds?: number;
}

export function createWorker(options: WorkerOptions = {}): { fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> } {
  const now = options.now ?? Date.now;
  const requests = createLimiter({ windowSeconds: 60, max: options.requestsPerMinute ?? 60 });
  const fresh = createLimiter({ windowSeconds: 60, max: options.freshPerMinute ?? 20 });
  const cooldown = options.busyCooldownSeconds ?? 600;
  let busyUntil = 0;

  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);

      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });

      if (url.pathname === "/config" && request.method === "GET") {
        return json({ translateUrl: env.CURRENT_TRANSLATE_URL?.trim() || `${url.origin}/`, enabled: env.TRANSLATE_ENABLED !== "false", version: 1, maxChars: MAX_CHARS });
      }

      if (url.pathname !== "/v1/translate") return fail("not-found", "not found", 404);
      if (request.method !== "POST") return fail("method-not-allowed", "use POST", 405, { Allow: "POST" });
      if (env.TRANSLATE_ENABLED === "false") return fail("disabled", "translation is switched off", 503);

      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const t = now();
      if (!requests.check(ip, t)) return fail("rate-limited", "too many requests", 429, { "Retry-After": String(requests.retryAfter(t)) });

      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return fail("too-long", "request is too large", 413);
      const parsed = parseRequest(raw);
      if (!parsed.ok) return fail(parsed.code, parsed.message, parsed.code === "too-long" ? 413 : 400);

      const key = await cacheKey(env, parsed.to, parsed.text);
      const hit = await readCached(env, key);
      if (hit) {
        console.log(JSON.stringify({ ev: "translate", cache: "hit", to: parsed.to, chars: parsed.text.length }));
        return json({ text: hit.text, model: hit.model, cached: true }, 200, { "X-Cache": "HIT" });
      }

      if (t < busyUntil) return fail("busy", "the translator has reached its daily limit, try later", 503, { "Retry-After": String(Math.ceil((busyUntil - t) / 1000)) });
      if (!fresh.check(ip, t)) return fail("rate-limited", "too many new translations", 429, { "Retry-After": String(fresh.retryAfter(t)) });

      let out: string;
      try {
        out = await translateWithAi(env, parsed.text, parsed.to);
      } catch (e) {
        if (e instanceof AiError && e.kind === "busy") {
          busyUntil = t + cooldown * 1000;
          console.warn(JSON.stringify({ ev: "translate", cache: "miss", result: "busy" }));
          return fail("busy", "the translator has reached its daily limit, try later", 503, { "Retry-After": String(cooldown) });
        }
        console.warn(JSON.stringify({ ev: "translate", cache: "miss", result: "ai-failed" }));
        return fail("failed", "the translator failed", 502);
      }

      const checked = checkOutput(out, parsed.to, parsed.text.length);
      if (!checked.ok) {
        // Not cached: a poor answer must not be shared. The person can try again.
        console.warn(JSON.stringify({ ev: "translate", cache: "miss", result: "bad-output", reason: checked.reason }));
        return fail("bad-output", "the translator gave an unusable answer", 502);
      }

      const model = modelOf(env);
      writeCached(env, ctx, key, { text: checked.text, model });
      console.log(JSON.stringify({ ev: "translate", cache: "miss", result: "ok", to: parsed.to, chars: parsed.text.length }));
      return json({ text: checked.text, model, cached: false }, 200, { "X-Cache": "MISS" });
    },
  };
}

export default createWorker();
