import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "../../src/components/Icons";
import { Button, Caption, Card, Heading, ScreenScroll } from "../../src/components/ui";
import { useHadeethCategories, useHadeethList } from "../../src/hadith/hadeeth";
import { HadeethCredit, HadeethGate } from "../../src/hadith/hadeeth-parts";
import { HadithError } from "../../src/hadith/parts";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

function Subtopics({ id }: { id: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { state } = useHadeethCategories();
  if (state.status !== "ready") return null;
  const children = state.value.filter((c) => c.parentId === id);
  if (children.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <Caption>{t("hdSubtopics")}</Caption>
      {children.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.title} onPress={() => router.push(`/hadeeth/category?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.title)}`)}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: th.text, fontSize: 15, fontWeight: "700", fontFamily: HEADING_FONT }}>{c.title}</Text>
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

function List({ id }: { id: string }) {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const { items, total, hasMore, state, more, retry } = useHadeethList(id);
  return (
    <View style={{ gap: 12 }}>
      <Caption>{total > 0 ? `${t("hdHadithIn")} (${total})` : t("hdHadithIn")}</Caption>
      {items.map((h) => (
        <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={h.title} onPress={() => router.push(`/hadeeth/view?id=${encodeURIComponent(h.id)}`)}>
          <Card padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ flex: 1, color: th.text, fontSize: 15, lineHeight: 22 }}>{h.title}</Text>
              <Icon name="chevronRight" size={20} color={th.muted} />
            </View>
          </Card>
        </Pressable>
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
        <Heading size={26}>{title}</Heading>
        <HadeethGate>
          <Subtopics id={String(id)} />
          <List id={String(id)} />
        </HadeethGate>
        <HadeethCredit />
      </ScreenScroll>
    </>
  );
}
