import { HadithError, createHadithClient } from "@tarteel/core";
import type { HadithClient, HadithHttp } from "@tarteel/core";

/* eslint-disable @typescript-eslint/no-require-imports */
const config = require("./config.json") as { enabled: boolean };

/**
 * The online hadith lookup is offered only in a build that turns it on here. It is OFF in the repository: the request to
 * Sunnah.com for agreement on the terms of use is still open, and the owner switches this on once the terms are settled.
 * With it off there is no hadith screen, no setting, and no request to the hadith server, ever.
 */
export const hadithEnabled: boolean = config.enabled === true;

/** Names this app to the server, so its operators can see who is calling and get in touch. Contains nothing about the person. */
const USER_AGENT = "Tarteel (free open-source Quran app; https://github.com/AeonCoreX-Lab/Tarteel)";

/** `fetch` with a deadline that covers the body too, and an abort the caller can trigger. */
export function createFetchHadithHttp(): HadithHttp {
  return {
    async get(url, { timeoutMs, signal }) {
      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener("abort", onAbort);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const work = (async () => {
          const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
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
    },
  };
}

let client: HadithClient | null = null;

/** One client for the app, so its short in-memory cache and request spacing are shared. Never created while the feature is off. */
export function getHadithClient(): HadithClient {
  client ??= createHadithClient({ http: createFetchHadithHttp() });
  return client;
}
