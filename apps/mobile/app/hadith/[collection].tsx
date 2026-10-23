import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { HadithBook, HadithEntry } from "@tarteel/core";
import { Button, Caption, Card, ScreenScroll } from "../../src/components/ui";
import { Hero, ListRow, OrnamentDivider, RowStar, SectionHeader, StarGlyph } from "../../src/components/Heritage";
import { useHadithBooks, useHadithList } from "../../src/hadith/hooks";
import { HadithCredit, HadithError, HadithGate } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

function Books({ collection }: { collection: string }) {
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadithBooks(collection);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const row = (b: HadithBook) => (
    <ListRow
      key={b.bookNumber}
      title={b.nameEn ?? b.bookNumber}
      subtitle={b.nameAr ?? undefined}
      tag={b.hadithCount !== null ? `${b.hadithCount}` : undefined}
      label={`${b.bookNumber}. ${b.nameEn ?? ""}${b.hadithCount !== null ? `. ${b.hadithCount} ${t("hadCount")}` : ""}`}
      lead={<RowStar n={b.bookNumber} />}
      onPress={() => router.push(`/hadith/${collection}?book=${encodeURIComponent(b.bookNumber)}`)}
    />
  );
  return <View style={{ gap: 10 }}>{state.value.map(row)}</View>;
}

function HadithList({ collection, book }: { collection: string; book: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { items, total, state, more, retry } = useHadithList(collection, book);
  const row = (h: HadithEntry) => (
    <Pressable
      key={h.hadithNumber}
      accessibilityRole="button"
      accessibilityLabel={`${t("hadNumber")} ${h.hadithNumber}`}
      onPress={() => router.push(`/hadith/view?collection=${collection}&book=${encodeURIComponent(book)}&number=${encodeURIComponent(h.hadithNumber)}`)}
    >
      <Card padding={14}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><StarGlyph size={11} /><Caption>{`${t("hadNumber")} ${h.hadithNumber}`}</Caption></View>
          {h.en.text ? <Text numberOfLines={4} style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{h.en.text}</Text> : null}
          {!h.en.text && h.ar.text ? <Text numberOfLines={3} style={{ color: th.text, fontSize: 18, lineHeight: 30, writingDirection: "rtl", textAlign: "left" }}>{h.ar.text}</Text> : null}
        </View>
      </Card>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      {total > 0 ? <SectionHeader label={t("hadTitle")} trailing={`${items.length} / ${total}`} /> : null}
      {items.map(row)}
      {state.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
      {state.status === "error" ? <HadithError state={state} retry={retry} /> : null}
      {state.status === "ready" && items.length < total ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hadLoadMore")} onPress={more} />
        </View>
      ) : null}
    </View>
  );
}

/** One collection: its books, or, with `?book=`, that book's hadith a page at a time. */
export default function HadithCollectionScreen() {
  const { collection, book } = useLocalSearchParams<{ collection: string; book?: string }>();
  const t = useT();
  const slug = String(collection);
  return (
    <>
      <Stack.Screen options={{ title: t("hadTitle") }} />
      <ScreenScroll>
        <Hero title={slug} icon="books" />
        <HadithGate>{book ? <HadithList collection={slug} book={String(book)} /> : <Books collection={slug} />}</HadithGate>
        <OrnamentDivider margin={8} />
        <HadithCredit />
      </ScreenScroll>
    </>
  );
}
