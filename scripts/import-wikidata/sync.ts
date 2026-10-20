import { convert, parseSeeds } from "./convert.ts";
import type { DraftEntity } from "./convert.ts";

export const API = "https://www.wikidata.org/w/api.php";
export type Getter = (url: string) => Promise<{ status: number; body: string }>;

export interface SyncResult { drafts: DraftEntity[]; problems: string[]; requests: number }

/**
 * Asks Wikidata about the seeded items, 50 per request, one request at a time, and converts the answers. `maxlag=5` makes
 * Wikidata tell us to go away when its servers are busy, and we then stop instead of retrying hard.
 */
export async function syncWikidata(args: { seeds: unknown; get: Getter; retrieved: string; sleep?: (ms: number) => Promise<void> }): Promise<SyncResult> {
  const seeds = parseSeeds(args.seeds);
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const drafts: DraftEntity[] = [];
  const problems: string[] = [];
  let requests = 0;
  for (let i = 0; i < seeds.length; i += 50) {
    const batch = seeds.slice(i, i + 50);
    if (requests > 0) await sleep(1000);
    const url = `${API}?action=wbgetentities&format=json&maxlag=5&props=${encodeURIComponent("labels|descriptions|claims|info")}&languages=${encodeURIComponent("en|ar|bn")}&ids=${encodeURIComponent(batch.map((s) => s.qid).join("|"))}`;
    const res = await args.get(url);
    requests++;
    if (res.status !== 200) throw new Error(`Wikidata answered ${res.status}; stopped without writing anything`);
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      throw new Error("Wikidata's answer was not JSON; stopped without writing anything");
    }
    if (typeof json === "object" && json !== null && "error" in json) throw new Error(`Wikidata reported an error (${JSON.stringify((json as { error: unknown }).error).slice(0, 200)}); stopped without writing anything`);
    const r = convert(json, batch, args.retrieved);
    drafts.push(...r.drafts);
    problems.push(...r.problems);
  }
  return { drafts, problems, requests };
}
