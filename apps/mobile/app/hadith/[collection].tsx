import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { HadithBook, HadithEntry } from "@tarteel/core";
import { Icon } from "../../src/components/Icons";
import { Button, Caption, Card, Heading, ScreenScroll } from "../../src/components/ui";
import { useHadithBooks, useHadithList } from "../../src/hadith/hooks";
import { HadithCredit, HadithError, HadithGate } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

function Books({ collection }: { collection: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadithBooks(collection);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const row = (b: HadithBook) => (
    <Pressable key={b.bookNumber} accessibilityRole="button" accessibilityLabel={b.nameEn ?? b.bookNumber} onPress={() => router.push(`/hadith/${collection}?book=${encodeURIComponent(b.bookNumber)}`)}>
      <Card padding={14}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: th.text, fontSize: 15, fontWeight: "700", fontFamily: HEADING_FONT }}>{`${b.bookNumber}. ${b.nameEn ?? ""}`}</Text>
            {b.nameAr ? <Text style={{ color: th.muted, fontSize: 15, writingDirection: "rtl", textAlign: "left" }}>{b.nameAr}</Text> : null}
            {b.hadithCount !== null ? <Caption>{`${b.hadithCount} ${t("hadCount")}`}</Caption> : null}
          </View>
          <Icon name="chevronRight" size={20} color={th.muted} />
        </View>
      </Card>
    </Pressable>
  );
  return <View style={{ gap: 12 }}>{state.value.map(row)}</View>;
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
          <Caption>{`${t("hadNumber")} ${h.hadithNumber}`}</Caption>
          {h.en.text ? <Text numberOfLines={4} style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{h.en.text}</Text> : null}
          {!h.en.text && h.ar.text ? <Text numberOfLines={3} style={{ color: th.text, fontSize: 18, lineHeight: 30, writingDirection: "rtl", textAlign: "left" }}>{h.ar.text}</Text> : null}
        </View>
      </Card>
    </Pressable>
  );
  return (
    <View style={{ gap: 12 }}>
      {total > 0 ? <Caption>{`${items.length} / ${total}`}</Caption> : null}
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
        <Heading size={26}>{slug}</Heading>
        <HadithGate>{book ? <HadithList collection={slug} book={String(book)} /> : <Books collection={slug} />}</HadithGate>
        <HadithCredit />
      </ScreenScroll>
    </>
  );
}
