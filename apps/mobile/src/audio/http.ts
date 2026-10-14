import type { AudioHttp } from "@tarteel/audio";

/**
 * The network for audio: plain `fetch`, one request per ayah, always with a deadline.
 * A deadline is not a retry: the download engine already retries, and a second retry loop here would multiply them.
 * The deadline covers the body as well as the headers, because a connection that is accepted and then stalls (a
 * captive portal, a proxy) is exactly the case that must not hang a download forever.
 */
export function createFetchHttp(): AudioHttp {
  return {
    async get(url, { timeoutMs, signal }) {
      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener("abort", onAbort);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = (async () => {
          const res = await fetch(url, { signal: controller.signal });
          const buf = await res.arrayBuffer();
          return { status: res.status, bytes: new Uint8Array(buf) };
        })();
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });
        // The loser's rejection must not become an unhandled one.
        work.catch(() => undefined);
        return await Promise.race([work, deadline]);
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
