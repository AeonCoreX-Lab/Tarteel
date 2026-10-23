import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { HadithCollection, HadithHit } from "@tarteel/core";
import { Icon } from "../../src/components/Icons";
import { Caption, Card, ScreenScroll } from "../../src/components/ui";
import { Hero, ListRow, OrnamentDivider, RowStar, SectionHeader, StarGlyph } from "../../src/components/Heritage";
import { useHadithCollections, useHadithSearch } from "../../src/hadith/hooks";
import { HadithCredit, HadithError, HadithGate, Snippet } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

function Collections() {
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadithCollections();
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const row = (c: HadithCollection, i: number) => (
    <ListRow
      key={c.slug}
      title={c.nameEn}
      subtitle={c.nameAr ?? undefined}
      tag={c.totalHadith > 0 ? `${c.totalHadith}` : undefined}
      label={`${c.nameEn}${c.totalHadith > 0 ? `. ${c.totalHadith} ${t("hadCount")}` : ""}`}
      lead={<RowStar n={i + 1} />}
      onPress={() => router.push(`/hadith/${c.slug}`)}
    />
  );
  return <View style={{ gap: 10 }}>{state.value.map(row)}</View>;
}

function Results({ query }: { query: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadithSearch(query);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowSearching")}</Caption>;
  if (state.value.items.length === 0) return <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("hadNoResults")}</Text>;
  const hit = (h: HadithHit) => {
    const open = (): void => router.push(`/hadith/view?collection=${h.collection}&book=${encodeURIComponent(h.bookNumber)}&number=${encodeURIComponent(h.hadithNumber)}`);
    return (
      <Pressable key={`${h.collection}:${h.bookNumber}:${h.hadithNumber}`} accessibilityRole="button" accessibilityLabel={`${h.collection} ${h.hadithNumber}`} onPress={open}>
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><StarGlyph size={11} /><Caption>{`${h.collection} · ${t("hadNumber")} ${h.hadithNumber}`}</Caption></View>
            {h.snippet.en ? <Snippet segments={h.snippet.en} /> : null}
            {h.snippet.ar ? <Snippet segments={h.snippet.ar} rtl /> : null}
          </View>
        </Card>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <Caption>{`${state.value.total} ${t("hadResults")}`}</Caption>
      {state.value.items.map(hit)}
      {state.value.total > state.value.items.length ? <Caption>{t("knowMore")}</Caption> : null}
    </View>
  );
}

/** Online hadith: the collections, and search. Every request is made live and nothing is stored. */
export default function HadithHome() {
  const th = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  const searching = query.trim().length >= 2;
  return (
    <>
      <Stack.Screen options={{ title: t("hadTitle") }} />
      <ScreenScroll>
        <Hero title={t("hadTitle")} subtitle={t("hadIntro")} icon="books" />
        <HadithGate>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>
            <Icon name="search" size={22} color={th.accentText} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("hadSearchPlaceholder")}
              placeholderTextColor={th.muted}
              accessibilityLabel={t("hadSearchPlaceholder")}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={{ flex: 1, minHeight: 48, color: th.text, fontSize: 16 }}
            />
          </View>
          {searching ? <Results query={query} /> : <><SectionHeader label={t("hadTitle")} /><Collections /></>}
        </HadithGate>
        <OrnamentDivider margin={8} />
        <HadithCredit />
      </ScreenScroll>
    </>
  );
}
