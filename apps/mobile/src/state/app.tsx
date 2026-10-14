import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReadingProgress } from "@tarteel/core";
import type { Repositories } from "@tarteel/database";
import type { TranslationMeta } from "@tarteel/types";
import { initAudio } from "../audio/runtime";
import { initDatabases } from "../platform/database";
import { prefs } from "../platform/preferences";
import { useSettings } from "./settings";

interface AppContextValue {
  repos: Repositories;
  progress: ReadingProgress;
  translations: TranslationMeta[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp used outside AppProvider");
  return v;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error: Error | null }) => ReactNode }) {
  const [repos, setRepos] = useState<Repositories | null>(null);
  const [translations, setTranslations] = useState<TranslationMeta[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    initDatabases()
      .then(async (r) => {
        const list = await r.translations.listInstalled();
        const { selectedTranslationId, set } = useSettings.getState();
        // Default to the first installed translation; fall back if the selected one is gone.
        if (list.length && !list.some((t) => t.id === selectedTranslationId)) set("selectedTranslationId", (list[0] as TranslationMeta).id);
        setTranslations(list);
        void initAudio(r).catch(() => undefined); // surah names for the lock screen; audio is optional
        setRepos(r);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  const value = useMemo<AppContextValue | null>(
    () => (repos ? { repos, translations, progress: new ReadingProgress(prefs, repos.history) } : null),
    [repos, translations],
  );
  if (!value) return <>{fallback({ error })}</>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
