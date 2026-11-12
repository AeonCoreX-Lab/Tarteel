/**
 * The small part of the Cloudflare runtime this Worker uses, written out here so the Worker is type-checked and tested with
 * plain Node (no `@cloudflare/workers-types` to install). The real objects are wider; only these members are called.
 */

/** Workers KV: the shared translation cache. */
export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Workers AI binding. Needs no API key: the binding is the permission. */
export interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  TRANSLATE_CACHE: KvNamespace;
  AI: AiBinding;
  /** "false" switches translation off without a redeploy of code (cached answers are not served either). */
  TRANSLATE_ENABLED?: string;
  /** Workers AI model id. Changing it makes new cache keys, so old answers are not mixed in. */
  TRANSLATE_MODEL?: string;
  /** Bump to make every cached translation stale (for example after the prompt is improved). */
  PROMPT_VERSION?: string;
  /** What `GET /config` tells the app to use. Empty = this Worker's own address. */
  CURRENT_TRANSLATE_URL?: string;
}
