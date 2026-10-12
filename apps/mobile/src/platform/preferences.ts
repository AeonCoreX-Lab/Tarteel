import { createMMKV } from "react-native-mmkv";
import { PREFERENCE_DEFAULTS } from "@tarteel/core";
import type { PreferenceSchema } from "@tarteel/core";
import { createPreferencesStore } from "@tarteel/storage";
import type { KeyValueStore } from "@tarteel/storage";

// MMKV = small, fast preferences ONLY. Never Quran data, notes or bookmarks.
const mmkv = createMMKV({ id: "tarteel-preferences" });

const kv: KeyValueStore = {
  getString: (k) => mmkv.getString(k),
  setString: (k, v) => mmkv.set(k, v),
  remove: (k) => void mmkv.remove(k),
  keys: () => mmkv.getAllKeys(),
};

export const prefs = createPreferencesStore<PreferenceSchema>(kv, PREFERENCE_DEFAULTS);
