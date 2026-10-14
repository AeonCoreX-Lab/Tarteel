import { memo, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Surah } from "@tarteel/types";
import { LIMITS } from "@tarteel/core";
import { AudioNotice } from "../src/audio/AudioNotice";
import { usePlaybackStatus } from "../src/audio/hooks";
import { audio, RECITERS, selectedReciter, surahLabel } from "../src/audio/runtime";
import { Stepper } from "../src/audio/Stepper";
import { StarBadge } from "../src/components/Ornaments";
import { Button, Caption, Card, Row } from "../src/components/ui";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";
import type { Theme } from "../src/theme";

const SurahRow = memo(function SurahRow({ s, th, onPress }: { s: Surah; th: Theme; onPress: (id: number) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${s.nameTransliteration}, ${s.ayahCount}`} onPress={() => onPress(s.id)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: th.border }}>
      <StarBadge n={s.id} size={36} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: th.text, fontSize: 16, fontWeight: "600" }}>{s.nameTransliteration}</Text>
        <Text style={{ color: th.muted, fontSize: 13 }}>{s.nameEnglish} · {s.ayahCount}</Text>
      </View>
      <Text style={{ color: th.text, fontSize: 22, writingDirection: "rtl" }}>{s.nameArabic}</Text>
    </Pressable>
  );
});

/**
 * Listen: the Quran as something you put on. One surah runs into the next, controls are on the lock screen, and the
 * app need not stay open. The queue is a window that walks forward (see @tarteel/audio), not 6,236 tracks at once.
 */
export default function ListenScreen() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { repos } = useApp();
  const s = useSettings();
  const status = usePlaybackStatus();
  const [surahs, setSurahs] = useState<Surah[]>([]);
  useEffect(() => void repos.quran.getSurahs().then(setSurahs), [repos]);
  const c = audio.controller;
  const reciter = selectedReciter();
  const { active, playing } = status;
  const listening = c.isListening();
  const last = s.lastListened && reciter && s.lastListened.reciterId === reciter.id ? s.lastListened : null;

  if (RECITERS.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: t("listen") }} />
        <View style={{ padding: 16 }}>
          <Card padding={16}>
            <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT, fontSize: 16 }}>{t("noRecitersTitle")}</Text>
            <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{t("noRecitersBody")}</Text>
          </Card>
        </View>
      </>
    );
  }

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <Card tone="accent" pattern padding={18}>
        <View style={{ gap: 12 }}>
          <Caption color={th.onAccent}>{active ? (listening ? t("listen") : t("nowPlaying")) : last ? t("continueListening") : t("listen")}</Caption>
          <Text style={{ color: th.onAccent, fontSize: 24, fontWeight: "700", fontFamily: HEADING_FONT }}>
            {active ? `${surahLabel(active.surahId)} · ${active.ayahNumber === 0 ? t("bismillah") : active.ayahNumber}` : last ? `${surahLabel(last.surahId)} · ${last.ayahNumber}` : "—"}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("chooseReciter")} onPress={() => router.push("/reciters")} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: th.onAccent, fontSize: 15, fontWeight: "600" }}>{reciter?.name} ›</Text>
          </Pressable>
          <Row>
            <Button label={`⏮ ${t("previousSurah")}`} disabled={!active} onPress={() => void c.previousSurah()} />
            <Button label={`‹ ${t("previousAyah")}`} disabled={!active} onPress={() => void c.skipToPreviousAyah()} />
          </Row>
          <Row>
            <Button
              label={playing ? `❚❚ ${t("pause")}` : `▶ ${t("play")}`}
              selected
              onPress={() => void (active ? (playing ? c.pause() : c.resume()) : c.listenFrom(last ? { surahId: last.surahId, ayahNumber: last.ayahNumber } : { surahId: 1, ayahNumber: 1 }))}
            />
            {active ? <Button label={`✕ ${t("stopPlayback")}`} onPress={() => void c.stop()} /> : null}
          </Row>
          <Row>
            <Button label={`${t("nextAyah")} ›`} disabled={!active} onPress={() => void c.skipToNextAyah()} />
            <Button label={`${t("nextSurah")} ⏭`} disabled={!active} onPress={() => void c.nextSurah()} />
          </Row>
        </View>
      </Card>
      <AudioNotice />
      <Card padding={16}>
        <View style={{ gap: 16 }}>
          <Stepper label={t("speed")} value={s.audioPlaybackRate} step={0.25} min={LIMITS.audioPlaybackRate.min} max={LIMITS.audioPlaybackRate.max} format={(n) => `${n}×`} onChange={(n) => { s.set("audioPlaybackRate", n); void c.setRate(n); }} />
          <Stepper label={t("repeatEach")} value={s.audioRepeatEachAyah} step={1} min={LIMITS.audioRepeat.min} max={LIMITS.audioRepeat.max} onChange={(n) => s.set("audioRepeatEachAyah", n)} />
          <Stepper label={t("repeatRange")} value={s.audioRepeatRange} step={1} min={LIMITS.audioRepeat.min} max={LIMITS.audioRepeat.max} onChange={(n) => s.set("audioRepeatRange", n)} />
          <Stepper label={t("pauseBetween")} value={s.audioPauseFactor} step={0.5} min={LIMITS.audioPauseFactor.min} max={LIMITS.audioPauseFactor.max} format={(n) => (n === 0 ? t("off") : `${n}×`)} onChange={(n) => s.set("audioPauseFactor", n)} />
          <Caption>{t("recitationPrivacy")}</Caption>
        </View>
      </Card>
      <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", paddingHorizontal: 4, paddingTop: 8 }}>{t("surahsToListen")}</Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: t("listen") }} />
      <FlatList
        data={surahs}
        keyExtractor={(x) => String(x.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => <SurahRow s={item} th={th} onPress={(id) => void c.listenFrom({ surahId: id, ayahNumber: 1 })} />}
        contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        initialNumToRender={14}
        windowSize={9}
      />
    </>
  );
}
