import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { KnowledgeHit, SurahKnowledge } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Icon } from "../../src/components/Icons";
import { Hero, IconStar, ListRow, RowStar, SectionHeader } from "../../src/components/Heritage";
import { Button, Caption, Card, Chip, ScreenScroll } from "../../src/components/ui";
import { EVIDENCE_KEY } from "../../src/knowledge/labels";
import { readPacksAgain, useEntityCounts, useKnowledgeBrowse, useKnowledgeSearch, usePackDiagnosis } from "../../src/knowledge/hooks";
import { hadeethEncEnabled, hadithEnabled } from "../../src/hadith/runtime";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

/**
 * The home of the knowledge packs: search what is installed, browse the surahs that have context, and reach the Library.
 * Everything here is read from installed packs on this device; nothing is fetched. A pack the person has not installed
 * simply adds nothing, and an empty tab says so and offers the Library.
 */
export default function KnowledgeTab() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { repos } = useApp();
  const lang = useSettings((s) => s.uiLanguage);
  const [query, setQuery] = useState("");
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const browse = useKnowledgeBrowse();
  const counts = useEntityCounts();
  const diagnosis = usePackDiagnosis();
  const entityTotal = counts.state.status === "ready" ? counts.state.value.event + counts.state.value.person + counts.state.value.place : 0;
  const search = useKnowledgeSearch(query, lang);
  const searching = query.trim().length >= 2;

  useEffect(() => void repos.quran.getSurahs().then(setSurahs), [repos]);
  const surahName = (id: number): string => surahs.find((s) => s.id === id)?.nameTransliteration ?? String(id);

  const openHit = (h: KnowledgeHit): void => {
    if (h.entity !== null) router.push({ pathname: "/entity", params: { pack: h.packId, id: h.entity.id } });
    else if (h.surahId !== null) router.push(`/history/${h.surahId}${h.ayahNumber !== null ? `?ayah=${h.ayahNumber}` : ""}`);
    else if (h.passageId !== null) router.push({ pathname: "/source", params: { pack: h.packId, passage: h.passageId } });
  };

  const hitRow = (h: KnowledgeHit) => {
    const where = h.surahId === null ? null : `${surahName(h.surahId)}${h.ayahNumber !== null ? ` · ${t("ayah")} ${h.ayahNumber}` : ""}`;
    return (
      <Pressable key={h.key} accessibilityRole="button" accessibilityLabel={`${where ?? h.workTitle ?? ""}: ${h.snippet}`} onPress={() => openHit(h)}>
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Chip label={t(h.kind === "claim" ? "knowHitClaim" : h.kind === "entity" ? "knowHitEntity" : "knowHitPassage")} tone="muted" />
              {h.evidenceLabel ? <Chip label={t(EVIDENCE_KEY[h.evidenceLabel])} tone={h.evidenceLabel === "disputed" || h.evidenceLabel === "unverified" ? "brass" : "muted"} /> : null}
            </View>
            {where ? <Text style={{ color: th.muted, fontSize: 13, fontFamily: HEADING_FONT }}>{where}</Text> : null}
            <Text style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{h.snippet}</Text>
            {h.workTitle ? <Caption>{h.workTitle}</Caption> : null}
            {h.textStatus === "machine_draft" ? <Text style={{ color: th.text, fontSize: 13, fontWeight: "700" }}>{t("histMachine")}</Text> : null}
          </View>
        </Card>
      </Pressable>
    );
  };

  const surahRow = (k: SurahKnowledge) => {
    const parts = [k.ayahs > 0 ? `${k.ayahs} ${t("knowAyahsWithContext")}` : null, k.surahClaims + k.surahEntities > 0 ? t("knowAboutSurah") : null].filter(Boolean).join(" · ");
    return <ListRow key={k.surahId} title={surahName(k.surahId)} subtitle={parts} lead={<RowStar n={k.surahId} />} onPress={() => router.push(`/history/${k.surahId}`)} label={`${surahName(k.surahId)}. ${parts}`} />;
  };

  const libraryButton = (
    <View style={{ flexDirection: "row" }}>
      <Button label={t("libraryTitle")} onPress={() => router.push("/library")} />
    </View>
  );

  let body;
  if (searching) {
    if (search.status === "error")
      body = <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("knowLoadFailed")}</Text>;
    else if (search.result === null)
      body = <Caption>{t("knowSearching")}</Caption>;
    else if (search.result.hits.length === 0)
      body = <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{search.status === "searching" ? t("knowSearching") : t("knowNoResults")}</Text>;
    else
      body = (
        <View style={{ gap: 12 }}>
          {search.result.hits.map(hitRow)}
          {search.result.truncated ? <Caption>{t("knowMore")}</Caption> : null}
        </View>
      );
  } else if (browse.state.status === "loading") {
    body = <Caption>{t("knowLoading")}</Caption>;
  } else if (browse.state.status === "error") {
    body = (
      <Card padding={16}>
        <View style={{ gap: 12 }}>
          <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("knowLoadFailed")}</Text>
          <View style={{ flexDirection: "row" }}>
            <Button label={t("knowRetry")} onPress={browse.retry} />
          </View>
        </View>
      </Card>
    );
  } else if (browse.state.value.length === 0 && entityTotal === 0) {
    const report = diagnosis.state.status === "ready" ? diagnosis.state.value : null;
    if (report && report.installed > 0) {
      // Packs ARE installed. Say what is known: either they could not be read (and why), or they hold nothing for any surah.
      body = (
        <Card padding={16}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{t(report.problems.length > 0 ? "knowUnreadableTitle" : "knowInstalledNothingTitle")}</Text>
            <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t(report.problems.length > 0 ? "knowUnreadableBody" : "knowInstalledNothingBody")}</Text>
            {report.problems.map((p) => (
              <Text key={p.packId} selectable style={{ color: th.muted, fontSize: 12, lineHeight: 17 }}>{`${p.packId} · ${p.stage}: ${p.message}`}</Text>
            ))}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label={t("knowRetry")} onPress={readPacksAgain} />
              <Button label={t("libraryTitle")} onPress={() => router.push("/library")} />
            </View>
          </View>
        </Card>
      );
    } else
      body = (
        <Card padding={16}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("knowEmptyTitle")}</Text>
            <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("knowEmptyBody")}</Text>
            {libraryButton}
          </View>
        </Card>
      );
  } else {
    body = (
      <View style={{ gap: 10 }}>
        {entityTotal > 0 ? (
          <ListRow title={t("tlTitle")} subtitle={t("tlEntry")} lead={<IconStar icon="calendar" />} onPress={() => router.push("/timeline")} />
        ) : null}
        {browse.state.value.length > 0 ? <SectionHeader label={t("knowBrowse")} trailing={String(browse.state.value.length)} /> : null}
        {browse.state.value.map(surahRow)}
        {libraryButton}
      </View>
    );
  }

  return (
    <ScreenScroll headerless>
      <Hero title={t("knowTitle")} subtitle={t("knowIntro")} icon="knowledge" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface }}>
        <Icon name="search" size={22} color={th.accentText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("knowSearchPlaceholder")}
          placeholderTextColor={th.muted}
          accessibilityLabel={t("knowSearchPlaceholder")}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ flex: 1, minHeight: 48, color: th.text, fontSize: 16 }}
        />
      </View>
      {body}
      <SectionHeader label={t("knowSectionHadith")} />
      {hadeethEncEnabled ? <ListRow title={t("hdTitle")} subtitle={t("hdEntry")} lead={<IconStar icon="books" />} onPress={() => router.push("/hadeeth")} /> : null}
      {hadithEnabled ? <ListRow title={t("hadTitle")} subtitle={t("hadEntry")} lead={<IconStar icon="search" />} onPress={() => router.push("/hadith")} /> : null}
      <ListRow title={t("srcHadithTitle")} subtitle={t("srcHadithIntro")} lead={<IconStar icon="check" />} onPress={() => router.push("/sources?domain=hadith")} />
      <SectionHeader label={t("srcHistoryTitle")} />
      <ListRow title={t("srcHistoryTitle")} subtitle={t("srcHistoryIntro")} lead={<IconStar icon="check" />} onPress={() => router.push("/sources?domain=history")} />
    </ScreenScroll>
  );
}
