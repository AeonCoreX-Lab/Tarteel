import { Linking, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { gradeLabel, sunnahUrl } from "@tarteel/core";
import type { HadithEntry } from "@tarteel/core";
import { Button, Caption, Card, Chip, ScreenScroll } from "../../src/components/ui";
import { useHadithEntry } from "../../src/hadith/hooks";
import { HadithCredit, HadithError, HadithGate } from "../../src/hadith/parts";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

function Entry({ h }: { h: HadithEntry }) {
  const th = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  const url = sunnahUrl(h.collection, h.hadithNumber);
  const grades = [...h.ar.grades, ...h.en.grades.filter((g) => !h.ar.grades.some((a) => a.grade === g.grade && a.gradedBy === g.gradedBy))];
  const title = [h.chapterTitle.en, h.chapterNumber ? `(${t("hadChapter")} ${h.chapterNumber})` : null].filter(Boolean).join(" ");
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: th.text, fontSize: 20, fontWeight: "700", fontFamily: HEADING_FONT }}>{`${h.collection} · ${t("hadNumber")} ${h.hadithNumber}`}</Text>
        <Caption>{`${t("hadBook")} ${h.bookNumber}`}</Caption>
        {title ? <Caption>{title}</Caption> : null}
      </View>

      {h.ar.text ? (
        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Caption>{t("hadArabic")}</Caption>
            <Text selectable style={{ color: th.text, fontSize: 24, lineHeight: 42, writingDirection: "rtl", textAlign: "left" }}>{h.ar.text}</Text>
          </View>
        </Card>
      ) : null}

      {h.en.text ? (
        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Caption>{t("hadEnglish")}</Caption>
            <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 25 }}>{h.en.text}</Text>
          </View>
        </Card>
      ) : null}
      {lang === "bn" ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hadLangNote")}</Text> : null}

      <Card padding={14}>
        <View style={{ gap: 8 }}>
          <Caption>{t("hadGrading")}</Caption>
          {grades.length === 0 ? (
            <Text style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{t("hadNoGrade")}</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {grades.map((g, i) => (
                <Chip key={i} label={g.gradedBy ? gradeLabel(g) : `${gradeLabel(g)} · ${t("hadGraderUnnamed")}`} tone="brass" />
              ))}
            </View>
          )}
          <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hadGradeNote")}</Text>
        </View>
      </Card>

      <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hadNoChain")}</Text>

      {url ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hadOpenSite")} hint={url} onPress={() => void Linking.openURL(url)} />
        </View>
      ) : null}
    </View>
  );
}

function Loaded({ collection, book, number }: { collection: string; book: string; number: string }) {
  const t = useT();
  const { state, retry } = useHadithEntry(collection, book, number);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  return <Entry h={state.value} />;
}

/** One hadith, fetched live. Arabic text, translation, grading and source are kept apart and each is labelled. */
export default function HadithView() {
  const { collection, book, number } = useLocalSearchParams<{ collection: string; book: string; number: string }>();
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("hadTitle") }} />
      <ScreenScroll>
        <HadithGate>
          <Loaded collection={String(collection)} book={String(book)} number={String(number)} />
        </HadithGate>
        <HadithCredit />
      </ScreenScroll>
    </>
  );
}
