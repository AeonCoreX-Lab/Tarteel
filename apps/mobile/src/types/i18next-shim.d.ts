// Ambient shim for the hash-locked vendored file third_party/mihrab/src/prayer/madhab.ts, which only does
// `import type i18nType from "i18next"` (type position, erased at build time). Tarteel does not ship i18next, and
// vendored files must not be edited, so declare the module here instead of adding a runtime dependency.
// Keep this file free of top-level import/export: that is what makes it an ambient declaration.
declare module "i18next" {
  interface I18nShim {
    language: string;
    getResource(lng: string, ns: string, key: string): string | undefined;
    addResource(lng: string, ns: string, key: string, value: string, options?: { silent?: boolean }): unknown;
  }
  const i18next: I18nShim;
  export default i18next;
}
