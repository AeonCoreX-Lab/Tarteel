import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Text, View } from "react-native";
import { BRAND, MARKS } from "../brand";
import { useT } from "../i18n";
import { HEADING_FONT, useTheme } from "../theme";

/**
 * In-app splash shown while the databases open. It continues the native splash (same mark, same colours),
 * adds the wordmark and a thin gold progress bar. Respects reduce-motion (static bar).
 */
export function BrandSplash({ error }: { error: Error | null }) {
  const th = useTheme();
  const t = useT();
  const [reduceMotion, setReduceMotion] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);
  useEffect(() => {
    if (reduceMotion || error) return;
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, error, slide]);

  const BAR = 120;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: th.dark ? "#053227" : th.bg, padding: 24 }}>
      <Image source={th.dark ? MARKS.light : MARKS.color} accessibilityIgnoresInvertColors style={{ width: 150, height: 150 }} resizeMode="contain" />
      <Text accessibilityRole="header" style={{ marginTop: 14, color: th.dark ? "#FBF9F4" : "#09372C", fontSize: 34, fontWeight: "700", fontFamily: HEADING_FONT }}>{BRAND.name}</Text>
      <Text style={{ color: th.dark ? "#FBF9F4" : "#09372C", fontSize: 22, marginTop: 2 }}>{BRAND.arabicName}</Text>
      <Text style={{ marginTop: 10, color: th.dark ? "#C9D6CF" : th.muted, fontSize: 11, letterSpacing: 2.4, textTransform: "uppercase" }}>{t("tagline")}</Text>

      {error ? (
        <View style={{ marginTop: 32, gap: 8, alignItems: "center" }}>
          <Text style={{ color: th.dark ? "#FBF9F4" : th.text, fontSize: 17, fontWeight: "700" }}>{t("loadFailed")}</Text>
          <Text selectable style={{ color: th.dark ? "#C9D6CF" : th.muted, textAlign: "center", fontSize: 13 }}>{error.message}</Text>
        </View>
      ) : (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t("loading")}
          style={{ marginTop: 36, width: BAR, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: th.dark ? "#1E4A3C" : th.border }}
        >
          {reduceMotion ? (
            <View style={{ width: BAR * 0.4, height: 4, backgroundColor: th.brass }} />
          ) : (
            <Animated.View style={{ width: BAR * 0.4, height: 4, backgroundColor: th.brass, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-BAR * 0.4, BAR] }) }] }} />
          )}
        </View>
      )}
    </View>
  );
}
