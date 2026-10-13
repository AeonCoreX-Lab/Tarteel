// Node resolve hook: lets Node run Metro-style sources (e.g. vendored upstream files) that bundlers accept but Node does not:
//  - relative imports without an extension ("./convert"),
//  - JSON imports without the `with { type: "json" }` attribute ("import data from './x.json'").
// Only affects relative specifiers; vendored files stay pristine.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const HAS_EXT = /\.[cm]?[jt]sx?$|\.json$/;

export async function resolve(specifier, context, nextResolve) {
  let result;
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !HAS_EXT.test(specifier) && context.parentURL?.startsWith("file:")) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(base + suffix)) {
        result = await nextResolve(pathToFileURL(base + suffix).href, context);
        break;
      }
    }
  }
  result ??= await nextResolve(specifier, context);
  if (result.url.startsWith("file:") && result.url.endsWith(".json") && result.importAttributes?.type !== "json") {
    return { ...result, importAttributes: { ...result.importAttributes, type: "json" } };
  }
  return result;
}
