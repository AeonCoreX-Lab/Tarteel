import { buildDemoPacks } from "./demo-lib.ts";

// Usage: npm run pack:demo -- --base-url <https://where-you-will-upload-them/> [--out build/demo-packs]
// Builds a THROWAWAY test setup (synthetic pack v1 and v2, a new key, two catalogues) for the device checklist in
// docs/testing/KNOWLEDGE-DEVICE-CHECKLIST.md. The private key is discarded; the app must be built with the printed public key
// only for testing, and that config must never be committed.
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1] : undefined;
};
const baseUrl = flag("--base-url");
const out = flag("--out") ?? "build/demo-packs";
if (!baseUrl) {
  console.log("✗ --base-url is required: the https address (ending in /) where you will upload the files, for example https://example.github.io/tarteel-demo/");
  process.exit(1);
}
try {
  const r = await buildDemoPacks(out, baseUrl);
  console.log(`✓ wrote ${r.files.length} files to ${out}/:\n  ${r.files.join("\n  ")}`);
  console.log(`\nNext: upload them to ${baseUrl}, then build the app for testing with:\n  npm run pack:configure -- --catalog-url ${baseUrl.replace(/\/?$/, "/")}catalog.json --key ${out}/demo-publisher-key.pub.pem`);
  console.log("This writes a TEST key into apps/mobile/src/knowledge/config.json. Do not commit that change.");
} catch (e) {
  console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
