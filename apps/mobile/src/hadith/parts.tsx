import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Segment } from "@tarteel/core";
import { Button, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { HEADING_FONT, useTheme } from "../theme";
import { errorKey } from "./hooks";
import type { Remote } from "./hooks";
import { hadithEnabled } from "./runtime";

/** Where every hadith on screen came from. Shown on every hadith screen, never hidden. */
export function HadithCredit() {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hadCredit")}</Text>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("hadNotReviewed")}</Text>
    </View>
  );
}

/** Shown in place of any hadith screen's content until the person has turned the online lookup on. */
export function HadithConsent() {
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("hadConsentTitle")}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("hadConsentBody")}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hadConsentPrivacy")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hadConsentOn")} onPress={() => set("onlineHadith", true)} />
        </View>
      </View>
    </Card>
  );
}

/** A failed lookup, in words, with a retry. */
export function HadithError({ state, retry }: { state: Extract<Remote<unknown>, { status: "error" }>; retry: () => void }) {
  const th = useTheme();
  const t = useT();
  const wait = state.code === "rate-limited" && state.retryAfterSeconds !== null ? ` (${state.retryAfterSeconds} ${t("hadSeconds")})` : "";
  return (
    <Card padding={16}>
      <View style={{ gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 15, lineHeight: 22, fontWeight: "700" }}>{`${t(errorKey(state.code))}${wait}`}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("knowRetry")} onPress={retry} />
        </View>
      </View>
    </Card>
  );
}

/** The children when the lookup is available; otherwise why not (not in this build) or the consent card (not turned on yet). */
export function HadithGate({ children }: { children: ReactNode }) {
  const on = useSettings((s) => s.onlineHadith);
  const t = useT();
  const th = useTheme();
  const router = useRouter();
  if (!hadithEnabled)
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("hadNotInBuild")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("back")} onPress={() => router.back()} />
        </View>
      </View>
    );
  if (!on) return <HadithConsent />;
  return <>{children}</>;
}

/** A search snippet with the matched words in bold. */
export function Snippet({ segments, rtl = false }: { segments: Segment[]; rtl?: boolean }) {
  const th = useTheme();
  return (
    <Text style={{ color: th.text, fontSize: rtl ? 18 : 14, lineHeight: rtl ? 30 : 21, writingDirection: rtl ? "rtl" : "ltr", textAlign: "left" }}>
      {segments.map((s, i) => (
        <Text key={i} style={s.mark ? { fontWeight: "800", backgroundColor: th.surfaceAlt } : undefined}>{s.text}</Text>
      ))}
    </Text>
  );
}
