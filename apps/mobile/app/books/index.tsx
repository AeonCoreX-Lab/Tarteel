import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { HadithError as HadithErrorClass, ISLAMIC_BOOKS_GENRES, OPENITI_CREDIT, searchCatalogue } from "@tarteel/core";
import type { CatalogueIndex, IslamicBookSummary, IslamicSearchHit, OpenItiEntry, OpenItiSaved } from "@tarteel/core";
import { Icon } from "../../src/components/Icons";
import { Button, Caption, Card, ScreenScroll, Segmented } from "../../src/components/ui";
import { Hero, ListRow, OrnamentDivider, SectionHeader } from "../../src/components/Heritage";
import { HadithError } from "../../src/hadith/parts";
import type { Remote } from "../../src/hadith/hooks";
import { useIslamicBookList, useIslamicGenres, useIslamicSearch, useOpenItiAllowed, useSavedBooks } from "../../src/books/hooks";
import { BookCover } from "../../src/books/BookCover";
import { IslamicBooksCredit, IslamicBooksGate, OpenItiCredit, OpenItiGate, openBooksLink } from "../../src/books/parts";
import { downloadCatalogue, loadCatalogue } from "../../src/books/store";
import { islamicBooksEnabled, openItiEnabled } from "../../src/online/runtime";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

type Tab = "online" | "openiti" | "saved";

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surface, alignItems: "center", justifyContent: "center" }}
    >
      <Text numberOfLines={1} style={{ color: selected ? th.onAccent : th.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChange, onSubmit, placeholder }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>
      <Icon name="search" size={22} color={th.accentText} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={th.muted}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={{ flex: 1, minHeight: 48, color: th.text, fontSize: 16 }}
      />
    </View>
  );
}

function BookRow({ b }: { b: IslamicBookSummary }) {
  const t = useT();
  const router = useRouter();
  const died = b.authorDiedHijri !== null ? `${t("bkDied")} ${b.authorDiedHijri} ${t("bkAH")}` : null;
  const sub = [b.titleEn, b.authorAr ?? b.authorEn, died].filter((x) => x && x.trim() !== "").join(" · ");
  return <ListRow title={b.titleAr} rtlTitle subtitle={sub || undefined} tag={b.pages !== null ? `${b.pages} ${t("bkPages")}` : undefined} lead={<BookCover width={48} title={b.titleAr} author={b.authorAr ?? b.authorEn} genre={b.genre} id={b.slug} />} onPress={() => router.push(`/books/${encodeURIComponent(b.slug)}`)} label={`${b.titleAr}. ${sub}`} />;
}

function HitRow({ h }: { h: IslamicSearchHit }) {
  const router = useRouter();
  const title = h.bookTitleAr ?? h.bookTitleEn ?? h.bookSlug;
  const sub = [h.bookTitleEn !== title ? h.bookTitleEn : null, h.chapterTitleAr ?? h.chapterTitleEn].filter(Boolean).join(" · ");
  return <ListRow title={title} rtlTitle subtitle={sub || undefined} lead={<BookCover width={48} title={title} id={h.bookSlug} />} onPress={() => router.push(`/books/${encodeURIComponent(h.bookSlug)}`)} label={`${title}. ${sub}`} />;
}

const label = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

