import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { HadithError as HadithErrorClass, OPENITI_CREDIT, OPENITI_LICENCE, OPENITI_VERSION } from "@tarteel/core";
import type { OpenItiEntry, OpenItiSaved } from "@tarteel/core";
import { Button, Caption, Card, Chip, Row, ScreenScroll } from "../../src/components/ui";
import { Hero, OrnamentDivider } from "../../src/components/Heritage";
import { HadithError } from "../../src/hadith/parts";
import type { Remote } from "../../src/hadith/hooks";
import { useOpenItiAllowed } from "../../src/books/hooks";
import { BookCover } from "../../src/books/BookCover";
import { OpenItiCredit, openBooksLink } from "../../src/books/parts";
import { listSaved, loadCatalogue, removeSaved, saveBook } from "../../src/books/store";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

type Err = Extract<Remote<unknown>, { status: "error" }>;

/** One OpenITI text: what it is, and the choice to keep it on this device (a download made only when the person taps) or remove it. */
export default function OpenItiBook() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  const allowed = useOpenItiAllowed();
  const [entry, setEntry] = useState<OpenItiEntry | null>(null);
  const [saved, setSaved] = useState<OpenItiSaved | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const abort = useRef<AbortController | null>(null);
  const id = String(uri ?? "");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, cat] = await Promise.all([listSaved(), loadCatalogue().catch(() => null)]);
      if (cancelled) return;
      const s = list.find((x) => x.uri === id) ?? null;
      setSaved(s);
      setEntry(cat?.index.entries.find((e) => e.uri === id) ?? (s ? { uri: s.uri, titleAr: s.titleAr, titleLat: s.titleLat, authorAr: s.authorAr, authorLat: s.authorLat, date: s.date, words: null, url: null } : null));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, [id]);
  const toErr = (e: unknown): Err => (e instanceof HadithErrorClass ? { status: "error", code: e.code, retryAfterSeconds: e.retryAfterSeconds } : { status: "error", code: "network", retryAfterSeconds: null });
  const keep = (): void => {
    if (!entry) return;
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError(null);
    saveBook(entry, c.signal).then(
      (list) => { if (!c.signal.aborted) { setSaved(list.find((x) => x.uri === entry.uri) ?? null); setBusy(false); } },
      (e: unknown) => { if (!c.signal.aborted) { setError(toErr(e)); setBusy(false); } },
    );
  };
  const remove = (): void => {
    Alert.alert(t("bkRemove"), "", [
      { text: t("back"), style: "cancel" },
      { text: t("bkRemove"), style: "destructive", onPress: () => void removeSaved(id).then(() => setSaved(null)) },
    ]);
  };
  const title = entry ? (entry.titleAr !== "" ? entry.titleAr : entry.titleLat) : "";
  return (
    <>
      <Stack.Screen options={{ title: t("bkTitle") }} />
      <ScreenScroll>
        {!loaded ? <Caption>{t("knowLoading")}</Caption> : null}
        {loaded && !entry ? <Text style={{ color: th.muted, fontSize: 15 }}>{t("bkNoResults")}</Text> : null}
        {entry ? (
          <>
            <View style={{ alignItems: "center", paddingVertical: 6 }}>
              <BookCover width={170} detailed title={title} author={entry.authorAr || entry.authorLat} id={entry.uri} />
            </View>
            <Hero title={title} {...(entry.titleAr !== "" ? { subtitle: entry.titleLat } : {})} icon="books" />
            <Card padding={16}>
              <View style={{ gap: 10 }}>
                <Text selectable style={{ color: th.text, fontSize: 17, fontWeight: "700" }}>{entry.authorAr || entry.authorLat}</Text>
                {entry.authorAr && entry.authorLat ? <Caption>{entry.authorLat}</Caption> : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {entry.date > 0 ? <Chip label={`${t("bkDied")} ${entry.date} ${t("bkAH")}`} /> : null}
                  {entry.words !== null ? <Chip label={`${entry.words.toLocaleString()} ${t("bkWords")}`} /> : null}
                  <Chip label={OPENITI_LICENCE.name} tone="brass" />
                  <Chip label={`OpenITI ${OPENITI_VERSION}`} />
                </View>
                <Text selectable style={{ color: th.muted, fontSize: 12 }}>{entry.uri}</Text>
              </View>
            </Card>
            {error ? <HadithError state={error} retry={keep} /> : null}
            {saved ? (
              <Row>
                <Button label={t("bkRead")} onPress={() => router.push(`/books/read?src=openiti&uri=${encodeURIComponent(saved.uri)}&title=${encodeURIComponent(title)}`)} />
                <Button label={t("bkRemove")} onPress={remove} />
              </Row>
            ) : allowed ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("bkKeepNote")}</Text>
                <Row>
                  <Button label={busy ? t("bkOiWorking") : t("bkKeep")} disabled={busy} onPress={keep} />
                </Row>
              </View>
            ) : (
              <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("bkOiSettingBody")}</Text>
            )}
            {saved ? <Caption>{`${t("bkKept")} · ${(saved.chars / 1_000_000).toFixed(1)} ${t("bkMB")}`}</Caption> : null}
            <Row>
              <Button label={t("bkOpenSource")} hint={OPENITI_CREDIT.url} onPress={() => openBooksLink(OPENITI_CREDIT.url)} />
            </Row>
          </>
        ) : null}
        <OrnamentDivider margin={8} />
        <OpenItiCredit />
      </ScreenScroll>
    </>
  );
}
