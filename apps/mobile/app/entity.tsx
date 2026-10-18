import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { EntityDetail, EntityRef } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Button, Caption, Card, Chip, ScreenScroll } from "../src/components/ui";
import { useFormatDate } from "../src/knowledge/dates";
import { useEntityDetail } from "../src/knowledge/hooks";
import { EVIDENCE_KEY } from "../src/knowledge/labels";
import { Citation, ClaimCard, EntityLink, KIND_KEY, SUBTYPE_KEY } from "../src/knowledge/parts";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

function Detail({ d }: { d: EntityDetail }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { repos } = useApp();
  const lang = useSettings((s) => s.uiLanguage);
  const formatDate = useFormatDate();
  const [surahs, setSurahs] = useState<Surah[]>([]);
  useEffect(() => void repos.quran.getSurahs().then(setSurahs), [repos]);
  const surahName = (id: number): string => surahs.find((s) => s.id === id)?.nameTransliteration ?? String(id);
  const dated = d.kind !== "place";
  const machine = d.nameStatus === "machine_draft" || d.summaryStatus === "machine_draft";
  const label = (key: Parameters<typeof t>[0]) => <Caption>{t(key)}</Caption>;
  const group = (title: Parameters<typeof t>[0], list: EntityRef[]) =>
    list.length === 0 ? null : (
      <View style={{ gap: 0 }}>
        {label(title)}
        {list.map((e) => <EntityLink key={e.key} e={e} />)}
      </View>
    );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={{ color: th.text, fontSize: 26, fontWeight: "700", fontFamily: HEADING_FONT }}>{d.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label={t(KIND_KEY[d.kind])} tone="accent" />
          {d.subtype ? <Chip label={t(SUBTYPE_KEY[d.subtype] ?? "stOther")} tone="muted" /> : null}
          <Chip label={t(EVIDENCE_KEY[d.evidenceLabel])} tone={d.evidenceLabel === "disputed" || d.evidenceLabel === "unverified" ? "brass" : "muted"} />
        </View>
        {machine ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
        {d.nameLang !== lang ? <Caption>{t("histOtherLanguage")}</Caption> : null}
      </View>

      {dated ? (
        <Card padding={14}>
          <View style={{ gap: 6 }}>
            {label(d.kind === "person" ? "entLifeDates" : "entDate")}
            <Text selectable style={{ color: th.text, fontSize: 17, fontWeight: "700" }}>{formatDate(d.date)}</Text>
            {d.date.note ? <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{d.date.note}</Text> : null}
            {d.date.precision !== "unknown" ? <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("entDateNote")}</Text> : null}
          </View>
        </Card>
      ) : null}

      {d.summary ? <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 25 }}>{d.summary}</Text> : null}

      {d.uncertaintyNote ? (
        <Card padding={14}>
          <View style={{ gap: 2 }}>
            {label("histUncertainty")}
            <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{d.uncertaintyNote}</Text>
          </View>
        </Card>
      ) : null}
      {d.editorialBasis ? (
        <View style={{ gap: 2 }}>
          {label("histBasis")}
          <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{d.editorialBasis}</Text>
        </View>
      ) : null}

      {d.events.length + d.people.length + d.places.length > 0 ? (
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            {group("tlEvents", d.events)}
            {group("tlPeople", d.people)}
            {group("tlPlaces", d.places)}
          </View>
        </Card>
      ) : null}

      {d.quranLinks.length > 0 ? (
        <Card padding={14}>
          <View style={{ gap: 0 }}>
            {label("entQuran")}
            {d.quranLinks.map((l) => {
              const text = `${surahName(l.surahId)}${l.ayahNumber !== null ? ` · ${t("ayah")} ${l.ayahNumber}` : ""}`;
              return (
                <Pressable
                  key={`${l.surahId}:${l.ayahNumber ?? ""}`}
                  accessibilityRole="link"
                  accessibilityLabel={text}
                  onPress={() => router.push(`/history/${l.surahId}${l.ayahNumber !== null ? `?ayah=${l.ayahNumber}` : ""}`)}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Text style={{ color: th.accentText, fontSize: 15, textDecorationLine: "underline" }}>{text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      {d.claims.length > 0 ? (
        <View style={{ gap: 12 }}>
          {label("entClaims")}
          {d.claims.map((c) => <ClaimCard key={c.key} c={c} />)}
        </View>
      ) : null}

      {d.sources.length > 0 ? (
        <View style={{ gap: 6 }}>
          {label("histSources")}
          {d.sources.map((c) => <Citation key={c.passageId} c={c} />)}
        </View>
      ) : null}
      {d.lastReviewedAt ? <Caption>{t("histReviewed")}: {d.lastReviewedAt}</Caption> : null}
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("histFooter")}</Text>
    </View>
  );
}

/** One event, person or place from an installed pack, with its date, its links, the claims about it and its sources. */
export default function EntityScreen() {
  const { pack, id } = useLocalSearchParams<{ pack: string; id: string }>();
  const th = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  const { state, retry } = useEntityDetail(String(pack), String(id), lang);
  return (
    <>
      <Stack.Screen options={{ title: t("entTitle") }} />
      <ScreenScroll>
        {state.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
        {state.status === "error" ? (
          <Card padding={16}>
            <View style={{ gap: 12 }}>
              <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("knowLoadFailed")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Button label={t("knowRetry")} onPress={retry} />
              </View>
            </View>
          </Card>
        ) : null}
        {state.status === "ready" && state.value === null ? <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("entNotFound")}</Text> : null}
        {state.status === "ready" && state.value !== null ? <Detail d={state.value} /> : null}
      </ScreenScroll>
    </>
  );
}
