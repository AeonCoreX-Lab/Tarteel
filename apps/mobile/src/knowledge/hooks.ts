import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import type { AyahContext, CatalogEntry, EntityDetail, EntityKind, EntityRef, EntitySummary, HistoryClaim, KnowledgeCoverage, KnowledgeSearchResult, LibraryRow, PackFailureCode, PackIntegrity, PackReadReport, SourceDetail, SurahKnowledge } from "@tarteel/database";
import type { StringKey } from "../i18n";
import { getLibrary, getReader, knowledgeConfigured, packsChanged, packsVersionStore } from "./runtime";

export interface LibraryMessage {
  tone: "ok" | "error";
  text: StringKey;
  /** Technical detail of a failure (in English, for a bug report), shown small under the message. Never contains personal data. */
  detail?: string;
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
  /** Set synchronously on a tap, so a second tap before the screen re-renders cannot start a second operation. */
  const working = useRef(false);
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
    if (working.current) return;
    working.current = true;
    void (async () => {
      patch({ busyId: entry.manifest.packId, message: null });
      try {
        const lib = await getLibrary();
        const controller = new AbortController();
        abort.current = controller;
        const r = await lib.install(entry, { signal: controller.signal, allowSameVersion: repair });
        abort.current = null;
        working.current = false;
        await reload();
        if (r.ok) void packsChanged();
        if (r.ok) {
          setState((s) => {
            const damaged = new Map(s.damaged);
            damaged.delete(entry.manifest.packId);
            return { ...s, damaged, busyId: null, message: { tone: "ok", text: "libInstalledOk" } };
          });
        } else patch({ busyId: null, message: r.code === "cancelled" ? { tone: "ok", text: failureKey(r.code) } : { tone: "error", text: failureKey(r.code), detail: `${r.code}: ${r.message}` } });
      } catch {
        // installPack reports expected failures as results; this is something unexpected. Never leave the card on "Installing...".
        patch({ busyId: null, message: { tone: "error", text: "libErrGeneric" } });
      } finally {
        abort.current = null;
        working.current = false;
      }
    })();
  }, [patch, reload]);

  const remove = useCallback((packId: string) => {
    if (working.current) return;
    working.current = true;
    void (async () => {
      patch({ busyId: packId, message: null });
      try {
        const lib = await getLibrary();
        const r = await lib.remove(packId);
        working.current = false;
        await reload();
        if (r.ok) void packsChanged();
        patch({ busyId: null, message: r.ok ? { tone: "ok", text: "libRemovedOk" } : { tone: "error", text: r.code === "required-by" ? "libRequiredBy" : "libErrGeneric" } });
      } catch {
        patch({ busyId: null, message: { tone: "error", text: "libErrGeneric" } });
      } finally {
        working.current = false;
      }
    })();
  }, [patch, reload]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  return { ...state, checkForPacks, install, remove, cancel };
}

// ------------------------------------------------------------------- reading

/** A read of the installed packs: still loading, done, or failed (so a screen can offer a retry instead of waiting for ever). */
export type Loaded<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error" };

/**
 * Runs `load` on the installed packs every time the screen comes into focus (so a pack installed in the Library shows up
 * when the person comes back). `retry` runs it again after a failure.
 */
function usePacksQuery<T>(load: (reader: Awaited<ReturnType<typeof getReader>>) => Promise<T>, deps: readonly unknown[]): { state: Loaded<T>; retry: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const run = useCallback(load, deps);
  const version = useSyncExternalStore(packsVersionStore.subscribe, packsVersionStore.get);
  useFocusEffect(
    useCallback(() => {
      if (!knowledgeConfigured) return undefined;
      let cancelled = false;
      void getReader().then(run).then(
        (value) => !cancelled && setState({ status: "ready", value }),
        () => !cancelled && setState({ status: "error" }),
      );
      return () => {
        cancelled = true;
      };
    }, [run, attempt, version]),
  );
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);
  return { state, retry };
}

/** The value, or null while loading, when packs are not offered, or when reading fails. */
function useFromPacks<T>(load: (reader: Awaited<ReturnType<typeof getReader>>) => Promise<T>, deps: readonly unknown[]): T | null {
  const { state } = usePacksQuery(load, deps);
  return state.status === "ready" ? state.value : null;
}

/** What the installed packs hold for a surah: drives the "History and context" entry points. Null when there is nothing to show. */
export function useKnowledgeCoverage(surahId: number): KnowledgeCoverage | null {
  const c = useFromPacks((r) => r.coverage(surahId), [surahId]);
  return c && (c.surahClaims > 0 || c.surahEntities > 0 || c.ayahs.length > 0) ? c : null;
}

