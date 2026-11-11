import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OPENITI_CREDIT, OPENITI_LICENCE, OPENITI_VERSION } from "@tarteel/core";
import type { BookSource } from "@tarteel/core";
import { Button, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { HEADING_FONT, useTheme } from "../theme";
import { islamicBooksEnabled, openItiEnabled } from "../online/runtime";

/** What every islamic.app book screen says: whose books these are, how they are shown, and that the edition is not checked here. */
export function IslamicBooksCredit({ sources }: { sources?: BookSource[] | undefined }) {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("bkIaCredit")}</Text>
      {sources && sources.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" }}>{t("bkSources")}</Text>
          {sources.map((s, i) => (
            <Text key={i} selectable style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{s.url ? `${s.name} — ${s.url}` : s.name}</Text>
          ))}
        </View>
      ) : null}
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{t("bkIaCaution")}</Text>
    </View>
  );
}

/** What every OpenITI screen says: the corpus, the release, the licence (with its link) and that the texts can contain errors. */
export function OpenItiCredit() {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{`${t("bkOiCredit")} ${OPENITI_VERSION}.`}</Text>
      <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{`${t("bkLicence")}: ${OPENITI_LICENCE.name} — ${OPENITI_LICENCE.url}`}</Text>
      <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{`${OPENITI_CREDIT.source} — ${OPENITI_CREDIT.url} — doi:${OPENITI_CREDIT.doi}`}</Text>
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{t("bkOiCaution")}</Text>
    </View>
  );
}

export function openBooksLink(url: string): void {
  void Linking.openURL(url);
}

function Consent({ title, body, privacy, onOn }: { title: string; body: string; privacy: string; onOn: () => void }) {
  const th = useTheme();
  const t = useT();
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{title}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{body}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{privacy}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("tfConsentOn")} onPress={onOn} />
        </View>
      </View>
    </Card>
  );
}

function NotInBuild() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("bkNotInBuild")}</Text>
      <View style={{ flexDirection: "row" }}>
        <Button label={t("back")} onPress={() => router.back()} />
      </View>
    </View>
  );
}

/** The children when islamic.app books are available; otherwise why not (not in this build) or the consent card. */
export function IslamicBooksGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineIslamicBooks);
  const set = useSettings((s) => s.set);
  const t = useT();
  if (!islamicBooksEnabled) return <NotInBuild />;
  if (!on) return <Consent title={t("bkIaConsentTitle")} body={t("bkIaConsentBody")} privacy={t("bkIaConsentPrivacy")} onOn={() => set("onlineIslamicBooks", true)} />;
  return <>{children}</>;
}

/** The children when OpenITI downloads are available; otherwise why not or the consent card. */
export function OpenItiGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineOpenIti);
  const set = useSettings((s) => s.set);
  const t = useT();
  if (!openItiEnabled) return <NotInBuild />;
  if (!on) return <Consent title={t("bkOiConsentTitle")} body={t("bkOiConsentBody")} privacy={t("bkOiConsentPrivacy")} onOn={() => set("onlineOpenIti", true)} />;
  return <>{children}</>;
}
