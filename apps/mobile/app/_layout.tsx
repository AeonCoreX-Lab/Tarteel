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
    <AppProvider minFallbackMs={1800} fallback={({ error }) => <BrandSplash error={error} />}>
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
        <Stack.Screen name="library" options={{ title: t("libraryTitle") }} />
        <Stack.Screen name="history/[id]" options={{ title: t("historyTitle") }} />
        <Stack.Screen name="source" options={{ title: t("srcTitle") }} />
        <Stack.Screen name="timeline" options={{ title: t("tlTitle") }} />
        <Stack.Screen name="entity" options={{ title: t("entTitle") }} />
        <Stack.Screen name="hadith/index" options={{ title: t("hadTitle") }} />
        <Stack.Screen name="hadith/[collection]" options={{ title: t("hadTitle") }} />
        <Stack.Screen name="hadith/view" options={{ title: t("hadTitle") }} />
        <Stack.Screen name="hadeeth/index" options={{ title: t("hdTitle") }} />
        <Stack.Screen name="hadeeth/category" options={{ title: t("hdTitle") }} />
        <Stack.Screen name="hadeeth/view" options={{ title: t("hdTitle") }} />
        <Stack.Screen name="tafsir" options={{ title: t("tfTitle") }} />
        <Stack.Screen name="quranpedia" options={{ title: t("qpTitle") }} />
        <Stack.Screen name="sources" options={{ title: t("srcMore") }} />
        <Stack.Screen name="tasbih" options={{ title: t("tasbih") }} />
        <Stack.Screen name="wiki/view" options={{ title: t("wkTitle") }} />
      </Stack>
      <AudioDock />
      </View>
    </AppProvider>
  );
}
