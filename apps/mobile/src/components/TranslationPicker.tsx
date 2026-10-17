import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { splitTranslations } from "@tarteel/core";
import type { TranslationMeta } from "@tarteel/types";
import { useT } from "../i18n";
import { useSettings } from "../state/settings";
import { HEADING_FONT, useTheme } from "../theme";
import { Button, Row } from "./ui";

/**
 * Translation chooser. A few translations are shown as buttons (the app language's first, and always the selected one); the rest
 * sit behind a "More" button that opens a sheet listing every translation, one per row. With seven or more translations a
 * wall of buttons stops being readable, so the screen stays short and the full list is one tap away.
 */
export function TranslationPicker({ translations, selectedId, onSelect }: {
  translations: readonly TranslationMeta[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const th = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const uiLanguage = useSettings((s) => s.uiLanguage);
  const [open, setOpen] = useState(false);
  const { shown, more, all } = splitTranslations(translations, selectedId, { preferredLanguages: [uiLanguage, "en", "bn"] });
  const pick = (id: string | null): void => {
    onSelect(id);
    setOpen(false);
  };
  const row = (id: string | null, title: string, subtitle?: string) => {
    const selected = selectedId === id;
    return (
      <Pressable
        key={id ?? "none"}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ selected }}
        onPress={() => pick(id)}
        style={({ pressed }) => ({
          minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12,
          borderBottomWidth: 1, borderBottomColor: th.border, backgroundColor: pressed ? th.surfaceAlt : "transparent",
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: th.text, fontSize: 16, fontWeight: selected ? "700" : "600" }}>{title}</Text>
          {subtitle ? <Text style={{ color: th.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: th.accentText, fontSize: 20, fontWeight: "800", width: 24, textAlign: "center" }}>{selected ? "✓" : ""}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <Row>
        <Button label={t("none")} selected={selectedId === null} onPress={() => onSelect(null)} />
        {shown.map((tr) => (
          <Button key={tr.id} label={`${tr.languageName} · ${tr.translator}`} selected={selectedId === tr.id} onPress={() => onSelect(tr.id)} />
        ))}
        {more.length > 0 ? <Button label={`${t("more")} (${more.length})`} hint={t("translationSheetTitle")} onPress={() => setOpen(true)} /> : null}
      </Row>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable accessibilityLabel={t("close")} accessibilityRole="button" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          {/* The sheet swallows taps so that only the dimmed area closes it. */}
          <Pressable accessible={false} onPress={() => undefined} style={{ maxHeight: "80%", backgroundColor: th.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(insets.bottom, 12), overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text accessibilityRole="header" style={{ flex: 1, color: th.text, fontSize: 20, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("translationSheetTitle")}</Text>
              <Button label={t("close")} onPress={() => setOpen(false)} />
            </View>
            <ScrollView style={{ borderTopWidth: 1, borderTopColor: th.border }}>
              {row(null, t("none"))}
              {all.map((tr) => row(tr.id, tr.languageName, tr.translator))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
