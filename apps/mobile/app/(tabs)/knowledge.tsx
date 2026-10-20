import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { KnowledgeHit, SurahKnowledge } from "@tarteel/database";
import type { Surah } from "@tarteel/types";
import { Icon } from "../../src/components/Icons";
import { StarBadge } from "../../src/components/Ornaments";
import { Button, Caption, Card, Chip, Heading, ScreenScroll } from "../../src/components/ui";
import { EVIDENCE_KEY } from "../../src/knowledge/labels";
import { useEntityCounts, useKnowledgeBrowse, useKnowledgeSearch } from "../../src/knowledge/hooks";
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
    return (
      <Pressable key={k.surahId} accessibilityRole="button" accessibilityLabel={`${surahName(k.surahId)}. ${parts}`} onPress={() => router.push(`/history/${k.surahId}`)}>
        <Card padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <StarBadge n={k.surahId} size={42} fill={th.surfaceAlt} stroke={th.brass} color={th.text} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{surahName(k.surahId)}</Text>
              <Caption>{parts}</Caption>
            </View>
            <Icon name="chevronRight" size={20} color={th.muted} />
          </View>
        </Card>
      </Pressable>
    );
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
      <View style={{ gap: 12 }}>
        {entityTotal > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("tlTitle")} onPress={() => router.push("/timeline")}>
            <Card padding={14}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: th.text, fontSize: 17, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("tlTitle")}</Text>
                  <Caption>{t("tlEntry")}</Caption>
                </View>
                <Icon name="chevronRight" size={20} color={th.muted} />
              </View>
            </Card>
          </Pressable>
        ) : null}
        {browse.state.value.length > 0 ? <Caption>{t("knowBrowse")} · {browse.state.value.length}</Caption> : null}
        {browse.state.value.map(surahRow)}
        {libraryButton}
      </View>
    );
  }

  return (
    <ScreenScroll headerless>
      <Heading size={30}>{t("knowTitle")}</Heading>
      <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("knowIntro")}</Text>
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
      {hadeethEncEnabled ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("hdTitle")} onPress={() => router.push("/hadeeth")}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("hdTitle")}</Text>
                <Caption>{t("hdEntry")}</Caption>
              </View>
              <Icon name="chevronRight" size={20} color={th.muted} />
            </View>
          </Card>
        </Pressable>
      ) : null}
      {hadithEnabled ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("hadTitle")} onPress={() => router.push("/hadith")}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("hadTitle")}</Text>
                <Caption>{t("hadEntry")}</Caption>
              </View>
              <Icon name="chevronRight" size={20} color={th.muted} />
            </View>
          </Card>
        </Pressable>
      ) : null}
    </ScreenScroll>
  );
}
