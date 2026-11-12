import { HadithError } from "@tarteel/core";
import type { TranslateHttp } from "@tarteel/core";

/** Names this app to the server. Contains nothing about the person. */
const USER_AGENT = "Tarteel (free open-source Quran app; https://github.com/AeonCoreX-Lab/Tarteel)";

type Init = { method: "GET" | "POST"; body?: string };

async function request(url: string, init: Init, timeoutMs: number, signal: AbortSignal | undefined) {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const work = (async () => {
      const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
      if (init.body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(url, { method: init.method, signal: controller.signal, headers, ...(init.body !== undefined ? { body: init.body } : {}) });
      const body = await res.text();
      const retry = Number(res.headers.get("retry-after"));
      return { status: res.status, body, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : null };
    })();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new HadithError("timeout", `timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    work.catch(() => undefined);
    return await Promise.race([work, deadline]);
  } catch (e) {
    if (e instanceof HadithError) throw e;
    if (timedOut) throw new HadithError("timeout", "timed out");
    if (signal?.aborted) throw new HadithError("cancelled", "cancelled");
    throw new HadithError("network", e instanceof Error ? e.message : String(e));
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** `fetch` for the online translator: a GET and a POST, each with a deadline that covers the body and an abort the caller can trigger. */
export function createFetchTranslateHttp(): TranslateHttp {
  return {
    get: (url, { timeoutMs, signal }) => request(url, { method: "GET" }, timeoutMs, signal),
    post: (url, body, { timeoutMs, signal }) => request(url, { method: "POST", body }, timeoutMs, signal),
  };
}
