import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { hadeethUrl } from "@tarteel/core";
import type { HadeethEntry } from "@tarteel/core";
import { Button, Caption, Card, Chip, ScreenScroll } from "../../src/components/ui";
import { useHadeethEntry } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

function Block({ label, children }: { label: string; children: string }) {
  const th = useTheme();
  return (
    <Card padding={16}>
      <View style={{ gap: 8 }}>
        <Caption>{label}</Caption>
        <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 25 }}>{children}</Text>
      </View>
    </Card>
  );
}

/** Every field the publisher gave, as given. Nothing is shortened, merged or reworded. */
function Entry({ h, language }: { h: HadeethEntry; language: "en" | "bn" | "ar" }) {
  const th = useTheme();
  const t = useT();
  const url = hadeethUrl(language, h.id);
  const arabicOnly = language === "ar";
  return (
    <View style={{ gap: 14 }}>
      {h.title ? <Text selectable style={{ color: th.text, fontSize: 20, lineHeight: 28, fontWeight: "700", fontFamily: HEADING_FONT }}>{h.title}</Text> : null}

      {h.textAr ? (
        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Caption>{t("hdOriginal")}</Caption>
            <Text selectable style={{ color: th.text, fontSize: 24, lineHeight: 42, writingDirection: "rtl", textAlign: "left" }}>{h.textAr}</Text>
          </View>
        </Card>
      ) : null}

      {!arabicOnly && h.text ? <Block label={t("hdTranslation")}>{h.text}</Block> : null}
      {!arabicOnly && !h.text ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hdNoTranslation")}</Text> : null}

      {h.attribution || h.grade ? (
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            {h.attribution ? (
              <View style={{ gap: 2 }}>
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
      ) : null}

      {!arabicOnly && h.explanation ? <Block label={t("hdExplanation")}>{h.explanation}</Block> : null}
      {arabicOnly && h.explanationAr ? <Block label={t("hdExplanation")}>{h.explanationAr}</Block> : null}

      {(arabicOnly ? h.hintsAr : h.hints).length > 0 ? (
        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Caption>{t("hdHints")}</Caption>
            {(arabicOnly ? h.hintsAr : h.hints).map((x, i) => (
              <Text key={i} selectable style={{ color: th.text, fontSize: 15, lineHeight: 23, writingDirection: arabicOnly ? "rtl" : "ltr", textAlign: "left" }}>{`• ${x}`}</Text>
            ))}
          </View>
        </Card>
      ) : null}

      {h.wordMeaningsAr.length > 0 ? (
        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Caption>{t("hdWords")}</Caption>
            {h.wordMeaningsAr.map((w, i) => (
              <Text key={i} selectable style={{ color: th.text, fontSize: 15, lineHeight: 24, writingDirection: "rtl", textAlign: "left" }}>{`${w.word}: ${w.meaning}`}</Text>
            ))}
          </View>
        </Card>
      ) : null}

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
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
