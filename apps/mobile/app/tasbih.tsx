import type { ReactNode } from "react";
import { Alert, ScrollView, Pressable, Text, Vibration, View, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { DHIKR_PRESETS, TARGET_CHOICES, countOf, findDhikr, progress, roundsOf, targetOf } from "@tarteel/core";
import type { DhikrPreset } from "@tarteel/core";
import { Icon } from "../src/components/Icons";
import { Card, Caption, Segmented, ScreenScroll } from "../src/components/ui";
import { OrnamentDivider, StarGlyph } from "../src/components/Heritage";
import { useSettings } from "../src/state/settings";
import { tasbihActions, useTasbihState } from "../src/tasbih/store";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/** Picks the words for the app's language: Bengali for Bengali, English for everything else. */
function words(p: DhikrPreset, lang: string): { sound: string; meaning: string } {
  const bn = lang === "bn";
  return { sound: bn ? p.sound.bn : p.sound.en, meaning: bn ? p.meaning.bn : p.meaning.en };
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: selected ? th.accent : th.border, backgroundColor: selected ? th.accent : th.surface, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: selected ? th.onAccent : th.text, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Action({ label, onPress, disabled = false, children }: { label: string; onPress: () => void; disabled?: boolean; children?: ReactNode }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, alignItems: "center", justifyContent: "center", gap: 2, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 })}
    >
      {children}
      <Text style={{ color: th.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** The count, as one large round button: a ring that fills as the round fills, the number inside, and the target under it. */
function CounterButton({ count, target, onTap, label, hint }: { count: number; target: number; onTap: () => void; label: string; hint: string }) {
  const th = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const size = Math.round(Math.min(width - 48, 320));
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const done = target > 0 && count >= target;
  const p = progress(count, target);
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onTap} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.975 : 1 }] })}>
        <Svg width={size} height={size} style={{ position: "absolute" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Circle cx={size / 2} cy={size / 2} r={radius - stroke} fill={th.surface} />
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={th.border} strokeWidth={stroke} fill="none" />
          {target > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={done ? th.brass : th.accent}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={circumference * (1 - p)}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          ) : (
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={th.brass} strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" fill="none" />
          )}
        </Svg>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: size * 0.27, lineHeight: size * 0.32, fontWeight: "700", fontVariant: ["tabular-nums"], fontFamily: HEADING_FONT }}>{count}</Text>
          <Text style={{ color: th.muted, fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{target > 0 ? `${t("tsOf")} ${target}` : t("tsNoLimit")}</Text>
        </View>
      </Pressable>
      <View style={{ position: "absolute", top: -2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ backgroundColor: th.bg, paddingHorizontal: 6 }}>
          <StarGlyph size={done ? 20 : 14} fill={done ? th.brass : th.border} />
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const th = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text style={{ color: th.text, fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"], fontFamily: HEADING_FONT }}>{value}</Text>
      <Text style={{ color: th.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

/**
 * The tasbih counter. One thing is the focus, the count; around it only what is needed to say what is being counted and to
 * correct a slip. Nothing is sent anywhere: the count is saved on this device.
 */
export default function Tasbih() {
  const th = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  const vibrate = useSettings((s) => s.tasbihVibrate);
  const arabicSize = useSettings((s) => s.arabicFontSize);
  const setPref = useSettings((s) => s.set);
  const s = useTasbihState();
  const preset = findDhikr(s.selected) ?? DHIKR_PRESETS[0];
  if (!preset) return null;
  const count = countOf(s, preset.id);
  const target = targetOf(s, preset.id);
  const rounds = roundsOf(s, preset.id);
  const index = DHIKR_PRESETS.findIndex((p) => p.id === preset.id);
  const { sound, meaning } = words(preset, lang);
  const nameOf = (p: DhikrPreset): string => (p.arabic === null ? t("tsFree") : words(p, lang).sound);
  const step = (d: 1 | -1): void => {
    const next = DHIKR_PRESETS[(index + d + DHIKR_PRESETS.length) % DHIKR_PRESETS.length];
    if (next) tasbihActions.select(next.id);
  };
  const onTap = (): void => {
    const finished = tasbihActions.tap();
    if (vibrate) Vibration.vibrate(finished ? [0, 70, 70, 140] : 12);
  };
  const confirmReset = (): void => {
    if (count === 0) return;
    Alert.alert(t("tsResetTitle"), t("tsResetBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("tsReset"), style: "destructive", onPress: () => tasbihActions.reset() },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: t("tasbih") }} />
      <ScreenScroll>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityRole="tablist">
          {DHIKR_PRESETS.map((p) => <Pill key={p.id} label={nameOf(p)} selected={p.id === preset.id} onPress={() => tasbihActions.select(p.id)} />)}
        </ScrollView>

        <Card padding={18}>
          <View style={{ gap: 8, alignItems: "center" }}>
            {preset.arabic ? (
              <Text selectable style={{ color: th.text, fontSize: Math.min(arabicSize + 4, 40), lineHeight: Math.min(arabicSize + 4, 40) * 1.7, writingDirection: "rtl", textAlign: "center" }}>{preset.arabic}</Text>
            ) : null}
            {sound ? <Text style={{ color: th.brassText, fontSize: 15, fontWeight: "700", textAlign: "center" }}>{sound}</Text> : null}
            <Text style={{ color: th.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>{meaning}</Text>
          </View>
        </Card>

        <CounterButton count={count} target={target} onTap={onTap} label={`${nameOf(preset)}. ${count}${target > 0 ? ` ${t("tsOf")} ${target}` : ""}`} hint={t("tsTapHint")} />

        <Card padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Stat label={t("tsRoundsHere")} value={rounds} />
            <View style={{ width: 1, alignSelf: "stretch", backgroundColor: th.border }} />
            <Stat label={t("tsToday")} value={s.today} />
          </View>
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Action label={t("tsPrevious")} onPress={() => step(-1)}><Icon name="chevronLeft" size={20} color={th.accentText} /></Action>
          <Action label={t("tsUndo")} onPress={() => tasbihActions.undo()} disabled={count === 0}><Text style={{ color: th.accentText, fontSize: 18, fontWeight: "700" }}>↺</Text></Action>
          <Action label={t("tsReset")} onPress={confirmReset} disabled={count === 0}><Text style={{ color: th.accentText, fontSize: 18, fontWeight: "700" }}>0</Text></Action>
          <Action label={t("tsNext")} onPress={() => step(1)}><Icon name="chevronRight" size={20} color={th.accentText} /></Action>
        </View>

        <OrnamentDivider />

        <View style={{ gap: 8 }}>
          <Caption>{t("tsTarget")}</Caption>
          <Segmented label={t("tsTarget")} value={target} onChange={(v) => tasbihActions.target(v)} options={(TARGET_CHOICES.includes(target) ? TARGET_CHOICES : [...TARGET_CHOICES, target].sort((a, b) => a - b)).map((n) => ({ value: n, label: n === 0 ? t("tsNoLimit") : String(n) }))} />
          <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("tsTargetNote")}</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Caption>{t("tsVibrate")}</Caption>
          <Segmented label={t("tsVibrate")} value={vibrate ? 1 : 0} onChange={(v) => setPref("tasbihVibrate", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]} />
        </View>
      </ScreenScroll>
    </>
  );
}
