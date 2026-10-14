import { readFile } from "node:fs/promises";
import { offeredReciters, parseCatalog } from "@tarteel/audio";

// The reciter catalog is data: every entry needs provenance and a human-verified licence before it can be enabled.
// An empty catalog is valid (the app then offers no recitation); a malformed or unverified-but-enabled entry is not.
const FILE = process.argv[2] ?? "apps/mobile/assets/audio/reciters.json";
let raw: unknown;
try {
  raw = JSON.parse(await readFile(FILE, "utf8"));
} catch (e) {
  console.log(`✗ ${FILE}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const { reciters, errors } = parseCatalog(raw);
for (const m of errors) console.log(`  ✗ ${m}`);
const offered = offeredReciters(reciters);
console.log(`${FILE}: ${Array.isArray(raw) ? raw.length : 0} entries, ${reciters.length} valid, ${offered.length} offered to users.`);
if (offered.length === 0) console.log("  note: no reciter is enabled, so the app will not offer recitation until one is added (docs/audio/README.md).");
process.exit(errors.length > 0 ? 1 : 0);
