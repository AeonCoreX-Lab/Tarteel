import { useRef, useState } from "react";
import { FlatList, Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MARKS } from "../brand";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { HEADING_FONT, useTheme } from "../theme";
import type { Theme } from "../theme";
import { PillButton } from "./ui";

// ---- illustrations: simple original vector shapes (no third-party artwork)

/** Faint mosque skyline: central dome, two minarets, small side domes. */
function Skyline({ th }: { th: Theme }) {
  const fill = th.dark ? "#FFFFFF" : "#03402E";
  return (
    <Svg width="100%" height={170} viewBox="0 0 360 170" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x="0" y="150" width="360" height="20" fill={fill} opacity={0.07} />
      {/* central dome */}
      <Path d="M120 150 V112 C120 78 150 62 180 62 C210 62 240 78 240 112 V150 Z" fill={fill} opacity={0.08} />
      <Path d="M180 40 C186 50 186 58 180 62 C174 58 174 50 180 40 Z" fill={fill} opacity={0.1} />
      {/* side domes */}
      <Path d="M70 150 V128 C70 112 84 104 98 104 C112 104 126 112 126 128 V150 Z" fill={fill} opacity={0.07} />
      <Path d="M234 150 V128 C234 112 248 104 262 104 C276 104 290 112 290 128 V150 Z" fill={fill} opacity={0.07} />
      {/* minarets */}
      <Rect x="40" y="70" width="14" height="80" fill={fill} opacity={0.08} />
      <Path d="M38 70 H56 L47 50 Z" fill={fill} opacity={0.1} />
      <Rect x="306" y="70" width="14" height="80" fill={fill} opacity={0.08} />
      <Path d="M304 70 H322 L313 50 Z" fill={fill} opacity={0.1} />
    </Svg>
  );
}

/** Three language cards, as in the brand mockup. */
function LanguageCards({ th }: { th: Theme }) {
  const items = [
    { label: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", sub: "Arabic", rtl: true },
    { label: "\u09AC\u09BE\u0982\u09B2\u09BE", sub: "Bangla", rtl: false },
    { label: "English", sub: "English", rtl: false },
  ];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 10, width: "78%", alignSelf: "center" }}>
      {items.map((i, idx) => (
        <View
          key={i.sub}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 50, paddingHorizontal: 16,
            borderRadius: 12, backgroundColor: th.surface, borderWidth: 1, borderColor: th.border,
            transform: [{ translateX: (idx - 1) * 10 }],
          }}
        >
          <Text style={{ color: th.text, fontSize: 18, writingDirection: i.rtl ? "rtl" : "ltr" }}>{i.label}</Text>
          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: idx === 1 ? th.accent : th.border, backgroundColor: idx === 1 ? th.accent : "transparent" }} />
        </View>
      ))}
    </View>
  );
}

/** A phone outline with a download badge: content that stays on the device. */
function OfflinePhone({ th }: { th: Theme }) {
  const stroke = th.dark ? "#EEE9DB" : "#03402E";
  return (
    <Svg width={150} height={190} viewBox="0 0 150 190" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x="30" y="6" width="90" height="178" rx="16" fill={th.surface} stroke={stroke} strokeWidth={3} />
      <Rect x="62" y="14" width="26" height="5" rx="2.5" fill={stroke} opacity={0.35} />
      <Circle cx="75" cy="98" r="28" fill={th.accent} />
      <Path d="M75 84 V104 M65 96 L75 106 L85 96" stroke={th.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x="52" y="140" width="46" height="5" rx="2.5" fill={th.brass} />
    </Svg>
  );
}

interface Slide {
  id: "quran" | "translations" | "offline";
  title: StringKey;
  body: StringKey;
}
const SLIDES: Slide[] = [
  { id: "quran", title: "slide1Title", body: "slide1Body" },
  { id: "translations", title: "slide2Title", body: "slide2Body" },
  { id: "offline", title: "slide3Title", body: "slide3Body" },
];

/** First-run intro: three pages, then hands over to the functional Setup. */
export function WelcomeCarousel({ onDone }: { onDone: () => void }) {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ref = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const next = () => {
    if (last) return onDone();
    ref.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top }}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 20, minHeight: 48, justifyContent: "center" }}>
        {!last ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("skipIntro")} onPress={onDone} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "flex-end" }}>
            <Text style={{ color: th.muted, fontSize: 15, fontWeight: "600" }}>{t("skipIntro")}</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.id}
        onMomentumScrollEnd={onEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View accessible accessibilityLabel={`${t("page")} ${i + 1} / ${SLIDES.length}. ${t(item.title)}. ${t(item.body)}`} style={{ width, alignItems: "center", paddingHorizontal: 28 }}>
            <Image source={th.dark ? MARKS.light : MARKS.color} accessibilityIgnoresInvertColors style={{ width: 92, height: 92 }} resizeMode="contain" />
            <Text accessibilityRole="header" style={{ marginTop: 20, color: th.text, fontSize: 28, lineHeight: 36, fontWeight: "700", textAlign: "center", fontFamily: HEADING_FONT }}>{t(item.title)}</Text>
            <Text style={{ marginTop: 12, color: th.muted, fontSize: 16, lineHeight: 24, textAlign: "center" }}>{t(item.body)}</Text>
            <View style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}>
              {item.id === "quran" ? <Skyline th={th} /> : item.id === "translations" ? <LanguageCards th={th} /> : <OfflinePhone th={th} />}
            </View>
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {SLIDES.map((s, i) => (
            <View key={s.id} style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? th.accent : th.border }} />
          ))}
        </View>
        <PillButton label={last ? t("getStarted") : t("nextPage")} onPress={next} />
      </View>
    </View>
  );
}
