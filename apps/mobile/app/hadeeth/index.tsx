import { Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Icon } from "../../src/components/Icons";
import { Caption, Card, Heading, ScreenScroll } from "../../src/components/ui";
import { useHadeethCategories } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

function Topics() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadeethCategories();
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const roots = state.value.filter((c) => c.parentId === null);
  return (
    <View style={{ gap: 12 }}>
      <Caption>{t("hdTopics")}</Caption>
      {roots.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.title} onPress={() => router.push(`/hadeeth/category?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.title)}`)}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: th.text, fontSize: 16, fontWeight: "700", fontFamily: HEADING_FONT }}>{c.title}</Text>
                {c.hadeethsCount > 0 ? <Caption>{`${c.hadeethsCount} ${t("hdCount")}`}</Caption> : null}
              </View>
              <Icon name="chevronRight" size={20} color={th.muted} />
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

/** Online hadith from HadeethEnc: the topics. Every request is made live and nothing is stored. */
export default function HadeethHome() {
  const th = useTheme();
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("hdTitle") }} />
      <ScreenScroll>
        <Heading size={28}>{t("hdTitle")}</Heading>
        <HadeethGate>
          <Text style={{ color: th.muted, fontSize: 14, lineHeight: 20 }}>{t("hdIntro")}</Text>
          <Topics />
        </HadeethGate>
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
