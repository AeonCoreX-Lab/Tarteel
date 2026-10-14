import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Caption, Card, Row } from "../components/ui";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";
import { useDownloadState, useSurahAudioStatus } from "./hooks";
import { audio, downloadSurah, RECITERS, selectedReciter } from "./runtime";

/**
 * The reader's recitation row: play this surah, and how much of it is on this device, with the download beside it.
 * Hidden entirely when the build offers no recitation, so the reader stays exactly as it was.
 */
export function SurahAudio({ surahId }: { surahId: number }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const reciter = selectedReciter();
  const status = useSurahAudioStatus(reciter?.id ?? null, surahId);
  const download = useDownloadState();
  if (RECITERS.length === 0 || !reciter) return null;

  const running = audio.manager.isRunning({ kind: "surah", reciterId: reciter.id, surahId });
  const busyElsewhere = download.running !== null && !running;
  const have = status?.have ?? 0;
  const total = status?.total ?? 0;
  const complete = status !== null && status.missing.length === 0 && total > 0;
  const last = download.last && download.last.job.kind === "surah" && download.last.job.surahId === surahId && download.last.job.reciterId === reciter.id ? download.last : null;
  const lastMsg: StringKey | null = !last ? null : last.error === "no-space" ? "noSpace" : last.error ? "downloadFailed" : last.interrupted ? "downloadInterrupted" : last.failed > 0 ? "downloadIncomplete" : null;

  return (
    <Card padding={14}>
      <View style={{ gap: 10 }}>
        <Row>
          <Button label={`▶ ${t("playSurah")}`} selected onPress={() => void audio.controller.playFromAyah({ surahId, ayahNumber: 1 })} />
          {running ? (
            <Button label={t("cancel")} onPress={() => audio.manager.cancel()} />
          ) : !complete ? (
            <Button label={have > 0 ? t("downloadRest") : t("downloadSurah")} disabled={busyElsewhere} onPress={() => void downloadSurah(reciter, surahId)} />
          ) : null}
        </Row>
        {running ? (
          <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13 }}>{t("downloading")} · {download.progress.done} / {download.progress.total}</Text>
        ) : (
          <Caption>{have} / {total} {t("ayahsOnDevice")}</Caption>
        )}
        {lastMsg ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13, lineHeight: 18 }}>{t(lastMsg)}</Text> : null}
        <Text accessibilityRole="button" accessibilityLabel={t("chooseReciter")} onPress={() => router.push("/reciters")} style={{ color: th.accentText, fontSize: 13, fontWeight: "600", minHeight: 32 }}>{reciter.name} ›</Text>
      </View>
    </Card>
  );
}
