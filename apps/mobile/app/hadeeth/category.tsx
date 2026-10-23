import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Caption, ScreenScroll } from "../../src/components/ui";
import { Hero, ListRow, OrnamentDivider, RowStar, SectionHeader } from "../../src/components/Heritage";
import { useHadeethCategories, useHadeethList } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { useTheme } from "../../src/theme";

function Subtopics({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const { state } = useHadeethCategories();
  if (state.status !== "ready") return null;
  const children = state.value.filter((c) => c.parentId === id);
  if (children.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader label={t("hdSubtopics")} trailing={String(children.length)} />
      {children.map((c, i) => (
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

function List({ id }: { id: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { items, total, hasMore, state, more, retry } = useHadeethList(id);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader label={t("hdHadithIn")} trailing={total > 0 ? String(total) : undefined} />
      {items.map((h, i) => (
        <ListRow key={h.id} title={h.title} lead={<RowStar n={i + 1} />} onPress={() => router.push(`/hadeeth/view?id=${encodeURIComponent(h.id)}`)} />
      ))}
      {state.status === "loading" ? <Caption>{t("knowLoading")}</Caption> : null}
      {state.status === "error" ? <HadithError state={state} retry={retry} /> : null}
      {state.status === "ready" && items.length === 0 ? <Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("hdNoHadith")}</Text> : null}
      {state.status === "ready" && hasMore ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={t("hadLoadMore")} onPress={more} />
        </View>
      ) : null}
    </View>
  );
}

/** One topic: its subtopics and a page at a time of its hadith titles. */
export default function HadeethCategory() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = useT();
  const title = name ? String(name) : t("hdTitle");
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScreenScroll>
        <Hero title={title} icon="books" />
        <HadeethGate>
          <Subtopics id={String(id)} />
          <List id={String(id)} />
        </HadeethGate>
        <OrnamentDivider margin={8} />
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
