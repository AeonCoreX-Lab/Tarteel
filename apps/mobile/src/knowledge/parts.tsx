import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { locatorParts } from "@tarteel/database";
import type { EntityKind, EntityRef, HistoryClaim, SourceCitation } from "@tarteel/database";
import { Caption, Card, Chip } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";
import { EVIDENCE_KEY } from "./labels";

const LOCATOR_KEY: Record<keyof SourceCitation["locator"], StringKey> = {
  volume: "locVolume", page: "locPage", chapter: "locChapter", section: "locSection", reportNumber: "locReport", hadithNumber: "locHadith",
};

/** One source, with its locator and licence credit, as a link to the Source screen. */
export function Citation({ c }: { c: SourceCitation }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const where = locatorParts(c.locator).map((p) => `${t(LOCATOR_KEY[p.kind])} ${p.value}`).join(", ");
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t("srcOpen")}: ${c.workTitle}`}
        onPress={() => router.push({ pathname: "/source", params: { pack: c.packId, passage: c.passageId } })}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: th.accentText, fontSize: 13, lineHeight: 19, textDecorationLine: "underline" }}>
          {c.workTitle}{c.author ? ` (${c.author})` : ""} · {c.edition}{where ? ` · ${where}` : ""}
        </Text>
      </Pressable>
      {c.transcriptionStatus !== "verified" ? <Caption>{t("histUnverifiedSource")}</Caption> : null}
      {c.quote ? <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19, fontStyle: "italic" }}>“{c.quote}”</Text> : null}
      <Text selectable style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{c.attribution}</Text>
    </View>
  );
}

/** A claim with its evidence label, uncertainty, editorial note and sources. Shown the same everywhere a claim appears. */
export function ClaimCard({ c }: { c: HistoryClaim }) {
  const th = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.uiLanguage);
  return (
    <Card padding={14}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label={t(EVIDENCE_KEY[c.evidenceLabel])} tone={c.evidenceLabel === "disputed" || c.evidenceLabel === "unverified" ? "brass" : "muted"} />
        </View>
        <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 24 }}>{c.text}</Text>
        {c.textStatus === "machine_draft" ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
        {c.textLang !== lang ? <Caption>{t("histOtherLanguage")}</Caption> : null}
        {c.uncertaintyNote ? (
          <View style={{ gap: 2 }}>
            <Caption>{t("histUncertainty")}</Caption>
            <Text selectable style={{ color: th.text, fontSize: 14, lineHeight: 20 }}>{c.uncertaintyNote}</Text>
          </View>
        ) : null}
        {c.editorialBasis ? (
          <View style={{ gap: 2 }}>
            <Caption>{t("histBasis")}</Caption>
            <Text selectable style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{c.editorialBasis}</Text>
          </View>
        ) : null}
        {c.supports.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Caption>{t("histSources")}</Caption>
            {c.supports.map((s) => <Citation key={s.passageId} c={s} />)}
          </View>
        ) : null}
        {c.contradicts.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Caption>{t("histDisagree")}</Caption>
            {c.contradicts.map((s) => <Citation key={s.passageId} c={s} />)}
          </View>
        ) : null}
        {c.lastReviewedAt ? <Caption>{t("histReviewed")}: {c.lastReviewedAt}</Caption> : null}
      </View>
    </Card>
  );
}

/** The words for each kind of entity and each subtype. */
export const KIND_KEY: Record<EntityKind, StringKey> = { event: "tlEvent", person: "tlPerson", place: "tlPlace" };
export const SUBTYPE_KEY: Record<string, StringKey> = {
  revelation: "stRevelation", migration: "stMigration", battle: "stBattle", treaty: "stTreaty", birth: "stBirth", death: "stDeath", gathering: "stGathering",
  prophet: "stProphet", companion: "stCompanion", family: "stFamily", scholar: "stScholar", ruler: "stRuler",
  city: "stCity", region: "stRegion", mountain: "stMountain", building: "stBuilding", water: "stWater", other: "stOther",
};

/** A tappable name of an event, person or place that opens its page. */
export function EntityLink({ e }: { e: EntityRef }) {
  const th = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={e.name}
      onPress={() => router.push({ pathname: "/entity", params: { pack: e.packId, id: e.id } })}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Text style={{ color: th.accentText, fontSize: 15, lineHeight: 22, textDecorationLine: "underline" }}>{e.name}</Text>
    </Pressable>
  );
}
