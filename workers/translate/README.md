# Tarteel translation Worker

An **optional online engine** for the app's "Translate" button. The app sends one short Arabic passage; this Worker answers from a
shared cache (Workers KV, kept 90 days) or, on a miss, asks a Gemma model on Cloudflare Workers AI and keeps the answer. A passage
many people open is translated once, not once each. Without this Worker the app still translates on the phone (Google ML Kit); this
only adds a better, online choice that the person turns on themselves in Settings.

```
app  ──POST /v1/translate──▶  Worker  ──hit──▶  KV (90 days)
                                 │
                                 └─miss──▶  Workers AI (Gemma)  ──▶  checked  ──▶  KV
```

## What it keeps, and what it never does

- Keeps: for each translated passage, a **hash** of it and its translation, for up to 90 days, so other people get it faster.
- Never: accounts, user ids, the text or the caller's address in logs. Logs hold only counts (hit or miss, language, length).
- The caller's address is seen by Cloudflare, as for any website. The Worker does not store it (it is used in memory, for a one-minute rate limit).

## Limits on Cloudflare's free plan

| What | Free allowance | What the Worker does about it |
|---|---|---|
| Workers AI | 10,000 Neurons a day; past it, calls fail (no surprise bill) | On that error it stops calling the AI for 10 minutes and answers `busy`; cached answers still work. The app tells the person and suggests on-device translation. |
| KV writes | 1,000 a day | A failed write is ignored: the person still gets the translation, it is just not shared. |
| KV reads | 100,000 a day | One read per request (no request counters are kept in KV). |
| KV storage | 1 GB | The 90-day expiry keeps it far below that. |
| Worker requests | 100,000 a day | Per-address limit: 60 requests and 20 new translations a minute. |

(From Cloudflare's [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [KV limits](https://developers.cloudflare.com/kv/platform/limits) pages; check them, they change.)

These limits are **per Cloudflare account**. Keep this Worker in its own account so no other project shares its allowance.

## One-time setup

1. **Cloudflare account**: sign up at cloudflare.com (the free plan is enough). Open *Workers & Pages* once so it creates your `workers.dev` subdomain.
2. **KV namespace**: dashboard → *Storage & databases* → *KV* → *Create* → name it `tarteel-translate-cache` → copy its **ID**.
3. Paste that ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`, and commit.
4. **API token**: dashboard → *My Profile* → *API Tokens* → *Create Token* → template **Edit Cloudflare Workers** → create and copy it.
   If the deploy log later complains about a missing permission, edit the token and add *Workers AI* and *Workers KV Storage* (Edit).
5. Add two GitHub secrets (repo → *Settings* → *Secrets and variables* → *Actions*): `CLOUDFLARE_API_TOKEN` (the token) and
   `CLOUDFLARE_ACCOUNT_ID` (dashboard → *Workers & Pages* → right-hand column).
6. Push to `main`, or run **Deploy translation Worker** from the Actions tab. The log ends with the address, like
   `https://tarteel-translate.<your-subdomain>.workers.dev`.
7. Put that address in `apps/mobile/src/online/config.json` as `"translateWorkerUrl"` and build the app. Until it is set, the app
   shows no online option at all and makes no request.

Check it from a terminal:

```sh
curl -s https://tarteel-translate.<your-subdomain>.workers.dev/health
curl -s https://tarteel-translate.<your-subdomain>.workers.dev/v1/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"حدثنا أبو بكر عن ابن بطة رحمه الله","from":"ar","to":"en"}'
```

The second call returns `"cached":false`; run it again and it returns `"cached":true`.

## Running it day to day

- **Switch off** without touching the app: set `TRANSLATE_ENABLED = "false"` in `wrangler.toml`, push. The app shows its "unavailable" message.
- **Better prompt or another model**: change `TRANSLATE_MODEL` or raise `PROMPT_VERSION` (`p2`, `p3`…). Both are part of the cache key, so older answers are simply not used (they expire in 90 days).
- **Move the Worker** (new name, custom domain): set `CURRENT_TRANSLATE_URL`. The app asks `GET /config` and follows it, so no new APK is needed. The address written in `config.json` is the one thing that cannot change without an app update.
- **Watch usage**: dashboard → *Workers & Pages* → this Worker → *Metrics*; *AI* shows the Neurons used.
- **Tests**: `npm test` at the repo root runs this Worker's tests with a fake KV and a fake AI (no Cloudflare needed). `npm run dev` here runs it locally with `wrangler`.

## Notes for the licence inventory

The Worker is AGPL-3.0-or-later like the rest of Tarteel; its source is this folder. The model is Google's Gemma, used under the
[Gemma Terms of Use](https://ai.google.dev/gemma/terms) through Cloudflare's service. Translations it keeps are machine output
from the text the person sent; for texts under CC BY-NC-SA (OpenITI) those translations stay credited to the work and non-commercial.
