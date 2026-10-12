// Node resolve hook: lets Node run Metro-style sources whose relative imports omit the extension
// (e.g. vendored upstream files). Only affects relative specifiers that have no extension.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const HAS_EXT = /\.[cm]?[jt]sx?$|\.json$/;

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !HAS_EXT.test(specifier) && context.parentURL?.startsWith("file:")) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(base + suffix)) return nextResolve(pathToFileURL(base + suffix).href, context);
    }
  }
  return nextResolve(specifier, context);
}
