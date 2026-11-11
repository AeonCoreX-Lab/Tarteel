import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { TranslateError, targetLanguage, translateText } from "@tarteel/core";
import type { MachineTranslation, TranslateLang, TranslatorPort } from "@tarteel/core";
import { Button, Caption, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";
import { getTranslator, rememberTranslation, rememberedTranslation, translationKey } from "./runtime";

type State =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "translating"; done: number; total: number }
  | { k: "ready"; tr: MachineTranslation }
  | { k: "error"; code: "download-failed" | "failed" | "unavailable" };

/** The engine this build has, or null (decided once). `undefined` while it is being checked. */
export function useEngine(): TranslatorPort | null | undefined {
  const [engine, setEngine] = useState<TranslatorPort | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getTranslator().then((e) => !cancelled && setEngine(e));
    return () => {
      cancelled = true;
    };
  }, []);
  return engine;
}

const ERROR_KEY: Record<"download-failed" | "failed" | "unavailable", StringKey> = { "download-failed": "trErrDownload", failed: "trErrFailed", unavailable: "trUnavailable" };

/**
 * Translate one Arabic passage on this device. The Arabic stays; the translation is shown below it, marked as machine
 * translation. Until the person turned translation on, the first tap shows what will happen (a small language pack is downloaded
 * once, then nothing leaves the phone) and asks. Any screen with Arabic text can use this.
 */
export function PassageTranslation({ text, from = "ar" }: { text: string; from?: TranslateLang }) {
  const th = useTheme();
  const t = useT();
  const on = useSettings((s) => s.translateOn);
  const targetPref = useSettings((s) => s.translateTarget);
  const wifiOnly = useSettings((s) => s.translateWifiOnly);
  const ui = useSettings((s) => s.uiLanguage);
  const set = useSettings((s) => s.set);
  const to = targetLanguage(targetPref, ui);
  const key = translationKey(text, to);
  const engine = useEngine();
  const [state, setState] = useState<State>(() => {
    const done = rememberedTranslation(key);
    return done ? { k: "ready", tr: done } : { k: "idle" };
  });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const run = async (): Promise<void> => {
    if (!engine) return setState({ k: "error", code: "unavailable" });
    stop.current?.abort();
    const c = new AbortController();
    stop.current = c;
    try {
      setState({ k: "preparing" });
      await engine.prepare(from, to, { wifiOnly });
      if (c.signal.aborted) return;
      setState({ k: "translating", done: 0, total: 1 });
      const tr = await translateText(engine, text, from, to, { signal: c.signal, onProgress: (done, total) => !c.signal.aborted && setState({ k: "translating", done, total }) });
      if (c.signal.aborted) return;
      rememberTranslation(key, tr);
      setState({ k: "ready", tr });
    } catch (e) {
      if (c.signal.aborted || (e instanceof TranslateError && e.code === "cancelled")) return;
      setState({ k: "error", code: e instanceof TranslateError && (e.code === "download-failed" || e.code === "unavailable") ? e.code : "failed" });
    }
  };

  if (engine === undefined) return null;
  if (engine === null) return <Caption>{t("trUnavailable")}</Caption>;

  if (state.k === "ready")
    return (
      <Card padding={14}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>{`${t("trLabel")} · ${state.tr.engineName}`}</Text>
          <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 25, writingDirection: "ltr" }}>{state.tr.text}</Text>
          <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("trConsentWarn")}</Text>
        </View>
      </Card>
    );

  if (state.k === "preparing" || state.k === "translating")
    return <Caption>{state.k === "preparing" ? t("trPreparing") : `${t("trWorking")} ${state.done}/${state.total}`}</Caption>;

  return (
    <View style={{ gap: 8 }}>
      {state.k === "error" ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{t(ERROR_KEY[state.code])}</Text> : null}
      {on ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={state.k === "error" ? t("trRetry") : t("bkTranslate")} onPress={() => void run()} />
        </View>
      ) : (
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("trConsentTitle")}</Text>
            <Text style={{ color: th.text, fontSize: 13, lineHeight: 19 }}>{t("trConsentBody")}</Text>
            <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("trConsentWarn")}</Text>
            <View style={{ flexDirection: "row" }}>
              <Button
                label={t("trConsentOn")}
                onPress={() => {
                  set("translateOn", true);
                  void run();
                }}
              />
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}
