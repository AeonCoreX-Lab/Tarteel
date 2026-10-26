import { Image, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND, MARKS } from "../brand";
import { HEADING_FONT, useTheme } from "../theme";

/**
 * The app's own bar at the top of every main tab: the mark, the name in the heading serif and the Arabic name beside it, over a
 * hairline. It names the app on every main screen; each screen still draws its own heading below it. Not interactive and read
 * by screen readers once, as the app's name. Colours come from the theme (the cream or deep-green mark follows light and dark).
 */
export function AppBar() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={BRAND.name}
      style={{ paddingTop: insets.top, backgroundColor: th.bg, borderBottomWidth: 1, borderBottomColor: th.border }}
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 }}>
        <Image source={th.dark ? MARKS.light : MARKS.color} accessibilityIgnoresInvertColors style={{ width: 30, height: 30 }} resizeMode="contain" />
        <Text style={{ color: th.text, fontSize: 22, lineHeight: 28, fontWeight: "700", fontFamily: HEADING_FONT, letterSpacing: 0.3 }}>{BRAND.name}</Text>
        <View style={{ width: 1, height: 18, backgroundColor: th.brass, opacity: 0.7 }} />
        <Text style={{ color: th.brassText, fontSize: 20, lineHeight: 28 }}>{BRAND.arabicName}</Text>
      </View>
    </View>
  );
}
