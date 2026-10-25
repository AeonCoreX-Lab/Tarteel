import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { useTheme } from "../theme";
import { quranpediaEnabled } from "./runtime";

/** What every Quranpedia screen says: whose text it is, how it is shown, and that it is not a ruling. */
export function QuranpediaCredit() {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("qpCredit")}</Text>
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{t("qpCaution")}</Text>
    </View>
  );
}

export function openQuranpediaSite(url: string): void {
  void Linking.openURL(url);
}

/** Shown in place of any Quranpedia text until the person has turned the lookup on. Says what is sent and where. */
function QuranpediaConsent() {
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700" }}>{t("qpConsentTitle")}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("qpConsentBody")}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("qpConsentPrivacy")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("tfConsentOn")} onPress={() => set("onlineQuranpedia", true)} />
        </View>
      </View>
    </Card>
  );
}

/** The children when the lookup is available; otherwise why not (not in this build) or the consent card (not turned on yet). */
export function QuranpediaGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineQuranpedia);
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  if (!quranpediaEnabled)
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("qpNotInBuild")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("back")} onPress={() => router.back()} />
        </View>
      </View>
    );
  if (!on) return <QuranpediaConsent />;
  return <>{children}</>;
}
