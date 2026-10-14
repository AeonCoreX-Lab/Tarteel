import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { MiniPlayer } from "../src/audio/MiniPlayer";
import { BrandSplash } from "../src/components/BrandSplash";
import { AppProvider } from "../src/state/app";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

/** The recitation card is carried over every screen except Listen, which is the player itself. */
function AudioDock() {
  const path = usePathname();
  if (path === "/listen") return null;
  return <MiniPlayer />;
}

export default function RootLayout() {
  const th = useTheme();
  const t = useT();
  return (
    <AppProvider fallback={({ error }) => <BrandSplash error={error} />}>
      <StatusBar style={th.dark ? "light" : "dark"} />
      <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: th.bg },
          headerTintColor: th.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: HEADING_FONT, fontWeight: "700" },
          contentStyle: { backgroundColor: th.bg },
          animation: "none", // quiet by default; also respects reduced-motion preferences
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="alerts" options={{ title: "Prayer alerts (test)" }} />
        <Stack.Screen name="month" options={{ title: t("month") }} />
        <Stack.Screen name="qibla" options={{ title: t("qibla") }} />
        <Stack.Screen name="search" options={{ title: t("search") }} />
        <Stack.Screen name="surah/[id]" options={{ title: "" }} />
        <Stack.Screen name="listen" options={{ title: t("listen") }} />
        <Stack.Screen name="reciters" options={{ title: t("reciters") }} />
      </Stack>
      <AudioDock />
      </View>
    </AppProvider>
  );
}
