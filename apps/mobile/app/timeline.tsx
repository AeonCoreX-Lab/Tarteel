import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { EntityKind, EntitySummary } from "@tarteel/database";
import { Icon } from "../src/components/Icons";
import { Button, Caption, Card, Chip, Heading, ScreenScroll, Segmented } from "../src/components/ui";
import { useFormatDate } from "../src/knowledge/dates";
import { useEntities, useEntityCounts } from "../src/knowledge/hooks";
import { EVIDENCE_KEY } from "../src/knowledge/labels";
import { SUBTYPE_KEY } from "../src/knowledge/parts";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

function EntityList({ kind }: { kind: EntityKind }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const lang = useSettings((s) => s.uiLanguage);
  const formatDate = useFormatDate();
  const { state, retry } = useEntities(kind, lang);
  if (state.status === "loading") return <Caption>{t("knowLoading")}</Caption>;
  if (state.status === "error")
    return (
      <Card padding={16}>
        <View style={{ gap: 12 }}>
          <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("knowLoadFailed")}</Text>
          <View style={{ flexDirection: "row" }}>
            <Button label={t("knowRetry")} onPress={retry} />
          </View>
        </View>
      </Card>
    );
  if (state.value.length === 0) return <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("tlNoneOfKind")}</Text>;

  const row = (e: EntitySummary) => {
    const dated = e.kind !== "place";
    const date = dated ? formatDate(e.date) : null;
    return (
      <Pressable key={e.key} accessibilityRole="button" accessibilityLabel={`${e.name}${date ? `, ${date}` : ""}`} onPress={() => router.push({ pathname: "/entity", params: { pack: e.packId, id: e.id } })}>
        <Card padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              {date ? <Text style={{ color: th.brassText, fontSize: 13, fontWeight: "700" }}>{date}</Text> : null}
              <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{e.name}</Text>
              {e.summary ? <Text numberOfLines={3} style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{e.summary}</Text> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {e.subtype ? <Chip label={t(SUBTYPE_KEY[e.subtype] ?? "stOther")} tone="muted" /> : null}
                <Chip label={t(EVIDENCE_KEY[e.evidenceLabel])} tone={e.evidenceLabel === "disputed" || e.evidenceLabel === "unverified" ? "brass" : "muted"} />
              </View>
              {e.nameStatus === "machine_draft" || e.summaryStatus === "machine_draft" ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
            </View>
            <Icon name="chevronRight" size={20} color={th.muted} />
          </View>
        </Card>
      </Pressable>
    );
  };
  return <View style={{ gap: 12 }}>{state.value.map(row)}</View>;
}

/**
 * Events, people and places from the installed packs. Events are in time order; the date is shown as exactly as the source
 * gives it ("c. 610 CE", "the 7th century AH"), and an undated entry says so. Nothing here is fetched: it is all read from
 * installed packs.
 */
export default function TimelineScreen() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<EntityKind>("event");
  const counts = useEntityCounts();
  const none = counts.state.status === "ready" && counts.state.value.event + counts.state.value.person + counts.state.value.place === 0;
  return (
    <>
      <Stack.Screen options={{ title: t("tlTitle") }} />
      <ScreenScroll>
        <Heading size={28}>{t("tlTitle")}</Heading>
        <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("tlIntro")}</Text>
        {none ? (
          <Card padding={16}>
            <View style={{ gap: 10 }}>
              <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("tlEmptyTitle")}</Text>
              <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("tlEmptyBody")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Button label={t("libraryTitle")} onPress={() => router.push("/library")} />
              </View>
            </View>
          </Card>
        ) : (
          <>
            <Segmented
              label={t("tlTitle")}
              value={kind}
              onChange={setKind}
              options={[{ value: "event", label: t("tlEvents") }, { value: "person", label: t("tlPeople") }, { value: "place", label: t("tlPlaces") }]}
            />
            <EntityList kind={kind} />
            <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("tlDateNote")}</Text>
          </>
        )}
      </ScreenScroll>
    </>
  );
}
