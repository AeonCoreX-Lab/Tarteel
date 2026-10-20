import { appendFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncWikidata } from "./sync.ts";

// Usage: npm run sync:wikidata [-- --dir data/knowledge/_incoming/wikidata]
// Reads seeds.json (a person's list of Wikidata items and what kind each is) and writes candidates.json: DRAFT entities in the
// entities.json format. Nothing is published from here. See docs/data-sources/RECOMMENDATIONS.md and .github/workflows/wikidata-sync.yml.
const i = process.argv.indexOf("--dir");
const dir = i >= 0 ? process.argv[i + 1] : "data/knowledge/_incoming/wikidata";
if (!dir || dir.startsWith("--")) {
  console.log("✗ --dir needs a path.");
  process.exit(1);
}
const agent = process.env.WIKIDATA_USER_AGENT ?? "Tarteel-wikidata-sync (open-source Quran app; https://github.com/AeonCoreX-Lab/Tarteel; a few small requests per run)";

try {
  const seeds: unknown = JSON.parse(await readFile(join(dir, "seeds.json"), "utf8"));
  const r = await syncWikidata({
    seeds,
    retrieved: new Date().toISOString().slice(0, 10),
    get: async (url) => {
      const res = await fetch(url, { headers: { "user-agent": agent, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      return { status: res.status, body: await res.text() };
    },
  });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "candidates.json"), `${JSON.stringify(r.drafts, null, 2)}\n`);
  for (const p of r.problems) console.log(`! ${p}`);
  console.log(`Wrote ${r.drafts.length} draft entities to ${dir}/candidates.json (${r.requests} request${r.requests === 1 ? "" : "s"}, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}).`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${r.drafts.length}\nproblems=${r.problems.length}\n`);
} catch (e) {
  console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
