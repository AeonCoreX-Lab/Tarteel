import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { blocksOf, isBookSlug, parseOpenItiText } from "@tarteel/core";
import type { BookChapter } from "@tarteel/core";
import { Button, Caption, Column, ScreenScroll } from "../../src/components/ui";
import { OrnamentDivider } from "../../src/components/Heritage";
import { HadithError } from "../../src/hadith/parts";
import { useIslamicBookText, useIslamicBooksAllowed } from "../../src/books/hooks";
import { IslamicBooksCredit, IslamicBooksGate, OpenItiCredit } from "../../src/books/parts";
import { readSavedText } from "../../src/books/store";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

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
  const arabicSize = useSettings((s) => s.arabicFontSize);
  const spacing = useSettings((s) => s.lineSpacing);
  const [index, setIndex] = useState<number | null>(chapters.length === 1 ? 0 : null);
  const size = Math.min(34, arabicSize);
  const chapter = index === null ? null : chapters[index] ?? null;
  const blocks = useMemo(() => (chapter ? blocksOf(chapter.text) : []), [chapter]);
  const header = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <Text accessibilityRole="header" style={{ color: th.text, fontSize: 20, fontWeight: "700", fontFamily: HEADING_FONT, writingDirection: "rtl" }}>{title}</Text>
      {chapter ? (
        <>
          <Caption>{`${t("bkChapter")} ${(index ?? 0) + 1} ${t("bkOf")} ${chapters.length}${chapter.vol ? ` · ${chapter.vol}` : ""}${chapter.page !== null ? ` · ${chapter.page}` : ""}`}</Caption>
          {chapter.title !== "" ? <Text style={{ color: th.brassText, fontSize: 17, fontWeight: "700", writingDirection: "rtl" }}>{chapter.title}</Text> : null}
        </>
      ) : <Caption>{t("bkContents")}</Caption>}
    </View>
  );
  const footer = (
    <View style={{ gap: 14, paddingTop: 16 }}>
      {chapter ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button label={t("bkPrev")} disabled={(index ?? 0) === 0} onPress={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))} />
          <Button label={t("bkNext")} disabled={(index ?? 0) >= chapters.length - 1} onPress={() => setIndex((i) => Math.min(chapters.length - 1, (i ?? 0) + 1))} />
          {chapters.length > 1 ? <Button label={t("bkContents")} onPress={() => setIndex(null)} /> : null}
        </View>
      ) : null}
      <OrnamentDivider margin={8} />
      {credit}
    </View>
  );
  const common = { contentContainerStyle: { padding: 16, paddingBottom: 40, width: "100%" as const, maxWidth: 720, alignSelf: "center" as const }, ListHeaderComponent: header, ListFooterComponent: footer };
  if (chapter === null)
    return (
      <FlatList
        key="toc"
        {...common}
        data={chapters.map((c, i) => ({ c, i }))}
        keyExtractor={(x) => String(x.i)}
        initialNumToRender={20}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={item.c.title || `${t("bkChapter")} ${item.i + 1}`} onPress={() => setIndex(item.i)} style={{ minHeight: 48, paddingVertical: 10, paddingLeft: Math.min(4, Math.max(0, item.c.level - 1)) * 14, borderBottomWidth: 1, borderBottomColor: th.border, justifyContent: "center" }}>
            <Text style={{ color: th.text, fontSize: 16, writingDirection: "rtl", textAlign: "left" }}>{item.c.title || `${t("bkChapter")} ${item.i + 1}`}</Text>
          </Pressable>
        )}
      />
    );
  return (
    <FlatList
      key={`c${index}`}
      {...common}
      data={blocks}
      keyExtractor={(_, i) => String(i)}
      initialNumToRender={8}
      windowSize={7}
      renderItem={({ item }) => (
        <Text selectable style={{ color: th.text, fontSize: size, lineHeight: size * Math.max(1.5, spacing), writingDirection: "rtl", textAlign: "left", marginBottom: 14 }}>{item}</Text>
      )}
    />
  );
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
