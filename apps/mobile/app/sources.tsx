import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { providersFor } from "@tarteel/core";
import type { SourceProvider } from "@tarteel/core";
import { Button, Caption, Card, Chip, Row, ScreenScroll, Segmented } from "../src/components/ui";
import { Hero, OrnamentDivider } from "../src/components/Heritage";
import { hadeethEncEnabled, hadithEnabled } from "../src/hadith/runtime";
import { knowledgeConfigured } from "../src/knowledge/runtime";
import { quranEncEnabled, quranpediaEnabled, wikipediaEnabled } from "../src/online/runtime";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/** Whether this build carries each source at all. A source that is not in the build has no screen and makes no request. */
const IN_BUILD: Record<string, boolean> = { hadeethenc: hadeethEncEnabled, sunnah: hadithEnabled, wikipedia: wikipediaEnabled, quranenc: quranEncEnabled, quranpedia: quranpediaEnabled, packs: knowledgeConfigured };

function Provider({ p }: { p: SourceProvider }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const lang = useSettings((s) => s.uiLanguage);
  const set = useSettings((s) => s.set);
  const on = useSettings((s) => (p.settingKey ? s[p.settingKey] : false));
  const bn = lang === "bn";
  const inBuild = IN_BUILD[p.id] === true;
  const usable = p.status === "allowed" && inBuild;
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={{ color: th.text, fontSize: 19, fontWeight: "700", fontFamily: HEADING_FONT }}>{bn ? p.name.bn : p.name.en}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label={p.mode === "live" ? t("srcLive") : t("srcPack")} tone="muted" />
          <Chip label={p.licence} tone="muted" />
          {p.status === "pending-permission" ? <Chip label={t("srcPending")} tone="brass" /> : !inBuild ? <Chip label={t("srcNotInBuild")} tone="brass" /> : null}
        </View>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{bn ? p.about.bn : p.about.en}</Text>
        <View style={{ gap: 2 }}>
          <Caption>{t("srcSends")}</Caption>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{bn ? p.sends.bn : p.sends.en}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Caption>{t("srcPublisher")}</Caption>
          <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{p.publisher}</Text>
        </View>
        {usable && p.settingKey ? (
          <Segmented label={bn ? p.name.bn : p.name.en} value={on ? 1 : 0} onChange={(v) => set(p.settingKey as NonNullable<SourceProvider["settingKey"]>, v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]} />
        ) : null}
        <Row>
          {usable && p.route ? <Button label={t("srcGo")} onPress={() => router.push(p.route as never)} /> : null}
          <Button label={t("srcWebsite")} hint={p.siteUrl} onPress={() => void Linking.openURL(p.siteUrl)} />
        </Row>
      </View>
    </Card>
  );
}

/** One page for each kind of source (hadith, history): what each is, its terms, what it sends, and whether it is on. */
export default function Sources() {
  const { domain } = useLocalSearchParams<{ domain?: string }>();
  const t = useT();
  const d = domain === "hadith" ? "hadith" : "history";
  const title = d === "hadith" ? t("srcHadithTitle") : t("srcHistoryTitle");
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScreenScroll>
        <Hero title={title} subtitle={d === "hadith" ? t("srcHadithIntro") : t("srcHistoryIntro")} icon="books" />
        {providersFor(d).map((p) => <Provider key={p.id} p={p} />)}
        <OrnamentDivider margin={8} />
        <SourcesNote />
      </ScreenScroll>
    </>
  );
}

function SourcesNote() {
  const th = useTheme();
  const t = useT();
  return <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("srcNote")}</Text>;
}