function OnlineTab() {
  const t = useT();
  const [genre, setGenre] = useState("");
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const genres = useIslamicGenres();
  const list = useIslamicBookList(genre);
  const search = useIslamicSearch(asked, genre);
  const searching = asked.trim().length >= 2;
  const chips = genres.state.status === "ready" && genres.state.value.length > 0 ? genres.state.value.map((g) => ({ slug: g.slug, label: g.label })) : ISLAMIC_BOOKS_GENRES.map((g) => ({ slug: g, label: label(g) }));
  const err = (state: Remote<unknown>, retry: () => void) => (state.status === "error" ? <HadithError state={state} retry={retry} /> : null);
  return (
    <IslamicBooksGate>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        <Pill label={t("bkAll")} selected={genre === ""} onPress={() => setGenre("")} />
        {chips.map((g) => <Pill key={g.slug} label={g.label} selected={genre === g.slug} onPress={() => setGenre(g.slug)} />)}
      </ScrollView>
      <SearchBox value={query} onChange={setQuery} onSubmit={() => setAsked(query)} placeholder={t("bkSearchPlaceholder")} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label={t("bkSearchGo")} disabled={query.trim().length < 2} onPress={() => setAsked(query)} />
        {searching ? <Button label={t("bkClearSearch")} onPress={() => { setAsked(""); setQuery(""); }} /> : null}
      </View>
      {searching ? (
        search.state.status === "error" ? err(search.state, search.retry) :
        search.state.status !== "ready" ? <Caption>{t("knowSearching")}</Caption> :
        search.state.value.length === 0 ? <Text style={{ fontSize: 15 }}>{t("bkNoResults")}</Text> :
        <View style={{ gap: 10 }}>{search.state.value.map((h, i) => <HitRow key={`${h.bookSlug}:${i}`} h={h} />)}</View>
      ) : (
        <View style={{ gap: 10 }}>
          {list.total > 0 ? <SectionHeader label={t("bkTitle")} trailing={`${list.total} ${t("bkBooks")}`} /> : null}
          {list.items.map((b) => <BookRow key={b.slug} b={b} />)}
          {err(list.state, list.retry)}
          {list.state.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
          {list.state.status === "ready" && list.items.length === 0 ? <Text style={{ fontSize: 15 }}>{t("bkNoResults")}</Text> : null}
          {list.state.status === "ready" && list.hasMore ? <View style={{ flexDirection: "row" }}><Button label={t("bkMore")} onPress={list.loadMore} /></View> : null}
        </View>
      )}
    </IslamicBooksGate>
  );
}

type Catalogue = { index: CatalogueIndex; at: number };
type CatState = { status: "loading" } | { status: "none" } | { status: "working" } | { status: "ready"; value: Catalogue } | { status: "error"; code: HadithErrorClass["code"]; retryAfterSeconds: number | null };

function OpenItiRow({ e }: { e: OpenItiEntry }) {
  const t = useT();
  const router = useRouter();
  const sub = [e.titleLat, [e.authorAr || e.authorLat, e.date > 0 ? `${t("bkDied")} ${e.date} ${t("bkAH")}` : null].filter(Boolean).join(" · ")].filter((x) => x && x.trim() !== "").join(" · ");
  const title = e.titleAr !== "" ? e.titleAr : e.titleLat;
  return <ListRow title={title} rtlTitle={e.titleAr !== ""} subtitle={sub || undefined} tag={e.words !== null ? `${Math.round(e.words / 1000)}k ${t("bkWords")}` : undefined} lead={<BookCover width={48} title={title} author={e.authorAr || e.authorLat} id={e.uri} />} onPress={() => router.push(`/books/openiti?uri=${encodeURIComponent(e.uri)}`)} label={`${title}. ${sub}`} />;
}

function OpenItiTab() {
  const t = useT();
  const th = useTheme();
  const allowed = useOpenItiAllowed();
  const [cat, setCat] = useState<CatState>({ status: "loading" });
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    void loadCatalogue().then((c) => !cancelled && setCat(c ? { status: "ready", value: c } : { status: "none" }), () => !cancelled && setCat({ status: "none" }));
    return () => { cancelled = true; };
  }, [allowed]);
  const fetchList = useCallback(() => {
    setCat({ status: "working" });
    downloadCatalogue().then(
      (value) => setCat({ status: "ready", value }),
      (e: unknown) => setCat(e instanceof HadithErrorClass ? { status: "error", code: e.code, retryAfterSeconds: e.retryAfterSeconds } : { status: "error", code: "network", retryAfterSeconds: null }),
    );
  }, []);
  const results = useMemo(() => (cat.status === "ready" && query.trim().length >= 2 ? searchCatalogue(cat.value.index, query, 40) : []), [cat, query]);
  return (
    <OpenItiGate>
      {cat.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
      {cat.status === "error" ? <HadithError state={cat} retry={fetchList} /> : null}
      {cat.status === "none" || cat.status === "working" || cat.status === "error" ? (
        <Card padding={16}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: th.text, fontSize: 16, fontWeight: "700" }}>{t("bkOiNoList")}</Text>
            <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("bkOiNoListBody")}</Text>
            <View style={{ flexDirection: "row" }}>
              <Button label={cat.status === "working" ? t("bkOiWorking") : t("bkOiGetList")} disabled={cat.status === "working"} onPress={fetchList} />
            </View>
          </View>
        </Card>
      ) : null}
      {cat.status === "ready" ? (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder={t("bkSearchOiPlaceholder")} />
          <Caption>{`${cat.value.index.entries.length} ${t("bkTitles")} · ${t("bkOiListAt")} ${new Date(cat.value.at).toLocaleDateString()}`}</Caption>
          {query.trim().length >= 2 ? (
            results.length === 0 ? <Text style={{ color: th.muted, fontSize: 15 }}>{t("bkNoResults")}</Text> : <View style={{ gap: 10 }}>{results.map((e) => <OpenItiRow key={e.uri} e={e} />)}</View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button label={t("bkOiUpdateList")} onPress={fetchList} />
            <Button label={t("bkOpenSource")} hint={OPENITI_CREDIT.url} onPress={() => openBooksLink(OPENITI_CREDIT.url)} />
          </View>
        </>
      ) : null}
    </OpenItiGate>
  );
}

