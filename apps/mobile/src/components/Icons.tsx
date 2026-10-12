import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ReactNode } from "react";

export type IconName =
  | "today" | "quran" | "bookmark" | "settings" | "search" | "compass" | "calendar" | "bell" | "pin" | "check" | "chevronRight" | "chevronLeft" | "sound";

// Original outline glyphs on a 24x24 grid, drawn with one stroke width so the set feels like one family.
const GLYPHS: Record<IconName, ReactNode> = {
  today: (<><Circle cx={12} cy={12} r={8.5} /><Path d="M12 7.5V12l3 2" /></>),
  quran: (<><Path d="M3 5.8C5.6 4.3 9 4.4 12 6.4c3-2 6.4-2.1 9-.6V19c-2.6-1.5-6-1.4-9 .6-3-2-6.4-2.1-9-.6z" /><Path d="M12 6.4v13.2" /></>),
  bookmark: (<Path d="M7 4h10v16l-5-3.8L7 20z" />),
  settings: (<><Path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><Circle cx={15} cy={7} r={2} /><Circle cx={9} cy={17} r={2} /></>),
  search: (<><Circle cx={11} cy={11} r={6} /><Path d="M15.5 15.5L20 20" /></>),
  compass: (<><Circle cx={12} cy={12} r={8.5} /><Path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z" /></>),
  calendar: (<><Rect x={4} y={5.5} width={16} height={14.5} rx={2.5} /><Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  bell: (<><Path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 1.8H4.2z" /><Path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  pin: (<><Path d="M12 21s-6.2-5.2-6.2-10a6.2 6.2 0 0 1 12.4 0c0 4.8-6.2 10-6.2 10z" /><Circle cx={12} cy={11} r={2.2} /></>),
  check: (<Path d="M5 12.5l4.5 4.5L19 7.5" />),
  chevronRight: (<Path d="M9 5l7 7-7 7" />),
  chevronLeft: (<Path d="M15 5l-7 7 7 7" />),
  sound: (<><Path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><Path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>),
};

export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {GLYPHS[name]}
    </Svg>
  );
}
