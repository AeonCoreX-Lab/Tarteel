import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { HEADING_FONT, useTheme } from "../theme";
import { hadeethEncEnabled } from "./runtime";

/** Where every HadeethEnc text on screen came from. The publisher's terms require this credit, so it is on every such screen. */
export function HadeethCredit() {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hdCredit")}</Text>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hadNotReviewed")}</Text>
    </View>
  );
}

/** Shown in place of any HadeethEnc screen's content until the person has turned the lookup on. */
export function HadeethConsent() {
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("hdConsentTitle")}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("hdConsentBody")}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hdConsentPrivacy")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hdConsentOn")} onPress={() => set("onlineHadeethEnc", true)} />
        </View>
      </View>
    </Card>
  );
}

/** The children when the lookup is available; otherwise why not (not in this build) or the consent card (not turned on yet). */
export function HadeethGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineHadeethEnc);
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  if (!hadeethEncEnabled)
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("hadNotInBuild")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("back")} onPress={() => router.back()} />
        </View>
      </View>
    );
  if (!on) return <HadeethConsent />;
  return <>{children}</>;
}
