import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode, RefObject } from "react";
import { HEADING_FONT, useTheme } from "../theme";
import { GeoPattern } from "./Ornaments";

/** Text-labelled button, 44dp minimum touch target. Never icon-only (accessibility). */
export function Button({ label, onPress, selected, disabled, hint }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean; hint?: string;
}) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 8, borderWidth: 1,
        borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surface,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: selected ? th.onAccent : th.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Full-width rounded call-to-action, as in the brand mockups (Next / Get Started). */
export function PillButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
        backgroundColor: th.accent, opacity: disabled ? 0.4 : pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: th.onAccent, fontSize: 17, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const th = useTheme();
  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", paddingHorizontal: 4 }}>{title}</Text>
      <View style={{ gap: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>{children}</View>
    </View>
  );
}

/** Serif title in the brand voice. */
export function Heading({ children, size = 26, color, align }: { children: ReactNode; size?: number; color?: string; align?: "left" | "center" }) {
  const th = useTheme();
  return (
    <Text accessibilityRole="header" style={{ color: color ?? th.text, fontSize: size, lineHeight: size * 1.25, fontWeight: "700", fontFamily: HEADING_FONT, textAlign: align ?? "left" }}>
      {children}
    </Text>
  );
}

export function Caption({ children, color, size = 13 }: { children: ReactNode; color?: string; size?: number }) {
  const th = useTheme();
  return <Text style={{ color: color ?? th.muted, fontSize: size, lineHeight: size * 1.45 }}>{children}</Text>;
}

/** Surface panel. tone "accent" is the brand-green hero, with the quiet star lattice. */
export function Card({ children, tone = "surface", padding = 16, pattern = false }: { children: ReactNode; tone?: "surface" | "accent" | "alt"; padding?: number; pattern?: boolean }) {
  const th = useTheme();
  const bg = tone === "accent" ? th.accent : tone === "alt" ? th.surfaceAlt : th.surface;
  return (
    <View style={{ borderRadius: 18, borderWidth: tone === "accent" ? 0 : 1, borderColor: th.border, backgroundColor: bg, overflow: "hidden" }}>
      {pattern ? <GeoPattern color={tone === "accent" ? th.onAccent : th.text} opacity={tone === "accent" ? 0.09 : 0.05} /> : null}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

/** Pill-style single choice. Reads as a radio group to screen readers. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const th = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 4, borderRadius: 14, backgroundColor: th.surfaceAlt }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{ flexGrow: 1, minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: selected ? th.accent : "transparent" }}
          >
            <Text style={{ color: selected ? th.onAccent : th.text, fontSize: 14, fontWeight: selected ? "700" : "500", textAlign: "center" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, tone = "muted" }: { label: string; tone?: "muted" | "brass" | "accent" }) {
  const th = useTheme();
  const color = tone === "brass" ? th.brassText : tone === "accent" ? th.onAccent : th.muted;
  const bg = tone === "accent" ? th.accent : th.surfaceAlt;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/** Centres content and caps its width so tablets and the web build keep a phone-like reading column. */
export function Column({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap }}>{children}</View>
  );
}

/** Scrolling screen: safe-area aware, width-capped column. `headerless` screens add the status-bar inset themselves. */
export function ScreenScroll({ children, headerless = false, gap = 16, scrollRef }: { children: ReactNode; headerless?: boolean; gap?: number; scrollRef?: RefObject<ScrollView | null> }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingTop: 12 + (headerless ? insets.top : 0), paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <Column gap={gap}>{children}</Column>
    </ScrollView>
  );
}

/**
 * A brief wash of the accent colour over a block, to show where a link from another screen has landed.
 * Bump `signal` (any new number) to play it; 0 does nothing. Two soft pulses, about a second in all. With "reduce motion" on,
 * the block is tinted steadily for the same time instead of pulsing. It never captures touches.
 */
export function Flash({ signal, radius = 18, children }: { signal: number; radius?: number; children: ReactNode }) {
  const th = useTheme();
  const level = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!signal) return;
    let cancelled = false;
    let running: Animated.CompositeAnimation | null = null;
    level.setValue(0);
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const to = (v: number, ms: number) => Animated.timing(level, { toValue: v, duration: ms, useNativeDriver: true });
      running = reduce
        ? Animated.sequence([to(1, 1), Animated.delay(1100), to(0, 1)])
        : Animated.sequence([to(1, 260), to(0, 260), to(1, 260), to(0, 520)]);
      running.start();
    });
    return () => { cancelled = true; running?.stop(); };
  }, [signal, level]);
  return (
    <View>
      {children}
      <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, borderWidth: 2, borderColor: th.accent, backgroundColor: th.accent, opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) }} />
    </View>
  );
}
