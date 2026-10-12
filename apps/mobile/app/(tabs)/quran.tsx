import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Surah } from "@tarteel/types";
import { MARKS } from "../../src/brand";
import { Icon } from "../../src/components/Icons";
import { StarBadge } from "../../src/components/Ornaments";
import { Caption, Card, Heading } from "../../src/components/ui";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function QuranTab() {
  const { repos } = useApp();
  const router = useRouter();
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const lastRead = useSettings((s) => s.lastRead);
  const [surahs, setSurahs] = useState<Surah[]>([]);

  useEffect(() => void repos.quran.getSurahs().then(setSurahs), [repos]);
  const lastSurah = lastRead ? surahs.find((s) => s.id === lastRead.surahId) : undefined;

  const header = (
    <View style={{ gap: 16, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Heading size={30}>{t("quran")}</Heading>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("search")}
          onPress={() => router.push("/search")}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}
        >
          <Icon name="search" size={20} color={th.accentText} />
          <Text style={{ color: th.text, fontSize: 14, fontWeight: "600" }}>{t("search")}</Text>
        </Pressable>
      </View>

      {lastRead && lastSurah ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("continueReading")}: ${lastSurah.nameTransliteration}, ${t("ayah")} ${lastRead.ayahNumber}`}
          onPress={() => router.push(`/surah/${lastRead.surahId}?ayah=${lastRead.ayahNumber}`)}
        >
          <Card tone="accent" pattern padding={18}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: th.onAccent, fontSize: 13, opacity: 0.9 }}>{t("continueReading")}</Text>
                <Text style={{ color: th.onAccent, fontSize: 24, fontWeight: "700", fontFamily: HEADING_FONT }}>{lastSurah.nameTransliteration}</Text>
                <Text style={{ color: th.onAccent, fontSize: 14, opacity: 0.9 }}>{t("ayah")} {lastRead.ayahNumber}</Text>
              </View>
              <Text style={{ color: th.onAccent, fontSize: 34, writingDirection: "rtl" }}>{lastSurah.nameArabic}</Text>
            </View>
          </Card>
        </Pressable>
      ) : null}

      {surahs.length > 0 ? <Caption>{t("surahsLabel")} · {surahs.length}</Caption> : null}
    </View>
  );

  return (
    <FlatList
      data={surahs}
      keyExtractor={(s) => String(s.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 48 }}>
          <Image source={th.dark ? MARKS.light : MARKS.color} accessibilityIgnoresInvertColors style={{ width: 96, height: 96, opacity: 0.9 }} resizeMode="contain" />
          <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 }}>{t("noQuranData")}</Text>
        </View>
      }
      contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingTop: insets.top + 12, paddingBottom: 28 }}
      initialNumToRender={20}
      windowSize={7}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.id}. ${item.nameTransliteration}, ${item.nameEnglish}, ${item.ayahCount} ${t("verses")}`}
          onPress={() => router.push(`/surah/${item.id}`)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, borderBottomWidth: 1, borderBottomColor: th.border, opacity: pressed ? 0.8 : 1 })}
        >
          <StarBadge n={item.id} size={42} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{item.nameTransliteration}</Text>
            <Text style={{ color: th.muted, fontSize: 13 }}>{item.nameEnglish} · {item.ayahCount} {t("verses")} · {t(item.revelationPlace)}</Text>
          </View>
          <Text style={{ color: th.text, fontSize: 24, writingDirection: "rtl" }}>{item.nameArabic}</Text>
        </Pressable>
      )}
    />
  );
}
