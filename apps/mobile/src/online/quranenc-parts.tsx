import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { useTheme } from "../theme";
import { useQuranEncVersions } from "./quranenc";
import { quranEncEnabled } from "./runtime";

/** What every QuranEnc screen must say: whose text it is, that it is shown as published, and that it is not a ruling. */
export function QuranEncCredit({ edition }: { edition?: string | undefined }) {
  const th = useTheme();
  const t = useT();
  const { state } = useQuranEncVersions();
  const v = edition && state.status === "ready" ? state.value[edition] : undefined;
  const when = v?.lastUpdate && /^\d{9,11}$/.test(v.lastUpdate) ? new Date(Number(v.lastUpdate) * 1000).toISOString().slice(0, 10) : v?.lastUpdate ?? null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("tfCredit")}</Text>
      {edition && state.status !== "idle" ? (
        <Text style={{ color: th.text, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>
          {v?.version ? `${edition} · ${t("tfVersionOf")} ${v.version}${when ? ` · ${t("tfUpdated")} ${when}` : ""}` : state.status === "loading" ? `${edition} · …` : `${edition} · ${t("tfVersionUnknown")}`}
        </Text>
      ) : null}
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{t("tfCaution")}</Text>
    </View>
  );
}

export function openSite(url: string): void {
  void Linking.openURL(url);
}

/** Shown in place of any QuranEnc text until the person has turned the lookup on. Says what is sent and where. */
function QuranEncConsent() {
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700" }}>{t("tfConsentTitle")}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("tfConsentBody")}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("tfConsentPrivacy")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("tfConsentOn")} onPress={() => set("onlineQuranEnc", true)} />
        </View>
      </View>
    </Card>
  );
}

/** The children when the lookup is available; otherwise why not (not in this build) or the consent card (not turned on yet). */
export function QuranEncGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineQuranEnc);
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  if (!quranEncEnabled)
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("tfNotInBuild")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("back")} onPress={() => router.back()} />
        </View>
      </View>
    );
  if (!on) return <QuranEncConsent />;
  return <>{children}</>;
}
