import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { ViewToken } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AyahWithTranslation, Surah } from "@tarteel/types";
import { followTarget } from "@tarteel/audio";
import { opensWithBismillahHeading } from "@tarteel/quran-data";
import { RecitedArabic } from "../../src/audio/RecitedArabic";
import { SurahAudio } from "../../src/audio/SurahAudio";
import { usePlaybackStatus } from "../../src/audio/hooks";
import { audio, RECITERS } from "../../src/audio/runtime";
import { BismillahHeading } from "../../src/components/BismillahHeading";
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
  labels: { bookmark: string; bookmarked: string; ayah: string; playAyah: string };
  onToggle: (a: AyahWithTranslation) => void;
  /** This ayah is being recited right now. */
  recited: boolean;
  /** Absent when the build offers no recitation. */
  onPlay?: (a: AyahWithTranslation) => void;
}

const AyahRow = memo(function AyahRow(p: RowProps) {
  const { item, th } = p;
  const arabicStyle = { color: th.text, fontSize: p.arabicSize, lineHeight: p.arabicSize * p.lineSpacing, textAlign: "right", writingDirection: "rtl" } as const;
  return (
    <View style={{ paddingVertical: 18, paddingHorizontal: p.recited ? 10 : 0, borderBottomWidth: 1, borderBottomColor: th.border, gap: 12, borderLeftWidth: p.recited ? 3 : 0, borderLeftColor: th.brass, backgroundColor: p.recited ? th.surfaceAlt : undefined }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <StarBadge n={item.ayahNumber} size={38} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
        {p.onPlay ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.labels.playAyah}, ${p.labels.ayah} ${item.ayahNumber}`}
            onPress={() => p.onPlay?.(item)}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 }}
          >
            <Text style={{ color: th.accentText, fontSize: 16, fontWeight: "700" }}>▶</Text>
            <Text style={{ color: th.accentText, fontSize: 13, fontWeight: "600" }}>{p.labels.playAyah}</Text>
          </Pressable>
        ) : null}
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
        p.recited && p.onPlay ? (
          <RecitedArabic
            ayah={{ surahId: item.surahId, ayahNumber: item.ayahNumber }}
            text={item.textArabic}
            style={arabicStyle}
            lit={{ backgroundColor: `${th.brass}59`, color: th.text }}
          />
        ) : (
          <Text selectable style={arabicStyle}>
            {item.textArabic}
          </Text>
        )
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
  // Ayah 1:1, shown as the heading of surahs 2-114 (except 9), whose own first ayah does not carry the Bismillah.
  const [bismillah, setBismillah] = useState<AyahWithTranslation | undefined>();
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const listRef = useRef<FlatList<AyahWithTranslation>>(null);
  const status = usePlaybackStatus();
  const recitedAyah = status.active;
  // The list follows the recitation until the reader scrolls by hand; "Follow recitation" (or playing an ayah) resumes it.
  const [following, setFollowing] = useState(true);
  const lastScrolled = useRef(-1);
  const playFrom = useCallback((a: AyahWithTranslation) => {
    setFollowing(true);
    lastScrolled.current = -1;
    void audio.controller.playFromAyah({ surahId: a.surahId, ayahNumber: a.ayahNumber });
  }, []);
  const recitingHere = status.playing && status.active?.surahId === surahId;
  const target = followTarget({ following, playing: status.playing, active: status.active, surahId, lastScrolled: lastScrolled.current });
  useEffect(() => {
    if (target === null || target >= ayahs.length) return;
    lastScrolled.current = target;
    listRef.current?.scrollToIndex({ index: target, viewPosition: 0.3, animated: true });
  }, [target, ayahs.length]);
  const followNow = useCallback(() => {
    lastScrolled.current = -1;
    setFollowing(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const translationId = s.readerMode === "arabic" ? null : s.selectedTranslationId;
    void Promise.all([
      repos.quran.getSurah(surahId),
      repos.quran.getSurahAyahs(surahId, translationId),
      repos.bookmarks.listForSurah(surahId),
      opensWithBismillahHeading(surahId) ? repos.quran.getAyah({ surahId: 1, ayahNumber: 1 }, translationId) : Promise.resolve(undefined),
    ]).then(([su, list, bm, bism]) => {
      if (cancelled) return;
      setSurah(su);
      setAyahs(list);
      setMarks(bm);
      setBismillah(bism);
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
      <SurahAudio surahId={surahId} />
      <Segmented
        label={t("readerMode")}
        value={s.readerMode}
        onChange={(v) => s.set("readerMode", v)}
        options={[{ value: "arabic", label: t("arabicOnly") }, { value: "translation", label: t("translationOnly") }, { value: "both", label: t("both") }]}
      />
      {bismillah ? (
        <BismillahHeading ayah={bismillah} showArabic={showArabic} showTranslation={showTranslation} arabicSize={s.arabicFontSize} translationSize={s.translationFontSize} lineSpacing={s.lineSpacing} th={th} recited={status.active?.surahId === surahId && status.active.ayahNumber === 0} />
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: surah?.nameTransliteration ?? "" }} />
      <FlatList
        ref={listRef}
        data={ayahs}
        keyExtractor={(a) => String(a.ayahNumber)}
        extraData={[marks, recitedAyah]}
        ListHeaderComponent={header}
        contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        initialNumToRender={12}
        windowSize={9}
        initialScrollIndex={ayahs.length > startIndex && startIndex > 0 ? startIndex : undefined}
        onScrollToIndexFailed={(info: { averageItemLength: number; index: number }) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        }}
        onScrollBeginDrag={() => setFollowing(false)}
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
            labels={{ bookmark: t("bookmark"), bookmarked: t("bookmarked"), ayah: t("ayah"), playAyah: t("playAyah") }}
            onToggle={toggle}
            recited={recitedAyah?.surahId === item.surahId && recitedAyah.ayahNumber === item.ayahNumber}
            onPlay={RECITERS.length > 0 ? playFrom : undefined}
          />
        )}
      />
      {recitingHere && !following ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("followRecitation")}
          onPress={followNow}
          style={{ position: "absolute", alignSelf: "center", top: 12, minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 22, backgroundColor: th.accent, borderWidth: 1, borderColor: th.brass }}
        >
          <Text style={{ color: th.onAccent, fontWeight: "700", fontSize: 14 }}>{t("followRecitation")}</Text>
        </Pressable>
      ) : null}
    </>
  );
}