function SavedRow({ s }: { s: OpenItiSaved }) {
  const t = useT();
  const router = useRouter();
  const title = s.titleAr !== "" ? s.titleAr : s.titleLat;
  const sub = [s.titleLat !== title ? s.titleLat : null, s.authorAr || s.authorLat, `${Math.max(1, Math.round(s.chars / 1_000_000 * 10) / 10)} ${t("bkMB")}`].filter(Boolean).join(" · ");
  return <ListRow title={title} rtlTitle={s.titleAr !== ""} subtitle={sub} lead={<BookCover width={48} title={title} author={s.authorAr || s.authorLat} id={s.uri} />} onPress={() => router.push(`/books/read?src=openiti&uri=${encodeURIComponent(s.uri)}&title=${encodeURIComponent(title)}`)} label={`${title}. ${sub}`} />;
}

function SavedTab() {
  const t = useT();
  const th = useTheme();
  const { saved, bytes, reload } = useSavedBooks();
  useFocusEffect(reload);
  if (saved === null) return <Caption>{t("knowLoading")}</Caption>;
  if (saved.length === 0) return <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("bkSavedEmpty")}</Text>;
  return (
    <View style={{ gap: 10 }}>
      <Caption>{`${t("bkStorage")}: ${(bytes / 1_000_000).toFixed(1)} ${t("bkMB")}`}</Caption>
      {saved.map((s) => <SavedRow key={s.uri} s={s} />)}
    </View>
  );
}

/**
 * Books, inside the Knowledge tab: classical books read live from islamic.app (nothing stored), and the OpenITI corpus, where
 * the person chooses a book to keep on the device and read offline. Each source is off until the person turns it on.
 */
export default function BooksHome() {
  const t = useT();
  const first: Tab = islamicBooksEnabled ? "online" : openItiEnabled ? "openiti" : "saved";
  const [tab, setTab] = useState<Tab>(first);
  const options: { value: Tab; label: string }[] = [];
  if (islamicBooksEnabled) options.push({ value: "online", label: t("bkTabOnline") });
  if (openItiEnabled) options.push({ value: "openiti", label: t("bkTabOpenIti") }, { value: "saved", label: t("bkTabSaved") });
  return (
    <>
      <Stack.Screen options={{ title: t("bkTitle") }} />
      <ScreenScroll>
        <Hero title={t("bkTitle")} subtitle={t("bkIntro")} icon="books" />
        {options.length > 1 ? <Segmented label={t("bkTitle")} value={tab} onChange={setTab} options={options} /> : null}
        {tab === "online" ? <OnlineTab /> : tab === "openiti" ? <OpenItiTab /> : <SavedTab />}
        <OrnamentDivider margin={8} />
        {tab === "online" ? <IslamicBooksCredit /> : <OpenItiCredit />}
      </ScreenScroll>
    </>
  );
}
