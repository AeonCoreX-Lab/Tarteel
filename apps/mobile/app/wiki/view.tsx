import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { WIKIPEDIA_LICENSE, wikiHistoryUrl } from "@tarteel/core";
import type { WikiArticle, WikiLanguage } from "@tarteel/core";
import { Icon } from "../../src/components/Icons";
import { Button, Caption, Card, Row, ScreenScroll } from "../../src/components/ui";
import { Hero, OrnamentDivider, TextBlock } from "../../src/components/Heritage";
import { HadithError } from "../../src/hadith/parts";
import { wikipediaEnabled } from "../../src/online/runtime";
import { useWikiAllowed, useWikiArticle } from "../../src/online/wiki";
import { WikiNotice } from "../../src/online/wiki-parts";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

/** One part of the article under its heading; closed until tapped, so a long article stays easy to scan. */
function Part({ heading, level, text, rtl }: { heading: string; level: number; text: string; rtl: boolean }) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const size = useSettings((s) => s.translationFontSize);
  const spacing = useSettings((s) => s.lineSpacing);
  return (
    <View style={{ marginStart: Math.max(0, level - 2) * 12 }}>
      <Card padding={0}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={heading} onPress={() => setOpen((o) => !o)} style={{ minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ flex: 1, color: th.text, fontSize: 16, lineHeight: 23, fontWeight: "700", fontFamily: HEADING_FONT, writingDirection: rtl ? "rtl" : "ltr", textAlign: "left" }}>{heading}</Text>
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <Icon name="chevronRight" size={20} color={th.muted} />
          </View>
        </Pressable>
        {open ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <Text selectable style={{ color: th.text, fontSize: size, lineHeight: size * Math.max(1.4, spacing * 0.9), writingDirection: rtl ? "rtl" : "ltr", textAlign: "left" }}>{text}</Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

/** The article as Wikipedia gives it: nothing is shortened or reworded here; every part is there under its own heading. */
function Article({ a }: { a: WikiArticle }) {
  const t = useT();
  const rtl = a.language === "ar";
  const intro = a.sections.find((s) => s.heading === null);
  const rest = a.sections.filter((s) => s.heading !== null);
  return (
    <View style={{ gap: 16 }}>
      <Hero title={a.title} subtitle={`${t("wkTitle")} · ${a.language}`} icon="knowledge" />
      {intro ? <TextBlock label={t("wkIntro")} rtl={rtl}>{intro.text}</TextBlock> : null}
      {rest.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Caption>{`${t("wkParts")} (${rest.length})`}</Caption>
          {rest.map((s, i) => <Part key={`${i}:${s.heading}`} heading={s.heading ?? ""} level={s.level} text={s.text} rtl={rtl} />)}
        </View>
      ) : null}
      <OrnamentDivider />
      <Row>
        <Button label={t("wkOpen")} hint={a.url} onPress={() => void Linking.openURL(a.url)} />
        <Button label={t("wkAuthors")} hint={wikiHistoryUrl(a.language, a.title)} onPress={() => void Linking.openURL(wikiHistoryUrl(a.language, a.title))} />
        <Button label={WIKIPEDIA_LICENSE.name} hint={WIKIPEDIA_LICENSE.url} onPress={() => void Linking.openURL(WIKIPEDIA_LICENSE.url)} />
      </Row>
    </View>
  );
}

function Loaded({ language, title }: { language: WikiLanguage; title: string }) {
  const t = useT();
  const { state, retry } = useWikiArticle(language, title);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  return <Article a={state.value} />;
}

/** One Wikipedia article, fetched live. Reached only from a lookup the person asked for, so it needs no consent card of its own. */
export default function WikiView() {
  const { lang, title } = useLocalSearchParams<{ lang?: string; title?: string }>();
  const t = useT();
  const th = useTheme();
  const allowed = useWikiAllowed();
  const language: WikiLanguage = lang === "bn" || lang === "ar" ? lang : "en";
  return (
    <>
      <Stack.Screen options={{ title: t("wkTitle") }} />
      <ScreenScroll>
        {wikipediaEnabled && allowed && title ? <Loaded language={language} title={String(title)} /> : <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("wkNotAvailable")}</Text>}
        <OrnamentDivider margin={8} />
        <WikiNotice />
      </ScreenScroll>
    </>
  );
}
