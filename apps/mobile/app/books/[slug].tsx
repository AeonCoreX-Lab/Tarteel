import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Caption, Card, Chip, Row, ScreenScroll } from "../../src/components/ui";
import { Hero, OrnamentDivider, TextBlock } from "../../src/components/Heritage";
import { HadithError } from "../../src/hadith/parts";
import { useIslamicBook } from "../../src/books/hooks";
import { BookCover } from "../../src/books/BookCover";
import { IslamicBooksCredit, IslamicBooksGate, openBooksLink } from "../../src/books/parts";
import { getIslamicBooksClient } from "../../src/online/runtime";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

/** One islamic.app book: who wrote it, what it is, where it comes from. The text is read live in the reader, never stored. */
export default function BookDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  const { state, retry } = useIslamicBook(String(slug ?? ""));
  const b = state.status === "ready" ? state.value : null;
  return (
    <>
      <Stack.Screen options={{ title: t("bkTitle") }} />
      <ScreenScroll>
        <IslamicBooksGate>
          {state.status === "error" ? <HadithError state={state} retry={retry} /> : null}
          {state.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
          {b ? (
            <>
              <View style={{ alignItems: "center", paddingVertical: 6 }}>
                <BookCover width={170} detailed title={b.titleAr} author={b.authorAr ?? b.authorEn} genre={b.genre} id={b.slug} />
              </View>
              <Hero title={b.titleAr} {...(b.titleEn ? { subtitle: b.titleEn } : {})} icon="books" />
              <Card padding={16}>
                <View style={{ gap: 10 }}>
                  <Text selectable style={{ color: th.text, fontSize: 18, fontWeight: "700", fontFamily: HEADING_FONT, writingDirection: "rtl" }}>{b.authorAr ?? b.authorEn ?? ""}</Text>
                  {b.authorAr && b.authorEn ? <Caption>{b.authorEn}</Caption> : null}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {b.authorDiedHijri !== null ? <Chip label={`${t("bkDied")} ${b.authorDiedHijri} ${t("bkAH")}`} /> : null}
                    {b.genre ? <Chip label={b.genre} /> : null}
                    {b.school ? <Chip label={b.school} /> : null}
                    {b.pages !== null ? <Chip label={`${b.pages} ${t("bkPages")}`} /> : null}
                  </View>
                </View>
              </Card>
              {b.descriptionAr || b.descriptionEn ? <TextBlock label={t("bkDescription")} rtl={!b.descriptionEn}>{b.descriptionEn ?? b.descriptionAr ?? ""}</TextBlock> : null}
              {b.hasText ? null : <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("bkBookEmpty")}</Text>}
              <Row>
                {b.hasText ? <Button label={t("bkRead")} onPress={() => router.push(`/books/read?src=islamic&slug=${encodeURIComponent(b.slug)}&title=${encodeURIComponent(b.titleAr)}`)} /> : null}
                {b.hasPdf ? <Button label={t("bkOpenPdf")} hint={getIslamicBooksClient().pdfUrl(b.slug)} onPress={() => openBooksLink(getIslamicBooksClient().pdfUrl(b.slug))} /> : null}
              </Row>
              <OrnamentDivider margin={8} />
              <IslamicBooksCredit sources={b.sources} />
            </>
          ) : null}
        </IslamicBooksGate>
      </ScreenScroll>
    </>
  );
}
