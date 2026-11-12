import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { TRANSLATE_LANGS } from "@tarteel/core";
import type { TranslateLang } from "@tarteel/core";
import { Button, Caption, Segmented } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";
import type { Engines } from "./runtime";

const LANG_KEY: Record<TranslateLang, StringKey> = { ar: "trLangAr", en: "trLangEn", bn: "trLangBn" };

/**
 * The controls of the "Translation" group in Settings: on or off, target language, which engine (on this device, or online when this
 * build has it), Wi-Fi for language packs, and the packs kept (each can be deleted).
 */
export function TranslationSettings({ engines }: { engines: Engines }) {
  const th = useTheme();
  const t = useT();
  const s = useSettings();
  const device = engines.device;
  const [packs, setPacks] = useState<string[] | null>(null);
  const reload = useCallback(() => {
    if (device) void device.downloaded().then(setPacks);
  }, [device]);
  useEffect(reload, [reload]);
  const kept = (packs ?? []).filter((p): p is TranslateLang => (TRANSLATE_LANGS as readonly string[]).includes(p));
  return (
    <>
      <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("trSettingBody")}</Text>
      <Segmented
        label={t("trSettingTitle")}
        value={s.translateOn ? 1 : 0}
        onChange={(v) => {
          s.set("translateOn", v === 1);
          if (v !== 1) s.set("translateOnline", false);
        }}
        options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]}
      />
      {s.translateOn ? (
        <>
          <Caption>{t("trTarget")}</Caption>
          <Segmented label={t("trTarget")} value={s.translateTarget} onChange={(v) => s.set("translateTarget", v)} options={[{ value: "app", label: t("trTargetApp") }, { value: "en", label: t("trLangEn") }, { value: "bn", label: t("trLangBn") }]} />
          {device && engines.online ? (
            <>
              <Caption>{t("trEngine")}</Caption>
              <Segmented label={t("trEngine")} value={s.translateOnline ? 1 : 0} onChange={(v) => s.set("translateOnline", v === 1)} options={[{ value: 0, label: t("trEngineDevice") }, { value: 1, label: t("trEngineOnline") }]} />
              {s.translateOnline ? <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("trOnlineBody")}</Text> : null}
            </>
          ) : null}
          {device ? (
            <>
              <Caption>{t("trWifi")}</Caption>
              <Segmented label={t("trWifi")} value={s.translateWifiOnly ? 1 : 0} onChange={(v) => s.set("translateWifiOnly", v === 1)} options={[{ value: 1, label: t("trWifiOnly") }, { value: 0, label: t("trWifiAny") }]} />
            </>
          ) : null}
        </>
      ) : null}
      {device ? (
        <>
          <Caption>{t("trPacks")}</Caption>
          {packs !== null && kept.length === 0 ? <Text style={{ color: th.muted, fontSize: 13 }}>{t("trPackNone")}</Text> : null}
          {kept.map((lang) => (
            <View key={lang} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: th.text, fontSize: 15, fontWeight: "600" }}>{t(LANG_KEY[lang])}</Text>
              <Button label={t("trDelete")} onPress={() => void device.remove(lang).then(reload, reload)} />
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}
