import { create } from "zustand";
import { PREFERENCE_DEFAULTS } from "@tarteel/core";
import type { PreferenceSchema } from "@tarteel/core";
import { prefs } from "../platform/preferences";

type SettingsState = PreferenceSchema & {
  set: <K extends keyof PreferenceSchema>(key: K, value: PreferenceSchema[K]) => void;
};

/** Zustand = in-memory UI state. Every write goes through to MMKV; MMKV is the source of truth. */
export const useSettings = create<SettingsState>((set) => ({
  ...PREFERENCE_DEFAULTS,
  ...prefs.getAll(),
  set: (key, value) => {
    prefs.set(key, value);
    set({ [key]: value } as Partial<SettingsState>);
  },
}));
