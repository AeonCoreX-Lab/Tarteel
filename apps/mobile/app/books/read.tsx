import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { LIMITS, blocksOf, foldForSearch, isBookSlug, parseOpenItiText } from "@tarteel/core";
import type { BookChapter } from "@tarteel/core";
import { Button, Column, ScreenScroll } from "../../src/components/ui";
import { HadithError } from "../../src/hadith/parts";
import { useIslamicBookText, useIslamicBooksAllowed } from "../../src/books/hooks";
import { IslamicBooksCredit, IslamicBooksGate, OpenItiCredit } from "../../src/books/parts";
import { ContentsRow, PlateRule, ReaderBar, TitlePlate, paperColor } from "../../src/books/reader-parts";
import { readSavedText } from "../../src/books/store";
import { PassageTranslation } from "../../src/translate/parts";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ready"; chapters: BookChapter[] };

/** A kept OpenITI book, read from this device: no request is made. */
function useKept(uri: string, enabled: boolean): Loaded {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void readSavedText(uri).then(
      (raw) => {
        if (cancelled) return;
        if (raw === null) return setState({ status: "missing" });
        const { chapters } = parseOpenItiText(raw);
        setState(chapters.length > 0 ? { status: "ready", chapters } : { status: "missing" });
      },
      () => !cancelled && setState({ status: "missing" }),
    );
    return () => { cancelled = true; };
  }, [uri, enabled]);
  return state;
}

function Reader({ chapters, title, credit }: { chapters: BookChapter[]; title: string; credit: ReactElement }) {
  const th = useTheme();
  const t = useT();
  const size = useSettings((s) => s.bookFontSize);
  const spacing = useSettings((s) => s.lineSpacing);
  const set = useSettings((s) => s.set);
  const [index, setIndex] = useState<number | null>(chapters.length === 1 ? 0 : null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const paper = paperColor(th);
  const chapter = index === null ? null : chapters[index] ?? null;
  const blocks = useMemo(() => (chapter ? blocksOf(chapter.text) : []), [chapter]);
  const listed = useMemo(() => {
    const q = foldForSearch(filter.trim());
    const all = chapters.map((c, i) => ({ c, i }));
    return q.length < 2 ? all : all.filter((x) => foldForSearch(x.c.title).includes(q));
  }, [chapters, filter]);
  const go = (i: number | null): void => {
    setOpen(null);
    setIndex(i);
  };
  const lineHeight = size * Math.max(1.7, spacing + 0.2);

  const body = (
    <>
      {chapter === null ? (
        <FlatList
          key="toc"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, width: "100%", maxWidth: 720, alignSelf: "center" }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 8 }}>
              <TitlePlate title={title} subtitle={`${t("bkIndexAr")} · ${t("bkContents")}`} />
              {chapters.length > 8 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>
                  <TextInput value={filter} onChangeText={setFilter} placeholder={t("bkFilterContents")} placeholderTextColor={th.muted} accessibilityLabel={t("bkFilterContents")} autoCorrect={false} autoCapitalize="none" style={{ flex: 1, minHeight: 44, color: th.text, fontSize: 16 }} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={<Text style={{ color: th.muted, fontSize: 15, paddingVertical: 12 }}>{t("bkNoMatch")}</Text>}
          ListFooterComponent={<View style={{ gap: 14, paddingTop: 16 }}><PlateRule />{credit}</View>}
          data={listed}
          keyExtractor={(x) => String(x.i)}
          initialNumToRender={18}
          renderItem={({ item }) => <ContentsRow n={item.i + 1} title={item.c.title || `${t("bkChapter")} ${item.i + 1}`} page={item.c.page !== null ? String(item.c.page) : null} level={item.c.level} onPress={() => go(item.i)} />}
        />
      ) : (
        <FlatList
          key={`c${index}`}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 18, paddingBottom: 32, width: "100%", maxWidth: 720, alignSelf: "center" }}
          ListHeaderComponent={
            <View style={{ paddingBottom: 10 }}>
              {index === 0 || chapters.length === 1 ? <TitlePlate title={title} /> : null}
              <Text style={{ color: th.muted, fontSize: 12, textAlign: "center", fontVariant: ["tabular-nums"] }}>
                {[`${t("bkChapter")} ${(index ?? 0) + 1} ${t("bkOf")} ${chapters.length}`, chapter.vol, chapter.page !== null ? `${t("bkPages")} ${chapter.page}` : null].filter(Boolean).join(" · ")}
              </Text>
              {chapter.title !== "" ? <TitlePlate small title={chapter.title} /> : <PlateRule />}
              <Text style={{ color: th.muted, fontSize: 12, textAlign: "center" }}>{t("bkTranslateHint")}</Text>
            </View>
          }
          ListFooterComponent={
            <View style={{ gap: 16, paddingTop: 18 }}>
              <PlateRule />
              {(index ?? 0) < chapters.length - 1 ? (
                <View style={{ flexDirection: "row", justifyContent: "center" }}><Button label={t("bkNextChapter")} onPress={() => go((index ?? 0) + 1)} /></View>
              ) : <Text style={{ color: th.brassText, fontSize: 14, fontWeight: "700", textAlign: "center" }}>{t("bkEndOfBook")}</Text>}
              <Text style={{ color: th.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{t("bkAboutText")}</Text>
              {credit}
            </View>
          }
          data={blocks}
          keyExtractor={(_, i) => String(i)}
          initialNumToRender={6}
          windowSize={7}
          renderItem={({ item, index: bi }) => (
            <View style={{ marginBottom: 14 }}>
              <Pressable accessibilityLabel={t("bkTranslate")} onPress={() => setOpen((o) => (o === bi ? null : bi))}>
                <Text selectable style={{ color: th.text, fontSize: size, lineHeight, writingDirection: "rtl", textAlign: "left" }}>{item}</Text>
              </Pressable>
              {open === bi ? (
                <View style={{ paddingTop: 8 }}>
                  <PassageTranslation text={item} />
                </View>
              ) : null}
            </View>
          )}
        />
      )}
      {chapter !== null && chapters.length > 1 ? (
        <ReaderBar
          position={(index ?? 0) + 1}
          total={chapters.length}
          contentsLabel={t("bkContents")}
          prevLabel={t("bkPrev")}
          nextLabel={t("bkNext")}
          smallerLabel={t("bkSmaller")}
          largerLabel={t("bkLarger")}
          onPrev={() => go(Math.max(0, (index ?? 0) - 1))}
          onNext={() => go(Math.min(chapters.length - 1, (index ?? 0) + 1))}
          onContents={() => go(null)}
          onSmaller={() => set("bookFontSize", Math.max(LIMITS.bookFontSize.min, size - 2))}
          onLarger={() => set("bookFontSize", Math.min(LIMITS.bookFontSize.max, size + 2))}
          atMin={size <= LIMITS.bookFontSize.min}
          atMax={size >= LIMITS.bookFontSize.max}
        />
      ) : null}
    </>
  );
  return <View style={{ flex: 1, backgroundColor: paper }}>{body}</View>;
}