/** Every surah with something in an installed pack: the Knowledge tab's list. */
export function useKnowledgeBrowse(): { state: Loaded<SurahKnowledge[]>; retry: () => void } {
  return usePacksQuery((r) => r.browse(), []);
}

/**
 * Search of the installed packs as the person types: nothing under two characters, then one search 300 ms after the last
 * keystroke. A search that has been overtaken is dropped, so results never arrive for an older query.
 */
export function useKnowledgeSearch(query: string, lang: string): { status: "idle" | "searching" | "done" | "error"; result: KnowledgeSearchResult | null } {
  const [s, setS] = useState<{ status: "idle" | "searching" | "done" | "error"; result: KnowledgeSearchResult | null }>({ status: "idle", result: null });
  useEffect(() => {
    const q = query.trim();
    if (!knowledgeConfigured || q.length < 2) {
      setS({ status: "idle", result: null });
      return undefined;
    }
    let cancelled = false;
    setS((prev) => ({ ...prev, status: "searching" }));
    const timer = setTimeout(() => {
      void getReader().then((r) => r.search(q, lang)).then(
        (result) => !cancelled && setS({ status: "done", result }),
        () => !cancelled && setS({ status: "error", result: null }),
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, lang]);
  return s;
}

/** How many published events, people and places the installed packs hold. */
export function useEntityCounts(): { state: Loaded<Record<EntityKind, number>>; retry: () => void } {
  return usePacksQuery((r) => r.entityCounts(), []);
}

/** Every published event, person or place of one kind, dated ones first. */
export function useEntities(kind: EntityKind, lang: string): { state: Loaded<EntitySummary[]>; retry: () => void } {
  return usePacksQuery((r) => r.entities(kind, lang), [kind, lang]);
}

/** One entry with everything its pack says about it. `ready` with null means it is not there (pack removed, or not published). */
export function useEntityDetail(packId: string, id: string, lang: string): { state: Loaded<EntityDetail | null>; retry: () => void } {
  return usePacksQuery((r) => r.entity(packId, id, lang), [packId, id, lang]);
}

/** The events, people and places linked to an ayah, or to a surah (and its ayahs) when `ayahNumber` is null. */
export function useEntitiesFor(surahId: number, ayahNumber: number | null, lang: string): { state: Loaded<EntityRef[]>; retry: () => void } {
  return usePacksQuery((r) => r.entitiesFor(ayahNumber === null ? { surahId } : { surahId, ayahNumber }, lang), [surahId, ayahNumber, lang]);
}

export function useSurahHistory(surahId: number, lang: string): HistoryClaim[] | null {
  return useFromPacks((r) => r.surah(surahId, lang), [surahId, lang]);
}

export function useAyahContext(surahId: number, ayahNumber: number | null, lang: string): AyahContext | null {
  return useFromPacks(async (r) => (ayahNumber === null ? { claims: [], reports: [] } : r.ayah(surahId, ayahNumber, lang)), [surahId, ayahNumber, lang]);
}

/** The same two reads with their state, for the History screen's loading, failure and retry. */
export function useSurahHistoryState(surahId: number, lang: string): { state: Loaded<HistoryClaim[]>; retry: () => void } {
  return usePacksQuery((r) => r.surah(surahId, lang), [surahId, lang]);
}

export function useAyahContextState(surahId: number, ayahNumber: number | null, lang: string): { state: Loaded<AyahContext>; retry: () => void } {
  return usePacksQuery(async (r) => (ayahNumber === null ? { claims: [], reports: [] } : r.ayah(surahId, ayahNumber, lang)), [surahId, ayahNumber, lang]);
}

/** The work, edition and licence behind a citation, and the claims that cite that edition. Null while loading or when not found. */
export function useSourceDetail(packId: string, passageId: string, lang: string): SourceDetail | null {
  return useFromPacks((r) => r.sourceDetail(packId, passageId, lang), [packId, passageId, lang]);
}

/** How many packs are installed, how many could be read, and why the others could not. Read again when the packs change or the person retries. */
export function usePackDiagnosis(): { state: Loaded<PackReadReport>; retry: () => void } {
  return usePacksQuery((r) => r.diagnose(), []);
}

/** Closes the open pack files and makes every screen read again. For the "Try again" buttons. */
export function readPacksAgain(): void {
  void packsChanged();
}
