import { useMemo, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { estimateReciterBytes, searchReciters } from "@tarteel/audio";
import type { Reciter } from "@tarteel/audio";
import { Button, Caption, Card, Chip, Row, Segmented } from "../src/components/ui";
import { audio, RECITERS, selectedReciter } from "../src/audio/runtime";
import { formatBytes, useDownloadState, useReciterStats } from "../src/audio/hooks";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import type { StringKey } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/**
 * Reciters, and where the downloads live.
 *
 * "Which voices do I have offline?" is a question about every reciter at once, so it is answered on this list: a row
 * that has audio says how much and offers to delete it; a row that has none offers to fetch it. A screen rather than a
 * sheet, because a confirmation dialog inside a modal sheet is two stacked modals, which Android does not reliably draw.
 * Deleting is two taps, in place: a gigabyte is too much to lose to a mis-tap.
 */
export default function RecitersScreen() {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const download = useDownloadState();
  const { stats, refresh } = useReciterStats(RECITERS.map((r) => r.id));
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const chosen = selectedReciter();
  const list = useMemo(() => searchReciters(query, RECITERS), [query]);

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <Card padding={16}>
        <View style={{ gap: 10 }}>
          <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT, fontSize: 16 }}>{t("allowStreaming")}</Text>
          <Segmented label={t("allowStreaming")} value={s.audioAllowStreaming ? 1 : 0} onChange={(v) => s.set("audioAllowStreaming", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("allowStreamingAction") }]} />
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("streamingBody")}</Text>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("recitationPrivacy")}</Text>
        </View>
      </Card>
      {RECITERS.length > 0 ? (
        <TextInput
          accessibilityLabel={t("searchReciters")}
          placeholder={t("searchReciters")}
          placeholderTextColor={th.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: th.border, backgroundColor: th.surfaceAlt, color: th.text, paddingHorizontal: 12, fontSize: 16 }}
        />
      ) : (
        <Card padding={16}>
          <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT, fontSize: 16 }}>{t("noRecitersTitle")}</Text>
          <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{t("noRecitersBody")}</Text>
        </Card>
      )}
    </View>
  );

  const footer = RECITERS.length > 0 ? (
    <View style={{ gap: 6, paddingTop: 12 }}>
      <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>{t("audioSources")}</Text>
      {RECITERS.map((r) => (
        <Text key={r.id} selectable style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{r.name}: {r.attribution}{r.timings ? ` · ${r.timings.attribution}` : ""}</Text>
      ))}
    </View>
  ) : null;

  const renderRow = ({ item }: { item: Reciter }) => {
    const st = stats[item.id];
    const job = { kind: "reciter" as const, reciterId: item.id };
    const running = audio.manager.isRunning(job);
    const busyElsewhere = download.running !== null && !running;
    const have = st?.files ?? 0;
    const complete = st?.complete ?? false;
    const last = download.last && download.last.job.reciterId === item.id && download.last.job.kind === "reciter" ? download.last : null;
    const lastMsg: StringKey | null = !last ? null : last.error === "no-space" ? "noSpace" : last.error ? "downloadFailed" : last.complete ? "downloadDone" : last.interrupted ? "downloadInterrupted" : last.failed > 0 ? "downloadIncomplete" : null;
    const isChosen = chosen?.id === item.id;
    return (
      <Card padding={14}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: th.text, fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: th.muted, fontSize: 14, writingDirection: "rtl", textAlign: "left" }}>{item.arabicName}</Text>
            </View>
            <Chip label={item.riwayah} tone="muted" />
          </View>
          <Caption>
            {complete ? `${t("downloadedLabel")} · ${formatBytes(st?.bytes ?? 0)}` : have > 0 ? `${t("partlyDownloaded")} · ${formatBytes(st?.bytes ?? 0)}` : `${t("approx")} ${formatBytes(estimateReciterBytes(item))}`}
          </Caption>
          {running ? (
            <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13 }}>{t("downloading")} · {download.progress.done} / {download.progress.total}</Text>
          ) : lastMsg ? (
            <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13, lineHeight: 18 }}>{t(lastMsg)}</Text>
          ) : null}
          <Row>
            <Button label={isChosen ? t("selected") : t("select")} selected={isChosen} onPress={() => { s.set("audioReciterId", item.id); void audio.controller.stop(); }} />
            {running ? (
              <Button label={t("cancel")} onPress={() => audio.manager.cancel()} />
            ) : !complete ? (
              <Button label={have > 0 ? t("downloadRest") : t("downloadAll")} disabled={busyElsewhere} onPress={() => void audio.manager.start(job)} />
            ) : null}
            {have > 0 && !running ? (
              <Button
                label={confirmId === item.id ? t("tapAgainToDelete") : t("delete")}
                onPress={() => {
                  if (confirmId !== item.id) return setConfirmId(item.id);
                  setConfirmId(null);
                  if (isChosen) void audio.controller.stop();
                  void audio.store.removeReciter(item.id).then(refresh);
                }}
              />
            ) : null}
          </Row>
        </View>
      </Card>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t("reciters") }} />
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        extraData={[stats, download, confirmId, chosen?.id, query]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
      />
    </>
  );
}
