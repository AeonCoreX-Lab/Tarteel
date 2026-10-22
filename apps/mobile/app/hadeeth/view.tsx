import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { hadeethUrl } from "@tarteel/core";
import type { HadeethEntry } from "@tarteel/core";
import { Button, Caption, Card, Chip, ScreenScroll } from "../../src/components/ui";
import { ArabicFrame, OrnamentDivider, StarList, TextBlock } from "../../src/components/Heritage";
import { useHadeethEntry } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

/** Every field the publisher gave, as given. Nothing is shortened, merged or reworded; only the way it is laid out is ours. */
function Entry({ h, language }: { h: HadeethEntry; language: "en" | "bn" | "ar" }) {
  const th = useTheme();
  const t = useT();
  const url = hadeethUrl(language, h.id);
  const arabicOnly = language === "ar";
  const hints = arabicOnly ? h.hintsAr : h.hints;
  return (
    <View style={{ gap: 18 }}>
      {h.title ? <Text selectable accessibilityRole="header" style={{ color: th.text, fontSize: 22, lineHeight: 31, fontWeight: "700", fontFamily: HEADING_FONT, textAlign: "center", writingDirection: arabicOnly ? "rtl" : "ltr" }}>{h.title}</Text> : null}

      {h.textAr ? <ArabicFrame label={t("hdOriginal")}>{h.textAr}</ArabicFrame> : null}

      {!arabicOnly && h.text ? <TextBlock label={t("hdTranslation")}>{h.text}</TextBlock> : null}
      {!arabicOnly && !h.text ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hdNoTranslation")}</Text> : null}

      {h.attribution || h.grade ? (
        <>
          <OrnamentDivider />
          <Card tone="alt" padding={14}>
            <View style={{ gap: 12 }}>
              {h.attribution ? (
                <View style={{ gap: 3 }}>
                  <Caption>{t("hdAttribution")}</Caption>
                  <Text selectable style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{h.attribution}</Text>
                </View>
              ) : null}
              {h.grade ? (
                <View style={{ gap: 6 }}>
                  <Caption>{t("hdGrade")}</Caption>
                  <View style={{ flexDirection: "row" }}>
                    <Chip label={h.grade} tone="brass" />
                  </View>
                  <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hdGradeNote")}</Text>
                </View>
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      {!arabicOnly && h.explanation ? <TextBlock label={t("hdExplanation")}>{h.explanation}</TextBlock> : null}
      {arabicOnly && h.explanationAr ? <TextBlock label={t("hdExplanation")} rtl>{h.explanationAr}</TextBlock> : null}

      {hints.length > 0 ? <StarList label={t("hdHints")} items={hints} rtl={arabicOnly} /> : null}

      {h.wordMeaningsAr.length > 0 ? <StarList label={t("hdWords")} items={h.wordMeaningsAr.map((w) => `${w.word}: ${w.meaning}`)} rtl /> : null}

      {url ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hdOpenSite")} hint={url} onPress={() => void Linking.openURL(url)} />
        </View>
      ) : null}
    </View>
  );
}

function Loaded({ id }: { id: string }) {
  const t = useT();
  const { state, retry, language } = useHadeethEntry(id);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  return <Entry h={state.value} language={language} />;
}

/** One hadith, fetched live. Arabic original, translation, source, grade and explanation are kept apart and each is labelled. */
export default function HadeethView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("hdTitle") }} />
      <ScreenScroll>
        <HadeethGate>
          <Loaded id={String(id)} />
        </HadeethGate>
        <OrnamentDivider margin={8} />
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
