import { Pressable, Text, View } from "react-native";
import { useProgress } from "react-native-track-player";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { useTheme } from "../theme";
import { AudioNotice } from "./AudioNotice";
import { usePlaybackStatus } from "./hooks";
import { audio, selectedReciter, surahLabel } from "./runtime";

/** The ayah's progress, polled only while this card exists (that is, while something is playing). */
function Hairline() {
  const th = useTheme();
  const { position, duration } = useProgress(1000);
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  return (
    <View style={{ height: 3, backgroundColor: th.surfaceAlt }}>
      <View style={{ height: 3, width: `${pct * 100}%`, backgroundColor: th.brass }} />
    </View>
  );
}

function Side({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: th.text, fontSize: 22, fontWeight: "700" }}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * The recitation, carried over every screen while something is playing (mounted once, in the root layout).
 * Ayah reference, the reciter (opens the reciters screen), speed and repeat when they are not the defaults, and
 * previous / play-pause / next / stop. The play button is the single filled control; everything else stays quiet.
 */
export function MiniPlayer() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { active, playing, loading, gap, blocked } = usePlaybackStatus();
  const rate = useSettings((s) => s.audioPlaybackRate);
  const each = useSettings((s) => s.audioRepeatEachAyah);
  if (!active && !gap && !blocked) return null;
  const reciter = selectedReciter();
  const c = audio.controller;
  const chip = (text: string) => (
    <View key={text} style={{ paddingHorizontal: 8, borderRadius: 6, backgroundColor: th.surfaceAlt }}>
      <Text style={{ color: th.text, fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );
  return (
    <View style={{ marginHorizontal: 12, marginBottom: Math.max(insets.bottom, 12), borderRadius: 16, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, overflow: "hidden", flexShrink: 0 }}>
      {active ? <Hairline /> : null}
      <AudioNotice />
      {active ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8 }}>
          <View style={{ flex: 1, marginEnd: 8 }}>
            <Text numberOfLines={1} style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{`${surahLabel(active.surahId)} ${active.surahId}:${active.ayahNumber}`}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t("chooseReciter")} hitSlop={6} onPress={() => router.push("/reciters")}>
                <Text numberOfLines={1} style={{ color: th.accentText, fontSize: 13, fontWeight: "600" }}>{loading ? "…" : (reciter?.name ?? t("chooseReciter"))}</Text>
              </Pressable>
              {rate !== 1 ? chip(`${rate}×`) : null}
              {each > 1 ? chip(`↻ ${each}`) : null}
            </View>
          </View>
          {/* Left to right in every language, as media controls are on both platforms. */}
          <View style={{ flexDirection: "row", alignItems: "center", direction: "ltr" }}>
            <Side glyph="⏮" label={t("previousAyah")} onPress={() => void c.skipToPreviousAyah()} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? t("pause") : t("play")}
              hitSlop={6}
              onPress={() => void (playing ? c.pause() : c.resume())}
              style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: th.accent, marginHorizontal: 4 }}
            >
              <Text style={{ color: th.onAccent, fontSize: 18, fontWeight: "700" }}>{playing ? "❚❚" : "▶"}</Text>
            </Pressable>
            <Side glyph="⏭" label={t("nextAyah")} onPress={() => void c.skipToNextAyah()} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("stopPlayback")} hitSlop={8} onPress={() => void c.stop()} style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: th.surfaceAlt, marginStart: 8 }}>
            <Text style={{ color: th.muted, fontSize: 16, fontWeight: "700" }}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("stopPlayback")} onPress={() => void c.stop()}>
            <Text style={{ color: th.muted, fontSize: 13, fontWeight: "600", paddingVertical: 8 }}>✕ {t("stopPlayback")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
