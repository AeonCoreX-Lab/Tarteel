import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { AyahContext, CatalogEntry, HistoryClaim, KnowledgeCoverage, LibraryRow, PackFailureCode, PackIntegrity, SourceDetail } from "@tarteel/database";
import type { StringKey } from "../i18n";
import { getLibrary, getReader, knowledgeConfigured } from "./runtime";

export interface LibraryMessage {
  tone: "ok" | "error";
  text: StringKey;
}

/** What to tell the person for each way an install can fail. Every message also says whether the installed packs were touched. */
export function failureKey(code: PackFailureCode): StringKey {
  switch (code) {
    case "signature-missing":
    case "signature-invalid":
      return "libErrSignature";
    case "download-failed":
    case "insecure-url":
      return "libErrDownload";
    case "size-mismatch":
    case "checksum-mismatch":
      return "libErrChecksum";
    case "schema-error":
    case "validation-failed":
      return "libErrValidation";
    case "app-too-old":
      return "libErrAppOld";
    case "missing-dependency":
      return "libErrDependency";
    case "not-newer":
      return "libErrNotNewer";
    case "storage-error":
      return "libErrStorage";
    case "cancelled":
      return "libCancelled";
    default:
      return "libErrGeneric";
  }
}

export type CatalogPhase = "idle" | "loading" | "loaded" | "failed";

export interface KnowledgeLibraryState {
  available: boolean;
  ready: boolean;
  rows: LibraryRow[];
  /** Installed packs whose file is missing or damaged, or that are no longer signed by a trusted key, by pack id. */
  damaged: ReadonlyMap<string, Exclude<PackIntegrity, "ok">>;
  catalog: CatalogPhase;
  /** The pack being installed, repaired or removed. One at a time. */
  busyId: string | null;
  message: LibraryMessage | null;
}

/**
 * The Library screen's state. Opening the screen is offline (it cleans up after an interrupted install and reads what is
 * installed). The network is used only by `checkForPacks` and `install`, which the person taps.
 */
export function useKnowledgeLibrary(): KnowledgeLibraryState & {
  checkForPacks: () => void;
  install: (entry: CatalogEntry, repair?: boolean) => void;
  remove: (packId: string) => void;
  cancel: () => void;
} {
  const [state, setState] = useState<KnowledgeLibraryState>({
    available: knowledgeConfigured, ready: false, rows: [], damaged: new Map(), catalog: "idle", busyId: null, message: null,
  });
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const patch = useCallback((p: Partial<KnowledgeLibraryState>) => {
    if (alive.current) setState((s) => ({ ...s, ...p }));
  }, []);

  const reload = useCallback(async () => {
    const lib = await getLibrary();
    patch({ rows: await lib.rows() });
  }, [patch]);

  useEffect(() => {
    alive.current = true;
    if (!knowledgeConfigured) return undefined;
    void (async () => {
      try {
        const lib = await getLibrary();
        const report = await lib.startup();
        patch({ ready: true, rows: await lib.rows(), damaged: new Map(report.damaged.map((d) => [d.pack.packId, d.integrity] as const)) });
      } catch {
        patch({ ready: true, message: { tone: "error", text: "libErrGeneric" } });
      }
    })();
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, [patch]);

  const checkForPacks = useCallback(() => {
    void (async () => {
      patch({ catalog: "loading", message: null });
      const lib = await getLibrary();
      const controller = new AbortController();
      abort.current = controller;
      const r = await lib.refreshCatalog(controller.signal);
      abort.current = null;
      if (!r.ok) return patch({ catalog: "failed", message: r.code === "cancelled" ? null : { tone: "error", text: r.code === "catalog-invalid" ? "libCatalogInvalid" : "libCheckFailed" } });
      patch({ catalog: "loaded", message: { tone: "ok", text: "libChecked" } });
      await reload();
    })();
  }, [patch, reload]);

  const install = useCallback((entry: CatalogEntry, repair = false) => {
    void (async () => {
      patch({ busyId: entry.manifest.packId, message: null });
      const lib = await getLibrary();
      const controller = new AbortController();
      abort.current = controller;
      const r = await lib.install(entry, { signal: controller.signal, allowSameVersion: repair });
      abort.current = null;
      await reload();
      if (r.ok) {
        setState((s) => {
          const damaged = new Map(s.damaged);
          damaged.delete(entry.manifest.packId);
          return { ...s, damaged, busyId: null, message: { tone: "ok", text: "libInstalledOk" } };
        });
      } else patch({ busyId: null, message: { tone: r.code === "cancelled" ? "ok" : "error", text: failureKey(r.code) } });
    })();
  }, [patch, reload]);

  const remove = useCallback((packId: string) => {
    void (async () => {
      patch({ busyId: packId, message: null });
      const lib = await getLibrary();
      const r = await lib.remove(packId);
      await reload();
      patch({ busyId: null, message: r.ok ? { tone: "ok", text: "libRemovedOk" } : { tone: "error", text: r.code === "required-by" ? "libRequiredBy" : "libErrGeneric" } });
    })();
  }, [patch, reload]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  return { ...state, checkForPacks, install, remove, cancel };
}

// ------------------------------------------------------------------- reading

/**
 * Runs `load` on the installed packs every time the screen comes into focus (so a pack installed in the Library shows up
 * when the person comes back) and returns the result, or null while loading, when packs are not offered, or when reading fails.
 */
function useFromPacks<T>(load: (reader: Awaited<ReturnType<typeof getReader>>) => Promise<T>, deps: readonly unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  const run = useCallback(load, deps);
  useFocusEffect(
    useCallback(() => {
      if (!knowledgeConfigured) return undefined;
      let cancelled = false;
      void getReader().then(run).then((v) => !cancelled && setValue(v), () => !cancelled && setValue(null));
      return () => {
        cancelled = true;
      };
    }, [run]),
  );
  return value;
}

/** What the installed packs hold for a surah: drives the "History and context" entry points. Null when there is nothing to show. */
export function useKnowledgeCoverage(surahId: number): KnowledgeCoverage | null {
  const c = useFromPacks((r) => r.coverage(surahId), [surahId]);
  return c && (c.surahClaims > 0 || c.ayahs.length > 0) ? c : null;
}

export function useSurahHistory(surahId: number, lang: string): HistoryClaim[] | null {
  return useFromPacks((r) => r.surah(surahId, lang), [surahId, lang]);
}

export function useAyahContext(surahId: number, ayahNumber: number | null, lang: string): AyahContext | null {
  return useFromPacks(async (r) => (ayahNumber === null ? { claims: [], reports: [] } : r.ayah(surahId, ayahNumber, lang)), [surahId, ayahNumber, lang]);
}

/** The work, edition and licence behind a citation, and the claims that cite that edition. Null while loading or when not found. */
export function useSourceDetail(packId: string, passageId: string, lang: string): SourceDetail | null {
  return useFromPacks((r) => r.sourceDetail(packId, passageId, lang), [packId, passageId, lang]);
}
