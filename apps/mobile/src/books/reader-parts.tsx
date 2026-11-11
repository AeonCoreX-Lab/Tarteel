import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../components/Icons";
import { RowStar, StarGlyph } from "../components/Heritage";
import { HEADING_FONT, useTheme } from "../theme";
import type { Theme } from "../theme";

/** The reading page: a warm paper tone in the light theme (like a printed book), the app's own surface in dark and AMOLED. */
export function paperColor(th: Theme): string {
  return th.dark ? th.bg : "#FBF6E8";
}

/**
 * A title plate in the manner of a mushaf's surah header: a double gold frame with a star on each end, and the title between.
 * Used for the book title and, smaller, for a chapter. Decorative frame only; the text inside is what is read out.
 */
export function TitlePlate({ title, subtitle, small = false, children }: { title: string; subtitle?: string | undefined; small?: boolean; children?: ReactNode }) {
  const th = useTheme();
  const paper = paperColor(th);
  const star = small ? 14 : 20;
  return (
    <View style={{ marginVertical: small ? 10 : 14, marginHorizontal: star / 2 }}>
      <View style={{ borderWidth: 1.5, borderColor: th.brass, borderRadius: small ? 8 : 12, padding: 4 }}>
        <View style={{ borderWidth: 0.75, borderColor: th.brass, borderRadius: small ? 6 : 9, paddingVertical: small ? 10 : 16, paddingHorizontal: star + 8, gap: 6, alignItems: "center", backgroundColor: th.dark ? th.surface : "#F6EED8" }}>
          <Text accessibilityRole="header" style={{ color: th.text, fontSize: small ? 18 : 24, lineHeight: small ? 28 : 36, fontWeight: "700", fontFamily: HEADING_FONT, textAlign: "center", writingDirection: "rtl" }}>{title}</Text>
          {subtitle ? <Text style={{ color: th.brassText, fontSize: small ? 13 : 15, lineHeight: small ? 19 : 22, textAlign: "center", writingDirection: "rtl" }}>{subtitle}</Text> : null}
          {children}
        </View>
      </View>
      {[{ left: -star / 2 }, { right: -star / 2 }].map((pos, i) => (
        <View key={i} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: "50%", marginTop: -star / 2 - 1, width: star, height: star, borderRadius: star / 2, backgroundColor: paper, alignItems: "center", justifyContent: "center", ...pos }}>
          <StarGlyph size={star - 2} />
        </View>
      ))}
    </View>
  );
}

/** A thin gold rule with a small star: separates the title area from the text. */
export function PlateRule() {
  const th = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: th.brass, opacity: 0.55 }} />
      <StarGlyph size={10} />
      <View style={{ flex: 1, height: 1, backgroundColor: th.brass, opacity: 0.55 }} />
    </View>
  );
}

function BarButton({ label, onPress, disabled = false, children }: { label: string; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  const th = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1, backgroundColor: th.surfaceAlt })}>
      {children}
    </Pressable>
  );
}

/**
 * The reader's bar, always in reach: previous and next chapter, the contents (with where you are), and text size. A thin gold
 * line above it shows how far through the book the chapter is.
 */
export function ReaderBar({ position, total, contentsLabel, prevLabel, nextLabel, smallerLabel, largerLabel, onPrev, onNext, onContents, onSmaller, onLarger, atMin, atMax }: {
  position: number; total: number; contentsLabel: string; prevLabel: string; nextLabel: string; smallerLabel: string; largerLabel: string;
  onPrev: () => void; onNext: () => void; onContents: () => void; onSmaller: () => void; onLarger: () => void; atMin: boolean; atMax: boolean;
}) {
  const th = useTheme();
  const pct = total > 0 ? Math.min(100, Math.max(0, (position / total) * 100)) : 0;
  return (
    <View style={{ backgroundColor: th.surface, borderTopWidth: 1, borderTopColor: th.border }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 3, backgroundColor: th.surfaceAlt }}>
        <View style={{ width: `${pct}%`, height: 3, backgroundColor: th.brass }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        <BarButton label={smallerLabel} onPress={onSmaller} disabled={atMin}><Text style={{ color: th.text, fontSize: 14, fontWeight: "800" }}>A−</Text></BarButton>
        <BarButton label={prevLabel} onPress={onPrev} disabled={position <= 1}><Icon name="chevronLeft" size={22} color={th.accentText} /></BarButton>
        <Pressable accessibilityRole="button" accessibilityLabel={`${contentsLabel}. ${position} / ${total}`} onPress={onContents} style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: th.accent, opacity: pressed ? 0.85 : 1 })}>
          <Text numberOfLines={1} style={{ color: th.onAccent, fontSize: 14, fontWeight: "800" }}>{`${contentsLabel} · ${position}/${total}`}</Text>
        </Pressable>
        <BarButton label={nextLabel} onPress={onNext} disabled={position >= total}><Icon name="chevronRight" size={22} color={th.accentText} /></BarButton>
        <BarButton label={largerLabel} onPress={onLarger} disabled={atMax}><Text style={{ color: th.text, fontSize: 18, fontWeight: "800" }}>A+</Text></BarButton>
      </View>
    </View>
  );
}

/**
 * One line of the contents, set like a printed index: the chapter number in a star on the right, the title running right to left,
 * dots leading to the page on the left. Sub-chapters step in and are lighter.
 */
export function ContentsRow({ n, title, page, level, onPress }: { n: number; title: string; page: string | null; level: number; onPress: () => void }) {
  const th = useTheme();
  const depth = Math.min(3, Math.max(0, level - 1));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${n}. ${title}${page ? `, ${page}` : ""}`} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6, paddingRight: depth * 18, opacity: pressed ? 0.7 : 1 })}>
      <RowStar n={n} size={depth === 0 ? 38 : 30} />
      <Text numberOfLines={3} style={{ flexShrink: 1, color: th.text, fontSize: depth === 0 ? 17 : 15, lineHeight: depth === 0 ? 26 : 23, fontWeight: depth === 0 ? "700" : "500", fontFamily: HEADING_FONT, writingDirection: "rtl", textAlign: "left" }}>{title}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 12, height: 1, borderBottomWidth: 1, borderStyle: "dotted", borderColor: th.border, marginTop: 10 }} />
      {page ? <Text style={{ color: th.brassText, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], minWidth: 28, textAlign: "left" }}>{page}</Text> : null}
    </Pressable>
  );
}
