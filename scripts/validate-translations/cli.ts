import { HAFS_6236 } from "@tarteel/quran-data";
import { listDatasetDirs, loadAndValidate, printIssues } from "../lib/dataset-loader.ts";

// Translations are optional individually; every present one must be fully valid
// AND redistribution-permitted (validateManifest enforces this).
const dirs = await listDatasetDirs("data/translations");
if (dirs.length === 0) console.log("No translations found in data/translations/ (nothing to validate).");
let failed = false;
const ids = new Set<string>();
for (const dir of dirs) {
  const d = await loadAndValidate(dir, HAFS_6236, "translation");
  console.log(`${dir}: ${d.manifest.id ?? "?"}@${d.manifest.version ?? "?"}`);
  if (d.manifest.id && ids.has(d.manifest.id)) { console.log("  ✗ duplicate translation id"); failed = true; }
  ids.add(d.manifest.id);
  if (printIssues(d.issues) > 0) failed = true;
  else console.log("  ✓ valid");
}
process.exit(failed ? 1 : 0);
