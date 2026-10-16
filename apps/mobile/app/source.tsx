import { ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { locatorParts } from "@tarteel/database";
import type { HistoryClaim, SourceCitation } from "@tarteel/database";
import { Caption, Card, Chip } from "../src/components/ui";
import { useSourceDetail } from "../src/knowledge/hooks";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import type { StringKey } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

const LOCATOR_KEY: Record<keyof SourceCitation["locator"], StringKey> = {
  volume: "locVolume", page: "locPage", chapter: "locChapter", section: "locSection", reportNumber: "locReport", hadithNumber: "locHadith",
};
const REDIST_KEY: Record<string, StringKey> = { yes: "srcRedistYes", no: "srcRedistNo", pending: "srcRedistPending" };

/**
 * One source: the work, the edition, the licence and credit line, the passages that claims cite, and the claims themselves.
 * Opened from any citation. It shows only what the installed pack says, and makes no network request: the address of an
 * edition is shown as text, never opened automatically.
 */
export default function SourceScreen() {
  const { pack, passage } = useLocalSearchParams<{ pack: string; passage: string }>();
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.uiLanguage);
  const d = useSourceDetail(String(pack), String(passage), lang);

  const field = (label: StringKey, value: string | null | undefined) =>
    value ? (
      <View key={label} style={{ gap: 1 }}>
        <Caption>{t(label)}</Caption>
        <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{value}</Text>
      </View>
    ) : null;

  const claim = (c: HistoryClaim) => (
    <Card key={c.key} padding={12}>
      <View style={{ gap: 6 }}>
        <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{c.text}</Text>
        {c.textStatus === "machine_draft" ? <Text style={{ color: th.text, fontSize: 12, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
      </View>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: t("srcTitle") }} />
      <ScrollView contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {d === null ? (
          <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("srcNotFound")}</Text>
        ) : (
          <>
            <Card padding={14}>
              <View style={{ gap: 8 }}>
                <Text selectable style={{ color: th.text, fontSize: 18, fontWeight: "700", fontFamily: HEADING_FONT }}>{d.work.title}</Text>
                {d.work.titleArabic ? <Text selectable style={{ color: th.text, fontSize: 18, writingDirection: "rtl", textAlign: "left" }}>{d.work.titleArabic}</Text> : null}
                {field("srcWork", d.work.author)}
                {field("srcEdition", d.edition.label)}
                {field("srcEditor", d.edition.editor)}
                {field("srcPublisher", d.edition.publisher)}
                {field("srcPublished", d.edition.published)}
                {field("srcIdentifier", d.edition.identifier)}
                {field("srcAddress", d.edition.url)}
                {d.edition.transcriptionStatus !== "verified" ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histUnverifiedSource")}</Text> : null}
                {field("srcReviewedOn", d.edition.reviewedOn)}
              </View>
            </Card>

            <Card padding={14}>
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="header" style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("srcLicence")}</Text>
                <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{d.license.name}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Chip label={`${t("srcRedistribution")}: ${t(REDIST_KEY[d.license.redistribution] ?? "srcRedistPending")}`} tone="muted" />
                  {d.license.nonCommercialOnly ? <Chip label={t("srcNonCommercial")} tone="brass" /> : null}
                  {d.license.shareAlike ? <Chip label={t("srcShareAlike")} tone="brass" /> : null}
                </View>
                <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{d.license.attribution}</Text>
                {field("srcTerms", d.license.termsNote)}
                {field("srcAddress", d.license.url)}
              </View>
            </Card>

            {d.passages.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>{t("srcCited")}</Text>
                {d.passages.map((p) => (
                  <Text key={p.passageId} selectable style={{ color: th.text, fontSize: 13, lineHeight: 19 }}>
                    {locatorParts(p.locator).map((x) => `${t(LOCATOR_KEY[x.kind])} ${x.value}`).join(", ") || p.passageId}
                  </Text>
                ))}
              </View>
            ) : null}

            {d.citedBy.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>{t("srcCitedBy")}</Text>
                {d.citedBy.map(claim)}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}
