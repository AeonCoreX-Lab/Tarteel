import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BrandSplash } from "../src/components/BrandSplash";
import { AppProvider } from "../src/state/app";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

export default function RootLayout() {
  const th = useTheme();
  const t = useT();
  return (
    <AppProvider fallback={({ error }) => <BrandSplash error={error} />}>
      <StatusBar style={th.dark ? "light" : "dark"} />
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
      </Stack>
    </AppProvider>
  );
}
