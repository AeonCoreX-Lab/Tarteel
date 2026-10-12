import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PRAYER_EVENTS, dayArc, formatCountdown, toHijri } from "@tarteel/prayer";
import type { PrayerEvent } from "@tarteel/prayer";
import type { Surah } from "@tarteel/types";
import { MARKS } from "../../src/brand";
import { Icon } from "../../src/components/Icons";
import type { IconName } from "../../src/components/Icons";
import { Button, Caption, Card, Chip, Heading, PillButton, Row, ScreenScroll } from "../../src/components/ui";
import { WaqtArc } from "../../src/components/WaqtArc";
import { LocationError, detectLocation } from "../../src/platform/location";
import { hijriMonthLabel, longDate, to12h } from "../../src/prayer/format";
import { usePrayer } from "../../src/prayer/usePrayer";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import type { StringKey } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

const EVENT_KEY: Record<PrayerEvent, StringKey> = {
  Fajr: "fajr", Sunrise: "sunrise", Dhuhr: "dhuhr", Asr: "asr", Maghrib: "maghrib", Isha: "isha",
};

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, minHeight: 84, borderRadius: 16, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface,
        alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} color={th.accentText} size={26} />
      <Text style={{ color: th.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export default function Today() {
  const prayer = usePrayer();
  const router = useRouter();
  const { repos } = useApp();
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  const lang = useSettings((s) => s.uiLanguage);
  const hijriOffset = useSettings((s) => s.hijriOffsetDays);
  const location = useSettings((s) => s.location);
  const lastRead = useSettings((s) => s.lastRead);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastSurah, setLastSurah] = useState<Surah | undefined>();

  useEffect(() => {
    if (!lastRead) return setLastSurah(undefined);
    void repos.quran.getSurah(lastRead.surahId).then(setLastSurah);
  }, [repos, lastRead]);

  async function useMyLocation() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await detectLocation();
      set("location", r.location);
      if (r.countryCode) set("countryCode", r.countryCode);
    } catch (e) {
      setProblem(e instanceof LocationError && e.reason === "permission-denied" ? t("locationDenied") : t("locationFailed"));
    } finally {
      setBusy(false);
    }
  }

  const now = prayer.status === "ready" ? prayer.now : new Date();
  const hijri = toHijri(now, { offsetDays: hijriOffset });
  const locationChip = location ? (location.label ?? `${location.latitude.toFixed(1)}°, ${location.longitude.toFixed(1)}°`) : t("locationChip");

  const header = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Heading size={28}>{longDate(now, lang)}</Heading>
        <Text accessibilityLabel={`${t("hijriDate")}: ${hijri.day} ${hijriMonthLabel(hijri.month, lang)} ${hijri.year}`} style={{ color: th.brassText, fontSize: 15, fontWeight: "600" }}>
          {hijri.day} {hijriMonthLabel(hijri.month, lang)} {hijri.year} AH
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("locationChip")}: ${locationChip}`}
        onPress={() => router.push("/settings")}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}
      >
        <Icon name="pin" size={18} color={th.accentText} />
        <Text style={{ color: th.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{locationChip}</Text>
      </Pressable>
    </View>
  );

  let body;
  if (prayer.status === "needs-location") {
    body = (
      <Card tone="surface" padding={20} pattern>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Image source={th.dark ? MARKS.light : MARKS.color} accessibilityIgnoresInvertColors style={{ width: 72, height: 72 }} resizeMode="contain" />
          <Heading size={22} align="center">{t("needLocationTitle")}</Heading>
          <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22, textAlign: "center" }}>{t("needLocationBody")}</Text>
          {problem ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 14, textAlign: "center" }}>{problem}</Text> : null}
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <PillButton label={busy ? t("locating") : t("useMyLocation")} onPress={() => void useMyLocation()} disabled={busy} />
            <Button label={t("enterManually")} onPress={() => router.push("/settings")} />
          </View>
          {busy ? <ActivityIndicator color={th.accentText} /> : null}
        </View>
      </Card>
    );
  } else if (prayer.status === "error") {
    body = (
      <Card padding={20}>
        <View style={{ gap: 10 }}>
          <Heading size={20}>{t("timesFailed")}</Heading>
          <Text selectable style={{ color: th.muted, fontSize: 13 }}>{prayer.message}</Text>
          <Row><Button label={t("openSettings")} onPress={() => router.push("/settings")} /></Row>
        </View>
      </Card>
    );
  } else {
    const { today, tomorrow, next, phase } = prayer;
    const arc = dayArc(today.timings, now);
    const nextIsTomorrow = next.at.getDate() !== now.getDate();
    const nextClock = nextIsTomorrow ? tomorrow.timings.Fajr : today.timings[next.name];
    const basis = today.basis;
    body = (
      <>
        <Card tone="accent" pattern padding={18}>
          <Caption color={th.onAccent}>{t("nextPrayer")}</Caption>
          <WaqtArc arc={arc} track={`${th.onAccent}40`} progress={th.brass} tick={th.onAccent} marker={th.brass} markerRing={th.accent} />
          <View accessible accessibilityLabel={`${t("nextPrayer")}: ${t(EVENT_KEY[next.name])}, ${to12h(nextClock)}. ${t("timeLeft")}: ${formatCountdown(next.secondsLeft)}`} style={{ alignItems: "center", marginTop: -104, marginBottom: 6 }}>
            <Text style={{ color: th.onAccent, fontSize: 32, fontWeight: "700", fontFamily: HEADING_FONT }}>{t(EVENT_KEY[next.name])}</Text>
            <Text style={{ color: th.onAccent, fontSize: 15, opacity: 0.9 }}>{to12h(nextClock)}</Text>
            <Text style={{ color: th.onAccent, fontSize: 34, fontWeight: "300", fontVariant: ["tabular-nums"], marginTop: 2 }}>{formatCountdown(next.secondsLeft)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ color: th.onAccent, fontSize: 12, opacity: 0.85 }}>{t("fajr")} {to12h(today.timings.Fajr)}</Text>
            <Text style={{ color: th.onAccent, fontSize: 12, opacity: 0.85 }}>{t("isha")} {to12h(today.timings.Isha)}</Text>
          </View>
        </Card>

        <Card padding={0}>
          {PRAYER_EVENTS.map((name, i) => {
            const isSunrise = name === "Sunrise";
            const isNow = phase === name;
            const isNext = next.name === name && !nextIsTomorrow;
            const order = PRAYER_EVENTS.indexOf(name);
            const passed = !isNow && !isNext && order < PRAYER_EVENTS.indexOf(phase === "Night" ? "Fajr" : phase);
            const state = isNow ? t("now") : isNext ? t("next") : passed ? t("passed") : "";
            return (
              <View
                key={name}
                accessible
                accessibilityLabel={`${t(EVENT_KEY[name])}, ${to12h(today.timings[name])}${state ? ", " + state : ""}`}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12, minHeight: isSunrise ? 48 : 60, paddingHorizontal: 16,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: th.border,
                  borderLeftWidth: 4, borderLeftColor: isNow ? th.brass : "transparent", backgroundColor: isNow ? th.surfaceAlt : "transparent",
                }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: passed ? th.accent : "transparent", borderWidth: passed ? 0 : isNext ? 2.5 : 1.5, borderColor: isNext ? th.accentText : th.border }}>
                  {passed ? <Icon name="check" size={16} color={th.onAccent} strokeWidth={2.4} /> : isNow ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: th.brass }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isSunrise ? th.muted : th.text, fontSize: isSunrise ? 15 : 18, fontStyle: isSunrise ? "italic" : "normal", fontWeight: isNow || isNext ? "700" : "500", fontFamily: isSunrise ? undefined : HEADING_FONT }}>{t(EVENT_KEY[name])}</Text>
                </View>
                {state ? <Chip label={state} tone={isNow ? "brass" : isNext ? "accent" : "muted"} /> : null}
                <Text style={{ color: th.text, fontSize: 17, fontVariant: ["tabular-nums"], minWidth: 78, textAlign: "right" }}>{to12h(today.timings[name])}</Text>
              </View>
            );
          })}
        </Card>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Tile icon="compass" label={t("qibla")} onPress={() => router.push("/qibla")} />
          <Tile icon="calendar" label={t("month")} onPress={() => router.push("/month")} />
          <Tile icon="bell" label="Alerts" onPress={() => router.push("/alerts")} />
        </View>

        {lastRead && lastSurah ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("continueReading")}: ${lastSurah.nameTransliteration}, ${t("ayah")} ${lastRead.ayahNumber}`}
            onPress={() => router.push(`/surah/${lastRead.surahId}?ayah=${lastRead.ayahNumber}`)}
          >
            <Card padding={16}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: th.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="quran" color={th.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.muted, fontSize: 12 }}>{t("continueReading")}</Text>
                  <Text style={{ color: th.text, fontSize: 18, fontWeight: "700", fontFamily: HEADING_FONT }}>{lastSurah.nameTransliteration} · {lastRead.ayahNumber}</Text>
                </View>
                <Icon name="chevronRight" color={th.muted} size={20} />
              </View>
            </Card>
          </Pressable>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>
            {basis.methodName}{basis.source === "country" ? ` (${t("defaultForRegion")})` : ""} · {basis.school === 1 ? t("hanafi") : t("standardAsr")}
          </Text>
          <Row><Button label={t("changeMethod")} onPress={() => router.push("/settings")} /></Row>
        </View>
      </>
    );
  }

  return (
    <ScreenScroll headerless>
      {header}
      {body}
    </ScreenScroll>
  );
}
