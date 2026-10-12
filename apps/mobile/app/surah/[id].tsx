import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { ViewToken } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AyahWithTranslation, Surah } from "@tarteel/types";
import { Icon } from "../../src/components/Icons";
import { StarBadge } from "../../src/components/Ornaments";
import { Caption, Segmented } from "../../src/components/ui";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";
import type { Theme } from "../../src/theme";

// The reader is the quietest surface in the app: no pattern, no gradient, only the text, its number and one action.
interface RowProps {
  item: AyahWithTranslation;
  bookmarked: boolean;
  showArabic: boolean;
  showTranslation: boolean;
  arabicSize: number;
  translationSize: number;
  lineSpacing: number;
  th: Theme;
  labels: { bookmark: string; bookmarked: string; ayah: string };
  onToggle: (a: AyahWithTranslation) => void;
}

const AyahRow = memo(function AyahRow(p: RowProps) {
  const { item, th } = p;
  return (
    <View style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: th.border, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <StarBadge n={item.ayahNumber} size={38} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${p.bookmarked ? p.labels.bookmarked : p.labels.bookmark}, ${p.labels.ayah} ${item.ayahNumber}`}
          accessibilityState={{ selected: p.bookmarked }}
          onPress={() => p.onToggle(item)}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 }}
        >
          <Icon name="bookmark" size={20} color={p.bookmarked ? th.brassText : th.muted} strokeWidth={p.bookmarked ? 2.4 : 1.8} />
          <Text style={{ color: p.bookmarked ? th.brassText : th.muted, fontSize: 13, fontWeight: "600" }}>{p.bookmarked ? p.labels.bookmarked : p.labels.bookmark}</Text>
        </Pressable>
      </View>
      {p.showArabic ? (
        <Text selectable style={{ color: th.text, fontSize: p.arabicSize, lineHeight: p.arabicSize * p.lineSpacing, textAlign: "right", writingDirection: "rtl" }}>
          {item.textArabic}
        </Text>
      ) : null}
      {p.showTranslation && item.translation ? (
        <Text selectable style={{ color: p.showArabic ? th.muted : th.text, fontSize: p.translationSize, lineHeight: p.translationSize * 1.55 }}>
          {item.translation}
        </Text>
      ) : null}
    </View>
  );
});

export default function SurahScreen() {
  const { id, ayah } = useLocalSearchParams<{ id: string; ayah?: string }>();
  const surahId = Number(id);
  const { repos, progress } = useApp();
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const [surah, setSurah] = useState<Surah | undefined>();
  const [ayahs, setAyahs] = useState<AyahWithTranslation[]>([]);
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const listRef = useRef<FlatList<AyahWithTranslation>>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repos.quran.getSurah(surahId),
      repos.quran.getSurahAyahs(surahId, s.readerMode === "arabic" ? null : s.selectedTranslationId),
      repos.bookmarks.listForSurah(surahId),
    ]).then(([su, list, bm]) => {
      if (cancelled) return;
      setSurah(su);
      setAyahs(list);
      setMarks(bm);
    });
    return () => { cancelled = true; };
  }, [repos, surahId, s.selectedTranslationId, s.readerMode]);

  const toggle = useCallback(async (a: AyahWithTranslation) => {
    const ref = { surahId: a.surahId, ayahNumber: a.ayahNumber };
    if (await repos.bookmarks.isBookmarked(ref)) await repos.bookmarks.remove(ref);
    else await repos.bookmarks.add(ref);
    setMarks(await repos.bookmarks.listForSurah(a.surahId));
  }, [repos]);

  // Last-read: the pointer is updated after the reader dwells ~3s on an ayah (no scroll spam in history).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.item as AyahWithTranslation | undefined;
    if (!first) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void progressRef.current.recordRead({ surahId: first.surahId, ayahNumber: first.ayahNumber });
    }, 3000);
  }).current;

  const startIndex = ayah ? Math.max(0, Number(ayah) - 1) : 0;
  const showArabic = s.readerMode !== "translation";
  const showTranslation = s.readerMode !== "arabic" && s.selectedTranslationId !== null;

  const header = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      {surah ? (
        <View style={{ alignItems: "center", gap: 4, paddingVertical: 18, borderRadius: 18, borderWidth: 1, borderColor: th.brass, backgroundColor: th.surface }}>
          <View style={{ position: "absolute", top: 5, bottom: 5, left: 5, right: 5, borderRadius: 14, borderWidth: 1, borderColor: th.border }} />
          <Text style={{ color: th.text, fontSize: 34, writingDirection: "rtl" }}>{surah.nameArabic}</Text>
          <Text style={{ color: th.text, fontSize: 20, fontWeight: "700", fontFamily: HEADING_FONT }}>{surah.nameTransliteration}</Text>
          <Caption>{surah.nameEnglish} · {surah.ayahCount} {t("verses")} · {t(surah.revelationPlace)}</Caption>
        </View>
      ) : null}
      <Segmented
        label={t("readerMode")}
        value={s.readerMode}
        onChange={(v) => s.set("readerMode", v)}
        options={[{ value: "arabic", label: t("arabicOnly") }, { value: "translation", label: t("translationOnly") }, { value: "both", label: t("both") }]}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: surah?.nameTransliteration ?? "" }} />
      <FlatList
        ref={listRef}
        data={ayahs}
        keyExtractor={(a) => String(a.ayahNumber)}
        extraData={marks}
        ListHeaderComponent={header}
        contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        initialNumToRender={12}
        windowSize={9}
        initialScrollIndex={ayahs.length > startIndex && startIndex > 0 ? startIndex : undefined}
        onScrollToIndexFailed={(info: { averageItemLength: number; index: number }) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        }}
        viewabilityConfig={viewability}
        onViewableItemsChanged={onViewable}
        renderItem={({ item }: { item: AyahWithTranslation }) => (
          <AyahRow
            item={item}
            bookmarked={marks.has(item.ayahNumber)}
            showArabic={showArabic}
            showTranslation={showTranslation}
            arabicSize={s.arabicFontSize}
            translationSize={s.translationFontSize}
            lineSpacing={s.lineSpacing}
            th={th}
            labels={{ bookmark: t("bookmark"), bookmarked: t("bookmarked"), ayah: t("ayah") }}
            onToggle={toggle}
          />
        )}
      />
    </>
  );
}
