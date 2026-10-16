import { readFile, writeFile } from "node:fs/promises";
import { buildAppConfig, formatAppConfig } from "./app-config.ts";

// Usage: npm run pack:configure -- --catalog-url <https://.../catalog.json> [--key <public-key.pem> ...] [--config <config.json>] [--check]
// Writes apps/mobile/src/knowledge/config.json: which catalogue the app asks and which publisher key(s) it trusts.
// Default key: data/knowledge/PUBLISHER-KEY.pub.pem. Give --key more than once to trust two keys while one is being rotated.
// --check writes nothing and exits 1 when the file on disk is not exactly what these arguments would write (use it in CI).
const args = process.argv.slice(2);
const values = (name: string): string[] => args.flatMap((a, i) => (a === name && args[i + 1] && !args[i + 1]!.startsWith("--") ? [args[i + 1]!] : []));
const catalogUrl = values("--catalog-url")[0];
const keyFiles = values("--key");
const configPath = values("--config")[0] ?? "apps/mobile/src/knowledge/config.json";
const check = args.includes("--check");
if (!catalogUrl) {
  console.log("✗ --catalog-url is required, for example https://github.com/<owner>/<repo>/releases/download/catalog-latest/catalog.json");
  process.exit(1);
}
const files = keyFiles.length > 0 ? keyFiles : ["data/knowledge/PUBLISHER-KEY.pub.pem"];
const pems: string[] = [];
for (const f of files) {
  try {
    pems.push(await readFile(f, "utf8"));
  } catch {
    console.log(`✗ ${f}: cannot be read. Generate a key pair with \`npm run pack:keygen\` and commit the PUBLIC key there.`);
    process.exit(1);
  }
}
const { config, errors } = buildAppConfig(catalogUrl, pems);
if (!config) {
  for (const e of errors) console.log(`✗ ${e}`);
  process.exit(1);
}
const text = formatAppConfig(config);
if (check) {
  const current = await readFile(configPath, "utf8").catch(() => "");
  if (current !== text) {
    console.log(`✗ ${configPath} is not what --catalog-url and the key file(s) produce. Run \`npm run pack:configure\` without --check and commit the result.`);
    process.exit(1);
  }
  console.log(`✓ ${configPath} is up to date.`);
} else {
  await writeFile(configPath, text);
  console.log(`✓ wrote ${configPath}: ${config.publisherKeys.length} key(s), catalogue ${config.catalogUrl}`);
}
