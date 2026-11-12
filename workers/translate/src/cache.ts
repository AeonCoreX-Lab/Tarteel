import type { Ctx, Env } from "./env.ts";
import { DEFAULT_PROMPT_VERSION } from "./prompt.ts";
import { modelOf } from "./ai.ts";
import type { TargetLang } from "./validate.ts";

/** 90 days. After that the entry is gone and the next person who needs it makes a fresh translation, so a wrong one does not live for ever. */
export const TTL_SECONDS = 90 * 24 * 60 * 60;

export interface Stored {
  text: string;
  model: string;
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The cache key: prompt version, model, target language and a hash of the exact passage. A hash keeps the key far under KV's
 * 512-byte limit however long the text is, and holds no readable text.
 */
export async function cacheKey(env: Env, to: TargetLang, text: string): Promise<string> {
  const version = env.PROMPT_VERSION?.trim() || DEFAULT_PROMPT_VERSION;
  const model = modelOf(env).replace(/[^A-Za-z0-9._-]/g, "_");
  return `tr:${version}:${model}:${to}:${await sha256Hex(text)}`;
}

export async function readCached(env: Env, key: string): Promise<Stored | null> {
  let raw: string | null;
  try {
    raw = await env.TRANSLATE_CACHE.get(key);
  } catch {
    return null; // the cache being unreachable must not stop a translation
  }
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.text === "string" && typeof v.model === "string" ? { text: v.text, model: v.model } : null;
  } catch {
    return null;
  }
}

/**
 * Stores after the answer has gone out. KV's free plan allows 1,000 writes a day; when that is used up the write fails, and that
 * is ignored on purpose: the person still has their translation, it is just not shared.
 */
export function writeCached(env: Env, ctx: Ctx, key: string, value: Stored): void {
  ctx.waitUntil(env.TRANSLATE_CACHE.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS }).catch(() => undefined));
}
