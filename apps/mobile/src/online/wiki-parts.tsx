import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { WikiLanguage } from "@tarteel/core";
import { Button, Caption, Card } from "../components/ui";
import { IconStar, ListRow, SectionHeader } from "../components/Heritage";
import { HadithError } from "../hadith/parts";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import { useTheme } from "../theme";
import { wikipediaEnabled } from "./runtime";
import { useWikiAllowed, useWikiLookup } from "./wiki";

/** Shown in place of any Wikipedia text until the person has turned the lookup on. Says what is sent and where. */
function WikiConsent() {
  const th = useTheme();
  const t = useT();
  const set = useSettings((s) => s.set);
  return (
    <Card padding={16}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: th.text, fontSize: 17, fontWeight: "700" }}>{t("wkConsentTitle")}</Text>
        <Text style={{ color: th.text, fontSize: 14, lineHeight: 21 }}>{t("wkConsentBody")}</Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("wkConsentPrivacy")}</Text>
        <View style={{ flexDirection: "row" }}>
          <Button label={t("wkConsentOn")} onPress={() => set("onlineWikipedia", true)} />
        </View>
      </View>
    </Card>
  );
}

function Results({ build, queryKey }: { build: (l: WikiLanguage) => string; queryKey: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { state, retry, preferred } = useWikiLookup(build, queryKey);
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowSearching")}</Caption>;
  const { hits, language } = state.value;
  if (hits.length === 0) return <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("wkNoResults")}</Text>;
  return (
    <View style={{ gap: 10 }}>
      {language !== preferred ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("wkShownInEnglish")}</Text> : null}
      {hits.map((h) => (
        <ListRow
          key={h.title}
          title={h.title}
          subtitle={h.snippet === "" ? undefined : h.snippet}
          lead={<IconStar icon="search" />}
          rtlTitle={language === "ar"}
          onPress={() => router.push(`/wiki/view?lang=${language}&title=${encodeURIComponent(h.title)}`)}
        />
      ))}
    </View>
  );
}

/**
 * "More background from Wikipedia": a few matching articles for a surah or an entry, shown when the person has turned the lookup on.
 * Offered where installed packs have nothing, or little, to say. Renders nothing at all in a build without Wikipedia.
 */
export function WikiLookupCard({ build, queryKey, intro }: { build: (language: WikiLanguage) => string; queryKey: string; intro?: string }) {
  const th = useTheme();
  const t = useT();
  const allowed = useWikiAllowed();
  if (!wikipediaEnabled) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader label={t("wkLookupTitle")} />
      <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{intro ?? t("wkLookupBody")}</Text>
      {allowed ? <Results build={build} queryKey={queryKey} /> : <WikiConsent />}
    </View>
  );
}

/** What every screen that shows Wikipedia text must say: where it is from, under which licence, and that it is not scholarship. */
export function WikiNotice() {
  const th = useTheme();
  const t = useT();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("wkCredit")}</Text>
      <Text style={{ color: th.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{t("wkCaution")}</Text>
    </View>
  );
}