function Message({ text, children }: { text: string; children?: ReactElement }) {
  const th = useTheme();
  return (
    <Column>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{text}</Text>
        {children}
      </View>
    </Column>
  );
}

function IslamicReader({ slug, title }: { slug: string; title: string }) {
  const t = useT();
  const { state, retry } = useIslamicBookText(slug, true);
  if (state.status === "error") return <View style={{ padding: 16 }}><HadithError state={state} retry={retry} /></View>;
  if (state.status !== "ready") return <Message text={t("bkLoadingBook")} />;
  const chapters = state.value.chapters.filter((c) => c.text.trim() !== "");
  if (chapters.length === 0) return <Message text={t("bkBookEmpty")} />;
  const bib = state.value.bibliography;
  const edition = [bib.investigator, bib.publisher, bib.year].filter(Boolean).join(" · ");
  return (
    <Reader
      chapters={chapters}
      title={title}
      credit={<Credit edition={edition} />}
    />
  );
}

function Credit({ edition }: { edition: string }) {
  const th = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {edition !== "" ? <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{edition}</Text> : null}
      <IslamicBooksCredit />
    </View>
  );
}

function KeptReader({ uri, title }: { uri: string; title: string }) {
  const t = useT();
  const state = useKept(uri, true);
  if (state.status === "loading") return <Message text={t("knowLoading")} />;
  if (state.status === "missing") return <Message text={t("bkBookGone")} />;
  return <Reader chapters={state.chapters} title={title} credit={<OpenItiCredit />} />;
}

/** The reader for both sources: the contents, then one chapter at a time, in the text size set in Settings. */
export default function BookReader() {
  const { src, slug, uri, title } = useLocalSearchParams<{ src?: string; slug?: string; uri?: string; title?: string }>();
  const t = useT();
  const name = String(title ?? "");
  const allowed = useIslamicBooksAllowed();
  return (
    <>
      <Stack.Screen options={{ title: t("bkTitle") }} />
      {src === "openiti" && uri ? (
        <KeptReader uri={String(uri)} title={name} />
      ) : src === "islamic" && slug && isBookSlug(String(slug)) ? (
        allowed ? (
          <IslamicReader slug={String(slug)} title={name} />
        ) : (
          <ScreenScroll>
            <IslamicBooksGate>{null}</IslamicBooksGate>
          </ScreenScroll>
        )
      ) : (
        <Message text={t("bkNoResults")} />
      )}
    </>
  );
}
