import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { TRANSLATE_LANGS } from "@tarteel/core";
import type { TranslateLang, TranslatorPort } from "@tarteel/core";
import { Button, Caption, Segmented } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";

const LANG_KEY: Record<TranslateLang, StringKey> = { ar: "trLangAr", en: "trLangEn", bn: "trLangBn" };

/** The controls of the "Translation (on this device)" group in Settings: on or off, target language, Wi-Fi, and the packs kept (each can be deleted). */
export function TranslationSettings({ engine }: { engine: TranslatorPort }) {
  const th = useTheme();
  const t = useT();
  const s = useSettings();
  const [packs, setPacks] = useState<string[] | null>(null);
  const reload = useCallback(() => {
    void engine.downloaded().then(setPacks);
  }, [engine]);
  useEffect(reload, [reload]);
  const kept = (packs ?? []).filter((p): p is TranslateLang => (TRANSLATE_LANGS as readonly string[]).includes(p));
  return (
    <>
      <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("trSettingBody")}</Text>
      <Segmented label={t("trSettingTitle")} value={s.translateOn ? 1 : 0} onChange={(v) => s.set("translateOn", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]} />
      {s.translateOn ? (
        <>
          <Caption>{t("trTarget")}</Caption>
          <Segmented label={t("trTarget")} value={s.translateTarget} onChange={(v) => s.set("translateTarget", v)} options={[{ value: "app", label: t("trTargetApp") }, { value: "en", label: t("trLangEn") }, { value: "bn", label: t("trLangBn") }]} />
          <Caption>{t("trWifi")}</Caption>
          <Segmented label={t("trWifi")} value={s.translateWifiOnly ? 1 : 0} onChange={(v) => s.set("translateWifiOnly", v === 1)} options={[{ value: 1, label: t("trWifiOnly") }, { value: 0, label: t("trWifiAny") }]} />
        </>
      ) : null}
      <Caption>{t("trPacks")}</Caption>
      {packs !== null && kept.length === 0 ? <Text style={{ color: th.muted, fontSize: 13 }}>{t("trPackNone")}</Text> : null}
      {kept.map((lang) => (
        <View key={lang} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ color: th.text, fontSize: 15, fontWeight: "600" }}>{t(LANG_KEY[lang])}</Text>
          <Button label={t("trDelete")} onPress={() => void engine.remove(lang).then(reload, reload)} />
        </View>
      ))}
    </>
  );
}
