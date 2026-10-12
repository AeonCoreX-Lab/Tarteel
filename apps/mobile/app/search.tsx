import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseAyahRef } from "@tarteel/core";
import { HAFS_6236_AYAH_COUNTS } from "@tarteel/quran-data";
import type { SearchHit, Surah } from "@tarteel/types";
import { Icon } from "../src/components/Icons";
import { StarBadge } from "../src/components/Ornaments";
import { Button, Segmented } from "../src/components/ui";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/** Renders FTS highlight markers "[match]" as bold gold-underlined text. */
function Highlighted({ text, color, accent, size, rtl }: { text: string; color: string; accent: string; size: number; rtl: boolean }) {
  const parts = text.split(/(\[[^\]]*\])/g).filter(Boolean);
  return (
    <Text style={{ color, fontSize: size, lineHeight: size * 1.6, textAlign: rtl ? "right" : "left", writingDirection: rtl ? "rtl" : "ltr" }}>
      {parts.map((p, i) =>
        p.startsWith("[") && p.endsWith("]")
          ? <Text key={i} style={{ color: accent, fontWeight: "800", textDecorationLine: "underline" }}>{p.slice(1, -1)}</Text>
          : <Text key={i}>{p}</Text>,
      )}
    </Text>
  );
}

export default function SearchScreen() {
  const { repos } = useApp();
  const router = useRouter();
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const translationId = useSettings((s) => s.selectedTranslationId);
  const [scope, setScope] = useState<"arabic" | "translation">("arabic");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const jump = parseAyahRef(query, HAFS_6236_AYAH_COUNTS);

  useEffect(() => void repos.quran.getSurahs().then(setSurahs), [repos]);

  // Debounced, indexed (FTS5) search. Never scans the Quran from JS.
  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    let cancelled = false;
    const h = setTimeout(() => {
      const run = scope === "arabic" || !translationId
        ? repos.search.searchArabic(query)
        : repos.search.searchTranslation(translationId, query);
      void run.then((r) => { if (!cancelled) setHits(r); });
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [query, scope, translationId, repos]);

  const name = (id: number) => surahs.find((s) => s.id === id)?.nameTransliteration ?? String(id);
  const arabicScope = scope === "arabic" || !translationId;

  return (
    <View style={{ flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>
        <Icon name="search" size={22} color={th.accentText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("searchPlaceholder")}
          placeholderTextColor={th.muted}
          accessibilityLabel={t("search")}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ flex: 1, minHeight: 48, color: th.text, fontSize: 16 }}
        />
      </View>
      <Segmented
        label={t("search")}
        value={arabicScope ? "arabic" : "translation"}
        onChange={(v) => setScope(v)}
        options={[{ value: "arabic", label: t("searchArabic") }, ...(translationId ? [{ value: "translation" as const, label: t("searchTranslation") }] : [])]}
      />
      {jump ? <View style={{ flexDirection: "row" }}><Button label={`${t("goTo")} ${jump.surahId}:${jump.ayahNumber}`} selected onPress={() => router.push(`/surah/${jump.surahId}?ayah=${jump.ayahNumber}`)} /></View> : null}
      <FlatList
        data={hits}
        keyExtractor={(h) => `${h.surahId}:${h.ayahNumber}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={query.trim() && !jump ? <Text style={{ color: th.muted, fontSize: 15 }}>{t("noResults")}</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name(item.surahId)} ${item.surahId}:${item.ayahNumber}`}
            onPress={() => router.push(`/surah/${item.surahId}?ayah=${item.ayahNumber}`)}
            style={{ flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: th.border }}
          >
            <StarBadge n={item.ayahNumber} size={38} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: th.muted, fontSize: 13, fontFamily: HEADING_FONT }}>{name(item.surahId)} · {item.surahId}:{item.ayahNumber}</Text>
              <Highlighted text={item.highlighted} color={th.text} accent={th.brassText} size={arabicScope ? 22 : 16} rtl={arabicScope} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
