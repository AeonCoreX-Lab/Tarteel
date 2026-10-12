import { HAFS_6236 } from "@tarteel/quran-data";
import { listDatasetDirs, loadAndValidate, printIssues } from "../lib/dataset-loader.ts";

// Usage: npm run validate:quran [-- --allow-empty]
// Fails (exit 1) on ANY critical problem. Never modifies data.
const allowEmpty = process.argv.includes("--allow-empty");
const dirs = await listDatasetDirs("data/quran");
if (dirs.length === 0) {
  console.log("No Quran dataset found in data/quran/. See docs/data-sources/README.md.");
  process.exit(allowEmpty ? 0 : 1);
}
let failed = false;
for (const dir of dirs) {
  const d = await loadAndValidate(dir, HAFS_6236, "quran");
  console.log(`${dir}: ${d.manifest.id ?? "?"}@${d.manifest.version ?? "?"}`);
  if (printIssues(d.issues) > 0) failed = true;
  else console.log("  ✓ valid");
}
if (dirs.length !== 1) {
  console.log("Exactly one Quran dataset is expected in data/quran/.");
  failed = true;
}
process.exit(failed ? 1 : 0);
