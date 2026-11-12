/**
 * The online translation engine: a `TranslatorPort` that asks Tarteel's own translation Worker (`workers/translate`) for one
 * short Arabic passage at a time. The Worker answers from a shared cache or asks a Gemma model, so this is the one engine that
 * sends text off the phone. That is why it is a separate engine the person turns on in Settings, and why the app never falls
 * back to it from the on-device engine.
 *
 * Pure TypeScript. The network is a small port (`TranslateHttp`), so a fake network drives the tests. Nothing is stored here.
 */

import type { HadithHttpResponse } from "./hadith.ts";
import { TranslateError } from "./translate.ts";
import type { PrepareOptions, TranslateLang, TranslatorPort } from "./translate.ts";

/** The network: like `HadithHttp` with a POST. Must reject with an error whose `code` is "timeout", "network" or "cancelled" when it can. */
export interface TranslateHttp {
  get(url: string, opts: { timeoutMs: number; signal?: AbortSignal | undefined }): Promise<HadithHttpResponse>;
  post(url: string, body: string, opts: { timeoutMs: number; signal?: AbortSignal | undefined }): Promise<HadithHttpResponse>;
}

/** The longest passage the Worker takes. `translateText` cuts at 450, well under it. */
export const CLOUD_MAX_CHARS = 600;

export interface CloudTranslatorOptions {
  http: TranslateHttp;
  /** The Worker's address from the build's config. Only `https://` addresses are used. */
  baseUrl: string;
  /** For one translation. Default 30 s (a fresh translation by a large model can take a few seconds). */
  timeoutMs?: number;
}

export const isHttpsUrl = (s: string): boolean => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};

const withSlash = (s: string): string => (s.endsWith("/") ? s : `${s}/`);

function codeOf(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : undefined;
}

/** A network failure as a `TranslateError`: not reachable (`offline`), stopped by the person (`cancelled`), or anything else (`failed`). */
function networkError(e: unknown): TranslateError {
  const code = codeOf(e);
  if (code === "cancelled") return new TranslateError("cancelled", "stopped");
  if (code === "timeout" || code === "network") return new TranslateError("offline", "could not reach the translation server");
  return new TranslateError("failed", e instanceof Error ? e.message : "request failed");
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function errorCodeOf(body: string): string | undefined {
  const e = parseJson(body)?.["error"];
  const c = (e as { code?: unknown } | null | undefined)?.code;
  return typeof c === "string" ? c : undefined;
}

export function createCloudTranslator(options: CloudTranslatorOptions): TranslatorPort {
  const { http, baseUrl } = options;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const usable = isHttpsUrl(baseUrl);
  let resolved: { url: string } | null = null;

  /** The address to use. The Worker's `/config` can point somewhere else (so the Worker can move without a new app); asked once per session. */
  async function address(signal: AbortSignal | undefined): Promise<string> {
    if (resolved) return resolved.url;
    let res: HadithHttpResponse;
    try {
      res = await http.get(`${withSlash(baseUrl)}config`, { timeoutMs: 8000, signal });
    } catch (e) {
      throw networkError(e);
    }
    let url = withSlash(baseUrl);
    if (res.status === 200) {
      const cfg = parseJson(res.body);
      if (cfg?.["enabled"] === false) throw new TranslateError("unavailable", "switched off");
      const moved = cfg?.["translateUrl"];
      if (typeof moved === "string" && isHttpsUrl(moved)) url = withSlash(moved);
    }
    resolved = { url };
    return url;
  }

  return {
    id: "online",
    name: "Gemma via Cloudflare (online)",
    async available() {
      return usable;
    },
    async downloaded() {
      return [];
    },
    async prepare(_from: TranslateLang, _to: TranslateLang, _options: PrepareOptions) {
      if (!usable) throw new TranslateError("unavailable", "no server address in this build");
    },
    async remove() {
      /* nothing is kept on the device */
    },
    async translate(text: string, from: TranslateLang, to: TranslateLang, signal?: AbortSignal) {
      if (!usable || from !== "ar" || to === "ar") throw new TranslateError("unavailable", "this engine translates Arabic into English or Bangla");
      const body = text.trim();
      if (body === "") return "";
      if (body.length > CLOUD_MAX_CHARS) throw new TranslateError("failed", "passage is too long");
      const url = await address(signal);
      let res: HadithHttpResponse;
      try {
        res = await http.post(`${url}v1/translate`, JSON.stringify({ text: body, from, to }), { timeoutMs, signal });
      } catch (e) {
        throw networkError(e);
      }
      if (res.status === 200) {
        const out = parseJson(res.body)?.["text"];
        if (typeof out === "string" && out.trim() !== "") return out.trim();
        throw new TranslateError("failed", "unexpected answer");
      }
      if (res.status === 429) throw new TranslateError("busy", "too many requests");
      if (res.status === 503) throw new TranslateError(errorCodeOf(res.body) === "disabled" ? "unavailable" : "busy", "the translator is busy");
      throw new TranslateError("failed", `server answered ${res.status}`);
    },
  };
}
