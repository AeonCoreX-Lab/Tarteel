import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { arcPath, arcPoint } from "@tarteel/prayer";
import type { DayArc } from "@tarteel/prayer";

const W = 320;
const H = 168;
const CX = W / 2;
const CY = 150;
const R = 130;

/**
 * The day as a half-ring: six ticks placed by real clock time, gold progress up to now, and a marker.
 * Decorative: the same information is in the text around it, so it is hidden from screen readers.
 */
export function WaqtArc({ arc, track, progress, tick, marker, markerRing }: { arc: DayArc; track: string; progress: string; tick: string; marker: string; markerRing: string }) {
  const now = arcPoint(CX, CY, R, arc.progress);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: "center" }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={arcPath(CX, CY, R, 0, 1)} stroke={track} strokeWidth={6} strokeLinecap="round" fill="none" />
        {arc.progress > 0 ? <Path d={arcPath(CX, CY, R, 0, arc.progress)} stroke={progress} strokeWidth={6} strokeLinecap="round" fill="none" /> : null}
        {arc.ticks.map((t) => {
          const p = arcPoint(CX, CY, R, t.at);
          return <Circle key={t.event} cx={p.x} cy={p.y} r={t.event === "Sunrise" ? 3 : 4.5} fill={tick} />;
        })}
        <Circle cx={now.x} cy={now.y} r={10} fill={marker} stroke={markerRing} strokeWidth={3} />
      </Svg>
    </View>
  );
}
