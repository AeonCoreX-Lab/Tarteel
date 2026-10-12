import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { computeMonth, resolveMethod, shiftMonth, toHijri } from "@tarteel/prayer";
import type { PrayerEvent } from "@tarteel/prayer";
import { Icon } from "../src/components/Icons";
import { Caption, Card, Chip, Heading, ScreenScroll } from "../src/components/ui";
import { calculateTimes } from "../src/platform/prayer-adapter";
import { hijriMonthLabel, short12 } from "../src/prayer/format";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import type { StringKey } from "../src/i18n";
import { useTheme } from "../src/theme";

const COLUMNS: { name: PrayerEvent; key: StringKey }[] = [
  { name: "Fajr", key: "fajr" }, { name: "Sunrise", key: "sunrise" }, { name: "Dhuhr", key: "dhuhr" },
  { name: "Asr", key: "asr" }, { name: "Maghrib", key: "maghrib" }, { name: "Isha", key: "isha" },
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MonthScreen() {
  const th = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  const location = useSettings((s) => s.location);
  const countryCode = useSettings((s) => s.countryCode);
  const methodId = useSettings((s) => s.calcMethodId);
  const school = useSettings((s) => s.asrSchool);
  const offsets = useSettings((s) => s.prayerOffsets);
  const hijriOffset = useSettings((s) => s.hijriOffsetDays);
  const today = new Date();
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const rows = useMemo(() => {
    if (!location) return null;
    const choice = resolveMethod({ userMethodId: methodId, userSchool: school, countryCode });
    return computeMonth(calculateTimes, location, ym.year, ym.month, choice, offsets);
  }, [location, countryCode, methodId, school, offsets, ym]);

  if (!rows) return <ScreenScroll><Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("needLocationBody")}</Text></ScreenScroll>;

  const first = toHijri(rows[0]!.date, { offsetDays: hijriOffset });
  const last = toHijri(rows[rows.length - 1]!.date, { offsetDays: hijriOffset });
  const hijriRange = first.month === last.month && first.year === last.year
    ? `${hijriMonthLabel(first.month, lang)} ${first.year}`
    : `${hijriMonthLabel(first.month, lang)} ${first.year} – ${hijriMonthLabel(last.month, lang)} ${last.year}`;
  const isThisMonth = ym.year === today.getFullYear() && ym.month === today.getMonth() + 1;
  const cell = { flex: 1, textAlign: "center" as const, fontVariant: ["tabular-nums" as const], fontSize: 13 };

  const nav = (icon: "chevronLeft" | "chevronRight", label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setYm((v) => shiftMonth(v.year, v.month, delta))}
      style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name={icon} color={th.accentText} size={22} />
    </Pressable>
  );

  return (
    <ScreenScroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {nav("chevronLeft", t("prevMonth"), -1)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isThisMonth ? `${MONTHS[ym.month - 1]} ${ym.year}` : `${t("today")}: ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
          disabled={isThisMonth}
          onPress={() => setYm({ year: today.getFullYear(), month: today.getMonth() + 1 })}
          style={{ flex: 1, alignItems: "center", minHeight: 48, justifyContent: "center" }}
        >
          <Heading size={22} align="center">{MONTHS[ym.month - 1]} {ym.year}</Heading>
          <Caption color={th.brassText}>{hijriRange}</Caption>
        </Pressable>
        {nav("chevronRight", t("nextMonth"), 1)}
      </View>
      {!isThisMonth ? <View style={{ alignItems: "center" }}><Chip label={t("today")} tone="accent" /></View> : null}

      <Card padding={0}>
        <View style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 8, backgroundColor: th.surfaceAlt }}>
          <Text style={{ width: 48, color: th.muted, fontSize: 12, fontWeight: "700" }}>{t("dayShort")}</Text>
          {COLUMNS.map((c) => <Text key={c.name} style={{ ...cell, color: th.muted, fontWeight: "700", fontSize: 11 }}>{t(c.key)}</Text>)}
        </View>
        {rows.map((r, i) => {
          const isToday = isThisMonth && r.day === today.getDate();
          const weekday = r.date.toLocaleDateString("en", { weekday: "short" });
          const timings = r.result.ok ? r.result.day.timings : null;
          return (
            <View
              key={r.day}
              accessible
              accessibilityLabel={timings
                ? `${weekday} ${r.day}: ${COLUMNS.map((c) => `${t(c.key)} ${short12(timings[c.name]!)}`).join(", ")}`
                : `${weekday} ${r.day}: ${t("failedDay")}`}
              style={{
                flexDirection: "row", alignItems: "center", minHeight: 42, paddingHorizontal: 8,
                borderLeftWidth: 4, borderLeftColor: isToday ? th.brass : "transparent",
                backgroundColor: isToday ? th.surfaceAlt : i % 2 === 1 ? `${th.surfaceAlt}80` : "transparent",
              }}
            >
              <Text style={{ width: 48, color: th.text, fontSize: 13, fontWeight: isToday ? "800" : "500" }}>{r.day} {weekday.slice(0, 2)}</Text>
              {timings
                ? COLUMNS.map((c) => <Text key={c.name} style={{ ...cell, color: c.name === "Sunrise" ? th.muted : th.text }}>{short12(timings[c.name]!)}</Text>)
                : <Text style={{ flex: 1, color: th.muted, fontSize: 12 }}>{t("failedDay")}</Text>}
            </View>
          );
        })}
      </Card>
    </ScreenScroll>
  );
}
