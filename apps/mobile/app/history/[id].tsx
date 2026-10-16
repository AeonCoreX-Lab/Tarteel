import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { locatorParts } from "@tarteel/database";
import type { AyahReport, HistoryClaim, SourceCitation } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Caption, Card, Chip } from "../../src/components/ui";
import { useAyahContext, useSurahHistory } from "../../src/knowledge/hooks";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import type { StringKey } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

const EVIDENCE_KEY: Record<HistoryClaim["evidenceLabel"], StringKey> = {
  primary_text: "evPrimaryText",
  source_reported: "evSourceReported",
  scholarly_interpretation: "evScholarly",
  disputed: "evDisputed",
  unverified: "evUnverified",
  no_established_report_found: "evNoReport",
};
const LOCATOR_KEY: Record<keyof SourceCitation["locator"], StringKey> = {
  volume: "locVolume", page: "locPage", chapter: "locChapter", section: "locSection", reportNumber: "locReport", hadithNumber: "locHadith",
};

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
  const router = useRouter();
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
  const history = useSurahHistory(surahId, lang);
  const context = useAyahContext(surahId, ayahNumber, lang);

  const sectionTitle = (text: string) => (
    <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", marginTop: 8 }}>{text}</Text>
  );

  const cite = (c: SourceCitation) => {
    const where = locatorParts(c.locator).map((p) => `${t(LOCATOR_KEY[p.kind])} ${p.value}`).join(", ");
    return (
      <View key={c.passageId} style={{ gap: 2 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t("srcOpen")}: ${c.workTitle}`}
          onPress={() => router.push({ pathname: "/source", params: { pack: c.packId, passage: c.passageId } })}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: th.accentText, fontSize: 13, lineHeight: 19, textDecorationLine: "underline" }}>
            {c.workTitle}{c.author ? ` (${c.author})` : ""} · {c.edition}{where ? ` · ${where}` : ""}
          </Text>
        </Pressable>
        {c.transcriptionStatus !== "verified" ? <Caption>{t("histUnverifiedSource")}</Caption> : null}
        {c.quote ? <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19, fontStyle: "italic" }}>“{c.quote}”</Text> : null}
        <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{c.attribution}</Text>
      </View>
    );
  };

  const claimCard = (c: HistoryClaim) => (
    <Card key={c.key} padding={14}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label={t(EVIDENCE_KEY[c.evidenceLabel])} tone={c.evidenceLabel === "disputed" || c.evidenceLabel === "unverified" ? "brass" : "muted"} />
        </View>
        <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 24 }}>{c.text}</Text>
        {c.textStatus === "machine_draft" ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
        {c.textLang !== lang ? <Caption>{t("histOtherLanguage")}</Caption> : null}
        {c.uncertaintyNote ? (
          <View style={{ gap: 2 }}>
            <Caption>{t("histUncertainty")}</Caption>
            <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{c.uncertaintyNote}</Text>
          </View>
        ) : null}
        {c.editorialBasis ? (
          <View style={{ gap: 2 }}>
            <Caption>{t("histBasis")}</Caption>
            <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{c.editorialBasis}</Text>
          </View>
        ) : null}
        {c.supports.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Caption>{t("histSources")}</Caption>
            {c.supports.map(cite)}
          </View>
        ) : null}
        {c.contradicts.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Caption>{t("histDisagree")}</Caption>
            {c.contradicts.map(cite)}
          </View>
        ) : null}
        {c.lastReviewedAt ? <Caption>{t("histReviewed")}: {c.lastReviewedAt}</Caption> : null}
      </View>
    </Card>
  );

  const reportCard = (r: AyahReport) => (
    <Card key={r.key} padding={14}>
      <View style={{ gap: 8 }}>
        <Chip label={t(r.kind === "tafsir" ? "histTafsir" : "histReport")} tone="muted" />
        {cite(r.source)}
      </View>
    </Card>
  );

  const nothing = history !== null && history.length === 0 && (context === null || (context.claims.length === 0 && context.reports.length === 0));

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
            {context.claims.map(claimCard)}
            {context.reports.length > 0 ? sectionTitle(t("histReports")) : null}
            {context.reports.map(reportCard)}
          </>
        ) : null}

        {history && history.length > 0 ? (
          <>
            {sectionTitle(t("histAboutSurah"))}
            {history.map(claimCard)}
          </>
        ) : null}

        {nothing ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("histNothing")}</Text> : null}
        <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>{t("histFooter")}</Text>
      </ScrollView>
    </>
  );
}
