import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Caption, ScreenScroll } from "../../src/components/ui";
import { Hero, ListRow, OrnamentDivider, RowStar, SectionHeader } from "../../src/components/Heritage";
import { useHadeethCategories } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";

function Topics() {
  const t = useT();
  const router = useRouter();
  const { state, retry } = useHadeethCategories();
  if (state.status === "error") return <HadithError state={state} retry={retry} />;
  if (state.status !== "ready") return <Caption>{t("knowLoading")}</Caption>;
  const roots = state.value.filter((c) => c.parentId === null);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader label={t("hdTopics")} trailing={String(roots.length)} />
      {roots.map((c, i) => (
        <ListRow
          key={c.id}
          title={c.title}
          subtitle={c.hadeethsCount > 0 ? `${c.hadeethsCount} ${t("hdCount")}` : undefined}
          lead={<RowStar n={i + 1} />}
          onPress={() => router.push(`/hadeeth/category?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.title)}`)}
        />
      ))}
    </View>
  );
}

/** Online hadith from HadeethEnc: the topics. Every request is made live and nothing is stored. */
export default function HadeethHome() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t("hdTitle") }} />
      <ScreenScroll>
        <Hero title={t("hdTitle")} subtitle={t("hdIntro")} icon="books" />
        <HadeethGate>
          <Topics />
        </HadeethGate>
        <OrnamentDivider margin={8} />
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
