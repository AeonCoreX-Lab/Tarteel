import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { QURANPEDIA_BOOKS, QURANPEDIA_SITE, findQuranpediaBook } from "@tarteel/core";
import type { QuranpediaBook } from "@tarteel/core";
import type { Surah } from "@tarteel/types";
import { useEffect } from "react";
import { Button, Caption, Card, Row, ScreenScroll } from "../src/components/ui";
import { Hero, OrnamentDivider, SectionHeader, TextBlock } from "../src/components/Heritage";
import { HadithError } from "../src/hadith/parts";
import { useQuranpediaBook, useQuranpediaSurahInfo } from "../src/online/quranpedia";
import { QuranpediaCredit, QuranpediaGate, openQuranpediaSite } from "../src/online/quranpedia-parts";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { useTheme } from "../src/theme";

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: 44, maxWidth: 300, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surface, alignItems: "center", justifyContent: "center" }}
    >
      <Text numberOfLines={1} style={{ color: selected ? th.onAccent : th.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** The introduction and facts of the surah, with the server's own headings. Arabic. */
function SurahInfoView({ surah }: { surah: number }) {
  const t = useT();
  const { state, retry } = useQuranpediaSurahInfo(surah);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  return (
    <View style={{ gap: 16 }}>
      {state.value.sections.map((s) => (
        <TextBlock key={s.key} label={s.title} rtl>{s.text}</TextBlock>
      ))}
    </View>
  );
}

/** One book's passages for one ayah, with the author, page and part the server gives. */
function AyahView({ book, surah, ayah }: { book: QuranpediaBook; surah: number; ayah: number }) {
  const th = useTheme();
  const t = useT();
  const { state, retry } = useQuranpediaBook(book.id, surah, ayah, true);
  if (state.status === "error") {
    // A book with nothing on this ayah is an ordinary answer, not a failure.
    if (state.code === "not-found") return <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("qpNoEntry")}</Text>;
    return <HadithError state={state} retry={retry} />;
  }
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const a = state.value;
  return (
    <View style={{ gap: 16 }}>
      <Caption>{[a.bookName, a.author ? `${t("qpBy")} ${a.author}` : null].filter(Boolean).join(" · ")}</Caption>
      {a.passages.map((p, i) => (
        <View key={i} style={{ gap: 6 }}>
          <TextBlock label={[p.ayahs, p.part ? `${t("qpPart")} ${p.part}` : null, p.page ? `${t("qpPage")} ${p.page}` : null].filter(Boolean).join(" · ") || t(book.kind === "asbab" ? "qpAsbab" : "qpTafsir")} rtl>{p.text}</TextBlock>
        </View>
      ))}
    </View>
  );
}

/**
 * Classical tafsir and the reasons of revelation, live from Quranpedia.net: the introduction of a surah, then one ayah at a time
 * in a book the person picks. Reached from a surah's History page.
 */
export default function Quranpedia() {
  const params = useLocalSearchParams<{ surah?: string; ayah?: string }>();
  const t = useT();
  const th = useTheme();
  const { repos } = useApp();
  const lang = useSettings((s) => s.uiLanguage);
  const [surahId, setSurahId] = useState(() => Math.min(114, Math.max(1, Number(params.surah) || 1)));
  const [ayah, setAyah] = useState<number | null>(() => (params.ayah && Number(params.ayah) >= 1 ? Math.floor(Number(params.ayah)) : null));
  const [bookId, setBookId] = useState<number>(QURANPEDIA_BOOKS[0]?.id ?? 2919);
  const [surah, setSurah] = useState<Surah | undefined>();
  useEffect(() => {
    let cancelled = false;
    void repos.quran.getSurah(surahId).then((s) => !cancelled && setSurah(s));
    return () => { cancelled = true; };
  }, [repos, surahId]);
  const book = findQuranpediaBook(bookId) ?? QURANPEDIA_BOOKS[0];
  if (!book) return null;
  const count = surah?.ayahCount ?? 286;
  const title = surah ? surah.nameTransliteration : `${t("tfSurah")} ${surahId}`;
  const goSurah = (d: 1 | -1): void => {
    setSurahId((n) => Math.min(114, Math.max(1, n + d)));
    setAyah(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: t("qpTitle") }} />
      <ScreenScroll>
        <Hero title={title} subtitle={ayah !== null ? `${t("tfAyah")} ${ayah} · ${lang === "bn" ? book.title.bn : book.title.en}` : t("qpAboutSurah")} icon="books" />
        <QuranpediaGate>
          {ayah === null ? (
            <>
              <SectionHeader label={t("qpAboutSurah")} />
              <SurahInfoView surah={surahId} />
              <Card padding={14}>
                <View style={{ gap: 10 }}>
                  <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("qpReadByAyahBody")}</Text>
                  <View style={{ flexDirection: "row" }}>
                    <Button label={t("qpReadByAyah")} onPress={() => setAyah(1)} />
                  </View>
                </View>
              </Card>
            </>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {QURANPEDIA_BOOKS.map((b) => <Pill key={b.id} label={lang === "bn" ? b.title.bn : b.title.en} selected={b.id === book.id} onPress={() => setBookId(b.id)} />)}
              </ScrollView>
              <AyahView book={book} surah={surahId} ayah={ayah} />
            </>
          )}
          <Row>
            {ayah !== null ? (
              <>
                <Button label={t("tfPrevAyah")} onPress={() => setAyah((a) => Math.max(1, (a ?? 1) - 1))} />
                <Button label={t("tfNextAyah")} onPress={() => setAyah((a) => Math.min(count, (a ?? 0) + 1))} />
                <Button label={t("qpAboutSurah")} onPress={() => setAyah(null)} />
              </>
            ) : null}
            <Button label={t("previousSurah")} onPress={() => goSurah(-1)} />
            <Button label={t("nextSurah")} onPress={() => goSurah(1)} />
            <Button label={t("qpOpenSite")} hint={QURANPEDIA_SITE} onPress={() => openQuranpediaSite(QURANPEDIA_SITE)} />
          </Row>
        </QuranpediaGate>
        <OrnamentDivider margin={8} />
        <QuranpediaCredit />
        <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("qpEditionNote")}</Text>
      </ScreenScroll>
    </>
  );
}
