import { memo } from "react";
import { Text, View } from "react-native";
import Svg, { Polygon, Rect } from "react-native-svg";
import { bookCoverPalette, coverTitle } from "@tarteel/core";
import { starPoints } from "../components/Ornaments";
import { HEADING_FONT } from "../theme";

/**
 * A cover Tarteel draws itself: a deep colour chosen by the book's subject, a field of eight-point stars, a gold frame, and
 * the title and author on it. It stands in for a publisher's picture (no image is downloaded, nothing is licensed) and is
 * decorative: the row or page that shows it already names the book, so it is hidden from screen readers.
 */
function BookCoverView({ title, author, genre, id, width = 56, detailed = false }: { title: string; author?: string | null | undefined; genre?: string | null | undefined; id: string; width?: number; detailed?: boolean }) {
  const p = bookCoverPalette(genre, id);
  const height = Math.round(width * 1.4);
  const shown = coverTitle(title, 36);
  const titleSize = width * (shown.length > 22 ? 0.088 : 0.115);
  const stars: { x: number; y: number }[] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) stars.push({ x: 10 + col * 20 + (row % 2 === 0 ? 0 : 10), y: 10 + row * 20 });
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, borderRadius: Math.max(3, width * 0.05), overflow: "hidden", backgroundColor: p.bg }}>
      <Svg width={width} height={height} viewBox="0 0 100 140" preserveAspectRatio="none" style={{ position: "absolute" }}>
        <Rect x={0} y={0} width={100} height={140} fill={p.bg} />
        {stars.map((s, i) => (
          <Polygon key={i} points={starPoints(s.x, s.y, 7, 4.6)} fill={p.gold} fillOpacity={detailed ? 0.16 : 0.22} />
        ))}
        <Rect x={5} y={5} width={90} height={130} fill="none" stroke={p.gold} strokeWidth={1.6} />
        <Rect x={8.5} y={8.5} width={83} height={123} fill="none" stroke={p.gold} strokeWidth={0.6} strokeOpacity={0.8} />
        {detailed ? null : <Polygon points={starPoints(50, 70, 20, 13)} fill={p.bg} stroke={p.gold} strokeWidth={2} strokeLinejoin="round" />}
        {detailed ? <Rect x={14} y={40} width={72} height={60} fill={p.bg} fillOpacity={0.9} stroke={p.gold} strokeWidth={0.8} /> : <Polygon points={starPoints(50, 70, 8, 5.2)} fill={p.gold} />}
      </Svg>
      {detailed ? (
        <View style={{ position: "absolute", left: width * 0.16, right: width * 0.16, top: height * 0.29, height: height * 0.43, alignItems: "center", justifyContent: "center", gap: height * 0.025 }}>
          <Text numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: p.ink, fontSize: titleSize, lineHeight: titleSize * 1.4, fontWeight: "700", fontFamily: HEADING_FONT, textAlign: "center", writingDirection: "rtl" }}>{shown}</Text>
          {author ? <Text numberOfLines={2} style={{ color: p.gold, fontSize: width * 0.07, lineHeight: width * 0.1, textAlign: "center", writingDirection: "rtl" }}>{coverTitle(author, 40)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export const BookCover = memo(BookCoverView);
