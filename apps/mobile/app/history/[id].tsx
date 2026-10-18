import { ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AyahReport } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Button, Caption, Card, Chip } from "../../src/components/ui";
import { useAyahContextState, useEntitiesFor, useSurahHistoryState } from "../../src/knowledge/hooks";
import { Citation, ClaimCard, EntityLink, KIND_KEY } from "../../src/knowledge/parts";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

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

  const sectionTitle = (text: string) => (
    <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", marginTop: 8 }}>{text}</Text>
  );

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
        {surah ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: th.text, fontSize: 22, fontWeight: "700", fontFamily: HEADING_FONT }}>{surah.nameTransliteration}</Text>
            <Caption>{surah.nameEnglish}{order !== null ? ` · ${t("revelationOrder")}: ${order} / 114` : ""}</Caption>
          </View>
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
        {nothing && ayahNumber === null ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("histNothing")}</Text> : null}
        <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>{t("histFooter")}</Text>
      </ScrollView>
    </>
  );
}
