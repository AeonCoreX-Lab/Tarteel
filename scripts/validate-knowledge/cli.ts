import { existsSync } from "node:fs";
import { knowledgeCounts, validateKnowledgeDb } from "@tarteel/database";
import { openNodeSqlite } from "../lib/node-sqlite-driver.ts";
import { printIssues } from "../lib/dataset-loader.ts";

// Usage: npm run validate:knowledge -- [--release] [--quran <content.db>] [<database> ...]
// Checks the source-linked knowledge tables (claims, passages, edges, licences) of a built database. Never modifies it.
// Without a path it checks the content database built by `npm run build:db`, and passes quietly when there is none yet.
// --release makes release blockers errors (pending licences, Quran references that cannot be checked).
const args = process.argv.slice(2);
const release = args.includes("--release");
const qi = args.indexOf("--quran");
const quranPath = qi >= 0 ? args[qi + 1] : undefined;
if (qi >= 0 && (!quranPath || quranPath.startsWith("--"))) {
  console.log("✗ --quran needs a path to the content database.");
  process.exit(1);
}
const files = args.filter((a, i) => !a.startsWith("--") && !(qi >= 0 && i === qi + 1));
const DEFAULT = "apps/mobile/assets/db/quran.db";
const targets = files.length > 0 ? files : [DEFAULT];

if (files.length === 0 && !existsSync(DEFAULT)) {
  console.log(`No content database at ${DEFAULT} yet (run npm run build:db). Nothing to check.`);
  process.exit(0);
}
if (quranPath && !existsSync(quranPath)) {
  console.log(`✗ ${quranPath}: not found.`);
  process.exit(1);
}

let failed = false;
const quran = quranPath ? openNodeSqlite(quranPath, { readOnly: true }) : undefined;
for (const file of targets) {
  if (!existsSync(file)) {
    console.log(`✗ ${file}: not found.`);
    failed = true;
    continue;
  }
  const db = openNodeSqlite(file, { readOnly: true });
  try {
    const issues = await validateKnowledgeDb(db, { release, quran });
    const c = await knowledgeCounts(db);
    console.log(`${file}: ${c.claims} claims (${c.publishedClaims} published), ${c.edges} edges (${c.publishedEdges} published), ${c.editions} editions, ${c.passages} passages${release ? " [release]" : ""}`);
    if (printIssues(issues) > 0) failed = true;
    else console.log("  ✓ valid");
  } finally {
    await db.close();
  }
}
await quran?.close();
process.exit(failed ? 1 : 0);
