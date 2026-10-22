import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { Icon } from "./Icons";
import type { IconName } from "./Icons";
import { StarBadge, starPoints } from "./Ornaments";
import { Card } from "./ui";
import { useSettings } from "../state/settings";
import { HEADING_FONT, useTheme } from "../theme";

/*
 * Shared pieces for the reading screens of the Knowledge tab and the hadith lookups. Design rules, kept deliberately quiet:
 *  - Only the app's own colours (theme tokens) and its own 8-point star. Gold is used for marks and rules, never for small text
 *    (brassText is the text colour).
 *  - Ornament frames and separates; it is never placed behind text that has to be read at length. The lattice appears only on
 *    the hero card, which holds a title and one short line.
 *  - The Arabic is the largest, most spacious text on a screen; a translation is smaller and sits beside a thin gold rule.
 *  - Sizes follow the person's own Quran reading settings (Arabic size, line spacing), so a hadith is as readable as an ayah.
 *  - Every ornament is hidden from screen readers.
 */

/** A small solid 8-point star: a mark, not a button. */
export function StarGlyph({ size = 14, fill, stroke }: { size?: number; fill?: string; stroke?: string }) {
  const th = useTheme();
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Polygon points={starPoints(24, 24, 22.5, 15)} fill={fill ?? th.brass} stroke={stroke ?? "none"} strokeWidth={stroke ? 2 : 0} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** A thin rule with a star in the middle: separates parts of a long screen. */
export function OrnamentDivider({ margin = 4 }: { margin?: number }) {
  const th = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: margin }}>
      <View style={{ flex: 1, height: 1, backgroundColor: th.border }} />
      <StarGlyph size={12} />
      <View style={{ flex: 1, height: 1, backgroundColor: th.border }} />
    </View>
  );
}

/** A section label: small star, the label in gold text, and a rule that runs to the edge. */
export function SectionHeader({ label, trailing }: { label: string; trailing?: string | undefined }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
      <StarGlyph size={11} />
      <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, height: 1, backgroundColor: th.border }} />
      {trailing ? <Text style={{ color: th.muted, fontSize: 12, fontWeight: "700" }}>{trailing}</Text> : null}
    </View>
  );
}

/**
 * The top of a screen: the brand-green card with the quiet star lattice, a title and one short line. All text is the on-accent
 * colour (contrast-checked); the gold star above the title is a mark only.
 */
export function Hero({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: IconName }) {
  const th = useTheme();
  return (
    <Card tone="accent" pattern padding={20}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: th.brass }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {icon ? <Icon name={icon} size={20} color={th.onAccent} /> : <StarGlyph size={16} />}
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: th.brass, opacity: 0.6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <StarGlyph size={10} />
        </View>
        <Text accessibilityRole="header" style={{ color: th.onAccent, fontSize: 28, lineHeight: 35, fontWeight: "700", fontFamily: HEADING_FONT }}>{title}</Text>
        {subtitle ? <Text style={{ color: th.onAccent, fontSize: 14, lineHeight: 21, opacity: 0.92 }}>{subtitle}</Text> : null}
      </View>
    </Card>
  );
}

/** One row of a list: an optional numbered star, a title, an optional line under it, an optional gold tag, and a chevron. */
export function ListRow({ title, subtitle, lead, tag, onPress, label, rtlTitle = false }: { title: string; subtitle?: string | undefined; lead?: ReactNode; tag?: string | undefined; onPress: () => void; label?: string | undefined; rtlTitle?: boolean }) {
  const th = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? `${title}${subtitle ? `. ${subtitle}` : ""}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card padding={14}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {lead}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: th.text, fontSize: 16, lineHeight: 23, fontWeight: "700", fontFamily: HEADING_FONT, writingDirection: rtlTitle ? "rtl" : "ltr" }}>{title}</Text>
            {subtitle ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{subtitle}</Text> : null}
          </View>
          {tag ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: th.brass }}>
              <Text style={{ color: th.brassText, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{tag}</Text>
            </View>
          ) : null}
          <Icon name="chevronRight" size={20} color={th.muted} />
        </View>
      </Card>
    </Pressable>
  );
}

/** The numbered star used at the start of a row. */
export function RowStar({ n, size = 42 }: { n: number | string; size?: number }) {
  const th = useTheme();
  return <StarBadge n={n} size={size} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />;
}

/** The same star as RowStar, holding an icon instead of a number: for rows that are a place to go, not an item in a sequence. */
export function IconStar({ icon, size = 42 }: { icon: IconName; size?: number }) {
  const th = useTheme();
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "absolute" }}>
        <Polygon points={starPoints(24, 24, 22.5, 17)} fill={th.surfaceAlt} stroke={th.brass} strokeWidth={1.5} strokeLinejoin="round" />
      </Svg>
      <Icon name={icon} size={size * 0.46} color={th.accentText} />
    </View>
  );
}

/**
 * The Arabic original in a double frame: a gold line outside, a fine line inside, and a star on the top edge. It follows the
 * person's Arabic size and line spacing from Settings. Right-to-left, with room above and below for stacked vowel marks.
 */
export function ArabicFrame({ label, children, align = "right" }: { label: string; children: string; align?: "right" | "center" }) {
  const th = useTheme();
  const size = useSettings((s) => s.arabicFontSize);
  const spacing = useSettings((s) => s.lineSpacing);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: th.brass, padding: 4, backgroundColor: th.surface }}>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 18, gap: 10 }}>
          <Text style={{ color: th.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textAlign: "center" }}>{label}</Text>
          <Text selectable style={{ color: th.text, fontSize: size, lineHeight: size * spacing, writingDirection: "rtl", textAlign: align }}>{children}</Text>
        </View>
      </View>
      <View style={{ position: "absolute", top: -9, left: 0, right: 0, alignItems: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ backgroundColor: th.bg, paddingHorizontal: 6 }}>
          <StarGlyph size={18} />
        </View>
      </View>
    </View>
  );
}

/** A translation or explanation: smaller than the Arabic, beside a thin gold rule, with its label above. */
export function TextBlock({ label, children, rtl = false }: { label: string; children: string; rtl?: boolean }) {
  const th = useTheme();
  const size = useSettings((s) => s.translationFontSize);
  const spacing = useSettings((s) => s.lineSpacing);
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 3, borderRadius: 2, backgroundColor: th.brass, opacity: 0.85 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</Text>
        <Text selectable style={{ color: th.text, fontSize: size, lineHeight: size * Math.max(1.4, spacing * 0.9), writingDirection: rtl ? "rtl" : "ltr", textAlign: "left" }}>{children}</Text>
      </View>
    </View>
  );
}

/** A list of short points, each led by a small star. */
export function StarList({ label, items, rtl = false }: { label: string; items: readonly string[]; rtl?: boolean }) {
  const th = useTheme();
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</Text>
        {items.map((x, i) => (
          <View key={i} style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ marginTop: 7 }}>
              <StarGlyph size={10} />
            </View>
            <Text selectable style={{ flex: 1, color: th.text, fontSize: 15, lineHeight: 24, writingDirection: rtl ? "rtl" : "ltr", textAlign: "left" }}>{x}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
