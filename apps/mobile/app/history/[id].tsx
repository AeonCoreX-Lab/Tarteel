import { ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { wikiSurahQuery } from "@tarteel/core";
import type { AyahReport } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Button, Caption, Card, Chip } from "../../src/components/ui";
import { Hero, IconStar, ListRow, OrnamentDivider, SectionHeader } from "../../src/components/Heritage";
import { useAyahContextState, useEntitiesFor, usePackDiagnosis, useSurahHistoryState } from "../../src/knowledge/hooks";
import { Citation, ClaimCard, EntityLink, KIND_KEY } from "../../src/knowledge/parts";
import { WikiLookupCard } from "../../src/online/wiki-parts";
import { quranEncEnabled, quranpediaEnabled } from "../../src/online/runtime";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

/**
 * History and context for a surah, and for one ayah when `?ayah=` is given. Everything shown comes from an installed pack
 * and carries its evidence label and its sources. Nothing on this screen is a ruling: the footer says so.
 */
export default function HistoryScreen() {
  const { id, ayah } = useLocalSearchParams<{ id: string; ayah?: string }>();
  const surahId = Number(id);
  const ayahNumber = ayah ? Number(ayah) : null;
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.uiLanguage);
  const { repos } = useApp();
  const [surah, setSurah] = useState<Surah | undefined>();
  const [order, setOrder] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([repos.quran.getSurah(surahId), repos.quran.getSurahProfile(surahId)]).then(([s, p]) => {
      if (cancelled) return;
      setSurah(s);
      setOrder(p?.revelationOrder ?? null);
    });
    return () => { cancelled = true; };
  }, [repos, surahId]);
  const historyQ = useSurahHistoryState(surahId, lang);
  const contextQ = useAyahContextState(surahId, ayahNumber, lang);
  const entitiesQ = useEntitiesFor(surahId, ayahNumber, lang);
  const packsQ = usePackDiagnosis();
  const packsInstalled = packsQ.state.status === "ready" && packsQ.state.value.installed > 0;
  const linked = entitiesQ.state.status === "ready" ? entitiesQ.state.value : [];
  const history = historyQ.state.status === "ready" ? historyQ.state.value : null;
  const context = contextQ.state.status === "ready" ? contextQ.state.value : null;
  const loading = historyQ.state.status === "loading" || contextQ.state.status === "loading" || entitiesQ.state.status === "loading";
  const failed = historyQ.state.status === "error" || contextQ.state.status === "error" || entitiesQ.state.status === "error";
  const retry = (): void => {
    historyQ.retry();
    contextQ.retry();
    entitiesQ.retry();
  };

  const sectionTitle = (text: string) => <SectionHeader label={text} />;

  const reportCard = (r: AyahReport) => (
    <Card key={r.key} padding={14}>
      <View style={{ gap: 8 }}>
        <Chip label={t(r.kind === "tafsir" ? "histTafsir" : "histReport")} tone="muted" />
        <Citation c={r.source} />
      </View>
    </Card>
  );

  const ayahEmpty = ayahNumber !== null && context !== null && context.claims.length === 0 && context.reports.length === 0 && linked.length === 0;
  const nothing = !loading && !failed && history !== null && history.length === 0 && linked.length === 0 && (context === null || (context.claims.length === 0 && context.reports.length === 0));

  return (
    <>
      <Stack.Screen options={{ title: t("historyTitle") }} />
      <ScrollView contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {surah ? <Hero title={surah.nameTransliteration} subtitle={`${surah.nameEnglish}${order !== null ? ` · ${t("revelationOrder")}: ${order} / 114` : ""}`} icon="quran" /> : null}

        {/* Tafsir is offered whatever the packs hold: it is a different kind of source (a book's own words) from a pack's claims. */}
        {surah && quranEncEnabled ? (
          <ListRow
            title={t("tfTitle")}
            subtitle={t("tfHistoryBody")}
            lead={<IconStar icon="books" />}
            onPress={() => router.push(`/tafsir?surah=${surah.id}${ayahNumber !== null ? `&ayah=${ayahNumber}` : ""}`)}
          />
        ) : null}

        {surah && quranpediaEnabled ? (
          <ListRow
            title={t("qpTitle")}
            subtitle={t("qpHistoryBody")}
            lead={<IconStar icon="books" />}
            onPress={() => router.push(`/quranpedia?surah=${surah.id}${ayahNumber !== null ? `&ayah=${ayahNumber}` : ""}`)}
          />
        ) : null}

        {ayahNumber !== null && context && (context.claims.length > 0 || context.reports.length > 0) ? (
          <>
            {sectionTitle(`${t("histAyahTitle")} ${ayahNumber}`)}
            {context.claims.map((c) => <ClaimCard key={c.key} c={c} />)}
            {context.reports.length > 0 ? sectionTitle(t("histReports")) : null}
            {context.reports.map(reportCard)}
          </>
        ) : null}

        {history && history.length > 0 ? (
          <>
            {sectionTitle(t("histAboutSurah"))}
            {history.map((c) => <ClaimCard key={c.key} c={c} />)}
          </>
        ) : null}

        {linked.length > 0 ? (
          <>
            {sectionTitle(t("histEntities"))}
            <Card padding={14}>
              <View style={{ gap: 2 }}>
                {linked.map((e) => (
                  <View key={e.key} style={{ gap: 0 }}>
                    <Caption>{t(KIND_KEY[e.kind])}</Caption>
                    <EntityLink e={e} />
                  </View>
                ))}
              </View>
            </Card>
          </>
        ) : null}

        {loading ? <Caption>{t("knowLoading")}</Caption> : null}
        {failed ? (
          <Card padding={16}>
            <View style={{ gap: 12 }}>
              <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("knowLoadFailed")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Button label={t("knowRetry")} onPress={retry} />
              </View>
            </View>
          </Card>
        ) : null}
        {/* An ayah with nothing installed is said plainly, and not worded as a finding that nothing is known. */}
        {!loading && !failed && ayahEmpty ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("histNoneForAyah")}</Text> : null}
        {nothing && ayahNumber === null ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t(packsInstalled ? "histNothingInstalled" : "histNothing")}</Text> : null}
        {/* Where the installed packs have nothing for this surah or ayah, background can be searched live (and only if the person allows it). */}
        {surah && !loading && !failed && (nothing || ayahEmpty) ? (
          <WikiLookupCard build={(l) => wikiSurahQuery(l, surah)} queryKey={`surah:${surah.id}`} />
        ) : null}
        <OrnamentDivider margin={8} />
        <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("histFooter")}</Text>
      </ScrollView>
    </>
  );
}
