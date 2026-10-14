import { Text, View } from "react-native";
import { Button, Row } from "../components/ui";
import { useT } from "../i18n";
import { useSettings } from "../state/settings";
import { useTheme } from "../theme";
import { usePlaybackStatus } from "./hooks";
import { downloadSurah, selectedReciter, surahLabel } from "./runtime";

/**
 * Says WHY playback did not start or stopped, and offers the two honest fixes.
 *
 * Only the app can tell a gap in the download from a dead network, and only the app knows which ayah. With streaming
 * off, an ayah that is not downloaded is never skipped silently and never fetched silently: it is named here.
 */
export function AudioNotice() {
  const th = useTheme();
  const t = useT();
  const { blocked, gap } = usePlaybackStatus();
  const set = useSettings((s) => s.set);
  const streaming = useSettings((s) => s.audioAllowStreaming);
  const ref = blocked ?? gap;
  if (!ref) return null;
  const reciter = selectedReciter();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 8, paddingHorizontal: 14, paddingTop: 10 }}>
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 18 }}>
        {surahLabel(ref.surahId)} {ref.surahId}:{ref.ayahNumber} · {blocked ? t("blockedNotice") : t("gapNotice")}
      </Text>
      <Row>
        {reciter ? <Button label={t("downloadSurah")} onPress={() => void downloadSurah(reciter, ref.surahId)} /> : null}
        {!streaming ? <Button label={t("allowStreamingAction")} hint={t("streamingBody")} onPress={() => set("audioAllowStreaming", true)} /> : null}
      </Row>
    </View>
  );
}
