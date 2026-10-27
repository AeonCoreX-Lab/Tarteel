import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { Bookmark, Surah } from "@tarteel/types";
import { Icon } from "../../src/components/Icons";
import { StarBadge } from "../../src/components/Ornaments";
import { Button, Heading } from "../../src/components/ui";
import { useApp } from "../../src/state/app";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

export default function BookmarksTab() {
  const { repos } = useApp();
  const router = useRouter();
  const th = useTheme();
  const t = useT();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);

  const load = useCallback(async () => setItems(await repos.bookmarks.list(500)), [repos]);
  useEffect(() => { void repos.quran.getSurahs().then(setSurahs); }, [repos]);
  // A tab stays mounted while another screen is on top of it, so loading once on mount showed a bookmark only after the
  // app was reopened. Reload every time this tab comes into focus (and again when the app returns from the background).
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const name = (id: number) => surahs.find((s) => s.id === id)?.nameTransliteration ?? String(id);

  return (
    <FlatList
      data={items}
      keyExtractor={(b) => String(b.id)}
      contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
      ListHeaderComponent={<View style={{ paddingBottom: 12 }}><Heading size={30}>{t("bookmarks")}</Heading></View>}
      ListEmptyComponent={
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 56 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: th.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
            <Icon name="bookmark" size={34} color={th.brassText} />
          </View>
          <Heading size={20} align="center">{t("noBookmarksTitle")}</Heading>
          <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 }}>{t("noBookmarks")}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, borderBottomWidth: 1, borderBottomColor: th.border }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name(item.surahId)} ${item.surahId}:${item.ayahNumber}`}
            onPress={() => router.push(`/surah/${item.surahId}?ayah=${item.ayahNumber}`)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
          >
            <StarBadge n={item.ayahNumber} size={42} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{name(item.surahId)}</Text>
              <Text style={{ color: th.muted, fontSize: 13 }}>{item.surahId}:{item.ayahNumber}{item.note ? ` · ${item.note}` : ""}</Text>
            </View>
          </Pressable>
          <Button label={t("remove")} onPress={() => void repos.bookmarks.remove(item).then(load)} />
        </View>
      )}
    />
  );
}
