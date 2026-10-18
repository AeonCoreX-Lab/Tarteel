import type { ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Icon } from "../../src/components/Icons";
import type { IconName } from "../../src/components/Icons";
import { knowledgeConfigured } from "../../src/knowledge/runtime";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} color={color} size={24} />;

// Icon + text label on every tab (never icon-only). Each screen draws its own serif heading, so no navigator header.
export default function TabsLayout() {
  const th = useTheme();
  const t = useT();
  const done = useSettings((s) => s.onboardingComplete);
  if (!done) return <Redirect href="/setup" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: th.bg },
        tabBarStyle: { backgroundColor: th.surface, borderTopColor: th.border, minHeight: 64, paddingTop: 6 },
        tabBarActiveTintColor: th.accentText,
        tabBarInactiveTintColor: th.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarItemStyle: { minHeight: 52 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("today"), tabBarIcon: icon("today") }} />
      <Tabs.Screen name="quran" options={{ title: t("quran"), tabBarIcon: icon("quran") }} />
      {/* Hidden (not just empty) in a build with no pack catalogue address and publisher key, as the Library is. */}
      <Tabs.Screen name="knowledge" options={{ title: t("tabKnowledge"), tabBarIcon: icon("knowledge"), href: knowledgeConfigured ? undefined : null }} />
      <Tabs.Screen name="bookmarks" options={{ title: t("bookmarks"), tabBarIcon: icon("bookmark") }} />
      <Tabs.Screen name="settings" options={{ title: t("settings"), tabBarIcon: icon("settings") }} />
    </Tabs>
  );
}
