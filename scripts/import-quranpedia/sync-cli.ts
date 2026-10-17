import { appendFileSync } from "node:fs";
import { syncQuranpedia } from "./sync.ts";
import type { Fetcher } from "./sync.ts";

// Usage: npm run sync:quranpedia [-- --dir data/knowledge/_incoming/quranpedia]
// Updates the raw Quranpedia files from the official dump. Prints the result and, inside GitHub Actions, writes it to $GITHUB_OUTPUT.
// Then run `npm run import:quranpedia`. See .github/workflows/quranpedia-sync.yml.
const i = process.argv.indexOf("--dir");
const dir = i >= 0 ? process.argv[i + 1] : "data/knowledge/_incoming/quranpedia";
if (!dir || dir.startsWith("--")) {
  console.log("✗ --dir needs a path.");
  process.exit(1);
}
const agent = process.env.QURANPEDIA_USER_AGENT ?? "Tarteel-dump-sync (open-source Quran app; 3 small files per run)";

const fetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": agent }, signal: AbortSignal.timeout(60_000) });
  return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
};

try {
  const r = await syncQuranpedia({ dir, fetch: fetcher });
  console.log(r.changed
    ? `Updated ${dir}: dump ${r.fromVersion ?? "(none)"} -> ${r.toVersion}${r.bookChanged ? ", book changed" : ""}${r.licenseChanged ? ", LICENCE TEXT CHANGED" : ""}.`
    : `Up to date (dump ${r.toVersion}). Nothing to do.`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${r.changed}\nlicense_changed=${r.licenseChanged}\nfrom=${r.fromVersion ?? ""}\nto=${r.toVersion}\n`);
} catch (e) {
  console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
