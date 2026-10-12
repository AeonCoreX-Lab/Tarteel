import { Text, View } from "react-native";
import Svg, { Defs, Path, Pattern, Polygon, Rect } from "react-native-svg";

/** Points of an 8-point star (two overlapping squares) centred on cx,cy. */
export function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Number inside an 8-point star: the classic marker for surah and ayah numbers. */
export function StarBadge({ n, size = 40, fill, stroke, color, fontSize }: { n: number | string; size?: number; fill: string; stroke: string; color: string; fontSize?: number }) {
  const label = String(n);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "absolute" }}>
        <Polygon points={starPoints(24, 24, 22.5, 17)} fill={fill} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      </Svg>
      <Text style={{ color, fontSize: fontSize ?? (label.length > 2 ? size * 0.3 : size * 0.38), fontWeight: "700", fontVariant: ["tabular-nums"] }}>{label}</Text>
    </View>
  );
}

/** Quiet repeating star lattice for hero surfaces. Never place it behind text that has to be read at length. */
export function GeoPattern({ color, opacity = 0.07, tile = 56 }: { color: string; opacity?: number; tile?: number }) {
  const c = tile / 2;
  return (
    <Svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id="tarteel-geo" width={tile} height={tile} patternUnits="userSpaceOnUse">
          <Polygon points={starPoints(c, c, tile * 0.42, tile * 0.3)} fill="none" stroke={color} strokeWidth={1} />
          <Path d={`M0 ${c} H${tile} M${c} 0 V${tile}`} stroke={color} strokeWidth={0.5} opacity={0.5} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#tarteel-geo)" opacity={opacity} />
    </Svg>
  );
}
