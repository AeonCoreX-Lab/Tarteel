import { memo } from "react";
import { Text, View } from "react-native";
import type { AyahWithTranslation } from "@tarteel/types";
import type { Theme } from "../theme";

interface Props {
  /** Ayah 1:1 of the dataset: the Bismillah itself, with its translation when one is selected. */
  ayah: AyahWithTranslation;
  showArabic: boolean;
  showTranslation: boolean;
  arabicSize: number;
  translationSize: number;
  lineSpacing: number;
  th: Theme;
  /** The Bismillah is being recited right now. */
  recited?: boolean;
}

/** The Bismillah above the first ayah of surahs 2-114 (except 9). It is a heading, not a verse: no number, no bookmark. */
export const BismillahHeading = memo(function BismillahHeading(p: Props) {
  const { th } = p;
  if (!p.showArabic && !(p.showTranslation && p.ayah.translation)) return null;
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: th.border, borderLeftWidth: p.recited ? 3 : 0, borderLeftColor: th.brass, backgroundColor: p.recited ? th.surfaceAlt : undefined }}>
      {p.showArabic ? (
        <Text selectable style={{ color: th.text, fontSize: p.arabicSize, lineHeight: p.arabicSize * p.lineSpacing, textAlign: "center", writingDirection: "rtl" }}>
          {p.ayah.textArabic}
        </Text>
      ) : null}
      {p.showTranslation && p.ayah.translation ? (
        <Text selectable style={{ color: p.showArabic ? th.muted : th.text, fontSize: p.translationSize, lineHeight: p.translationSize * 1.55, textAlign: "center" }}>
          {p.ayah.translation}
        </Text>
      ) : null}
    </View>
  );
});
