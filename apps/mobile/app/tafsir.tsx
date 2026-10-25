import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { findQuranEncEdition, quranEncEditionsFor, quranEncUrl } from "@tarteel/core";
import type { QuranEncAyah, QuranEncEdition } from "@tarteel/core";
import type { Surah } from "@tarteel/types";
import { Button, Caption, Card, Row, ScreenScroll } from "../src/components/ui";
import { ArabicFrame, Hero, OrnamentDivider, RowStar, TextBlock } from "../src/components/Heritage";
import { HadithError } from "../src/hadith/parts";
import { useQuranEncAya, useQuranEncSura } from "../src/online/quranenc";
import { QuranEncCredit, QuranEncGate, openSite } from "../src/online/quranenc-parts";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { useTheme } from "../src/theme";

const PAGE = 15;

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: 44, maxWidth: 280, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surface, alignItems: "center", justifyContent: "center" }}
    >
      <Text numberOfLines={1} style={{ color: selected ? th.onAccent : th.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** One ayah's tafsir, exactly as the publisher gives it. */
function AyahView({ edition, surah, ayah }: { edition: QuranEncEdition; surah: number; ayah: number }) {
  const t = useT();
  const { state, retry } = useQuranEncAya(edition.key, surah, ayah);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const a = state.value;
  const rtl = edition.language === "ar";
  return (
    <View style={{ gap: 16 }}>
      {a.arabic ? <ArabicFrame label={`${t("tfAyah")} ${a.aya}`}>{a.arabic}</ArabicFrame> : null}
      {a.range ? <Caption>{`${t("tfAyah")} ${a.range.from}–${a.range.to}`}</Caption> : null}
      {a.text ? <TextBlock label={t("tfText")} rtl={rtl}>{a.text}</TextBlock> : null}
      {a.footnotes ? <TextBlock label={t("tfNotes")} rtl={rtl}>{a.footnotes}</TextBlock> : null}
    </View>
  );
}

/** Every ayah of the surah in this edition, a few at a time; tapping one opens it. */
function SurahView({ edition, surah, onOpen }: { edition: QuranEncEdition; surah: number; onOpen: (aya: number) => void }) {
  const th = useTheme();
  const t = useT();
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [edition.key, surah]);
  const { state, retry } = useQuranEncSura(edition.key, surah, true);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const rows: QuranEncAyah[] = state.value;
  return (
    <View style={{ gap: 10 }}>
      <Caption>{`${t("tfSurahList")} (${rows.length})`}</Caption>
      {rows.slice(0, shown).map((a) => (
        <Pressable key={a.aya} accessibilityRole="button" accessibilityLabel={`${t("tfAyah")} ${a.aya}`} onPress={() => onOpen(a.aya)}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <RowStar n={a.range ? `${a.aya}–${a.range.to}` : a.aya} size={40} />
              <Text numberOfLines={3} style={{ flex: 1, color: th.text, fontSize: 15, lineHeight: 23, writingDirection: edition.language === "ar" ? "rtl" : "ltr", textAlign: "left" }}>{a.text ?? a.footnotes ?? ""}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
      {shown < rows.length ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hadLoadMore")} onPress={() => setShown((n) => n + PAGE)} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Tafsir, live from QuranEnc.com: one surah's ayahs, or one ayah, in an edition the person picks. Reached from a surah's History
 * page; the person steps between ayahs and surahs here.
 */
export default function Tafsir() {
  const params = useLocalSearchParams<{ surah?: string; ayah?: string }>();
  const t = useT();
  const th = useTheme();
  const { repos } = useApp();
  const lang = useSettings((s) => s.uiLanguage);
  const editions = quranEncEditionsFor(lang);
  const [surahId, setSurahId] = useState(() => Math.min(114, Math.max(1, Number(params.surah) || 1)));
  const [ayah, setAyah] = useState<number | null>(() => (params.ayah && Number(params.ayah) >= 1 ? Math.floor(Number(params.ayah)) : null));
  const [editionKey, setEditionKey] = useState<string>(() => editions[0]?.key ?? "english_saheeh");
  const [surah, setSurah] = useState<Surah | undefined>();
  useEffect(() => {
    let cancelled = false;
    void repos.quran.getSurah(surahId).then((s) => !cancelled && setSurah(s));
    return () => { cancelled = true; };
  }, [repos, surahId]);
  const edition = findQuranEncEdition(editionKey) ?? editions[0];
  if (!edition) return null;
  const count = surah?.ayahCount ?? 286;
  const title = surah ? surah.nameTransliteration : `${t("tfSurah")} ${surahId}`;
  const goSurah = (d: 1 | -1): void => {
    setSurahId((n) => Math.min(114, Math.max(1, n + d)));
    setAyah(null);
  };
  const site = quranEncUrl(edition.language, edition.key, surahId, ayah ?? undefined);

  return (
    <>
      <Stack.Screen options={{ title: t("tfTitle") }} />
      <ScreenScroll>
        <Hero title={title} subtitle={`${ayah !== null ? `${t("tfAyah")} ${ayah} · ` : ""}${lang === "bn" ? edition.title.bn : edition.title.en}`} icon="books" />
        <QuranEncGate>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {editions.map((e) => <Pill key={e.key} label={lang === "bn" ? e.title.bn : e.title.en} selected={e.key === edition.key} onPress={() => setEditionKey(e.key)} />)}
          </ScrollView>

          {ayah !== null ? <AyahView edition={edition} surah={surahId} ayah={ayah} /> : <SurahView edition={edition} surah={surahId} onOpen={setAyah} />}

          <Row>
            {ayah !== null ? (
              <>
                <Button label={t("tfPrevAyah")} onPress={() => setAyah((a) => Math.max(1, (a ?? 1) - 1))} />
                <Button label={t("tfNextAyah")} onPress={() => setAyah((a) => Math.min(count, (a ?? 0) + 1))} />
                <Button label={t("tfSurahList")} onPress={() => setAyah(null)} />
              </>
            ) : null}
            <Button label={t("previousSurah")} onPress={() => goSurah(-1)} />
            <Button label={t("nextSurah")} onPress={() => goSurah(1)} />
            {site ? <Button label={t("tfOpenSite")} hint={site} onPress={() => openSite(site)} /> : null}
          </Row>
        </QuranEncGate>
        <OrnamentDivider margin={8} />
        <QuranEncCredit edition={edition.key} />
        <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("tfEditionNote")}</Text>
      </ScreenScroll>
    </>
  );
}
