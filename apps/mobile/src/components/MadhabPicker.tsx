import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { MADHABS, madhabChoice, selectedMadhab } from "@tarteel/core";
import type { Madhab } from "@tarteel/core";
import { previewAsrBySchool, resolveMethod } from "@tarteel/prayer";
import { calculateTimes } from "../platform/prayer-adapter";
import { to12h } from "../prayer/format";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";

const NAME_KEY: Record<Madhab, StringKey> = { hanafi: "madhabHanafi", maliki: "madhabMaliki", shafii: "madhabShafii", hanbali: "madhabHanbali" };

/**
 * The school picker, used by the setup step and by Settings, so both ask the same way.
 * One row per school with that school's own Asr time for today, which is what makes the choice concrete. Only the
 * Hanafi reckoning moves Asr (the other three share the standard time), and the note under the list says so.
 * Picking writes `madhab` and `asrSchool` together; "I'm not sure" clears both and the region's usual practice applies.
 */
export function MadhabPicker() {
  const th = useTheme();
  const t = useT();
  const s = useSettings();
  const chosen = selectedMadhab(s.madhab, s.asrSchool);
  const unsure = s.madhab === null && s.asrSchool === null;
  const choice = resolveMethod({ userMethodId: s.calcMethodId, userSchool: s.asrSchool, countryCode: s.countryCode });
  const asr = useMemo(() => {
    if (!s.location) return null;
    try { return previewAsrBySchool(calculateTimes, s.location, new Date(), choice.methodId); } catch { return null; }
  }, [s.location, choice.methodId]);
  const regionSchool = resolveMethod({ userMethodId: s.calcMethodId, userSchool: null, countryCode: s.countryCode }).school;
  const timeOf = (m: Madhab | null): string => {
    if (!asr) return "—";
    const school = m === null ? regionSchool : m === "hanafi" ? 1 : 0;
    return to12h(school === 1 ? asr.hanafi : asr.standard);
  };

  function pick(m: Madhab | null) {
    const c = madhabChoice(m);
    s.set("madhab", c.madhab);
    s.set("asrSchool", c.asrSchool);
  }

  const rows: { id: Madhab | null; label: string; selected: boolean }[] = [
    ...MADHABS.map((m) => ({ id: m as Madhab | null, label: t(NAME_KEY[m]), selected: chosen === m })),
    { id: null, label: t("madhabUnsure"), selected: unsure },
  ];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 14 }}>
        <Text style={{ color: th.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>{t("madhabAsrToday")}</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={t("madhabTitle")} style={{ borderRadius: 14, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <Pressable
            key={r.id ?? "unsure"}
            accessibilityRole="radio"
            accessibilityState={{ selected: r.selected }}
            accessibilityLabel={`${r.label}, ${t("madhabAsrToday")} ${timeOf(r.id)}`}
            onPress={() => pick(r.id)}
            style={({ pressed }) => ({
              minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: th.border, backgroundColor: r.selected ? th.surfaceAlt : "transparent", opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: r.selected ? th.accent : th.muted, alignItems: "center", justifyContent: "center" }}>
              {r.selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.accent }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: th.text, fontSize: 16, fontWeight: r.selected ? "700" : "500" }}>{r.label}</Text>
              {r.id === null && r.selected ? <Text style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{t("madhabUnsureNote")}</Text> : null}
            </View>
            <Text style={{ color: r.selected ? th.text : th.muted, fontSize: 17, fontVariant: ["tabular-nums"] }}>{timeOf(r.id)}</Text>
          </Pressable>
        ))}
      </View>
      {s.madhab === null && s.asrSchool !== null ? (
        <Text style={{ color: th.muted, fontSize: 13 }}>{t("madhabCurrent")}: {s.asrSchool === 1 ? t("hanafi") : t("standardAsr")}</Text>
      ) : null}
      <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{asr ? t("madhabNote") : `${t("madhabNoPlace")} ${t("madhabNote")}`}</Text>
    </View>
  );
}
