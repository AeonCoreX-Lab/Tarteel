import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { TranslateError, targetLanguage, translateText } from "@tarteel/core";
import type { MachineTranslation, TranslateLang, TranslatorPort } from "@tarteel/core";
import { Button, Caption, Card } from "../components/ui";
import { useSettings } from "../state/settings";
import { useT } from "../i18n";
import type { StringKey } from "../i18n";
import { useTheme } from "../theme";
import { chooseEngine, getEngines, rememberTranslation, rememberedTranslation, translationKey } from "./runtime";
import type { Engines } from "./runtime";

type ErrorCode = "download-failed" | "failed" | "unavailable" | "busy" | "offline";

type State =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "translating"; done: number; total: number }
  | { k: "ready"; tr: MachineTranslation }
  | { k: "error"; code: ErrorCode };

/** The engines this build has (decided once). `undefined` while that is being checked. */
export function useEngines(): Engines | undefined {
  const [engines, setEngines] = useState<Engines | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getEngines().then((e) => !cancelled && setEngines(e));
    return () => {
      cancelled = true;
    };
  }, []);
  return engines;
}

const ERROR_KEY: Record<ErrorCode, StringKey> = { "download-failed": "trErrDownload", failed: "trErrFailed", unavailable: "trUnavailable", busy: "trErrBusy", offline: "trErrOffline" };

/**
 * Translate one Arabic passage. The Arabic stays; the translation is shown below it, marked as machine translation. Until the
 * person turned translation on, the first tap shows what will happen and asks: on this device (a small language pack is downloaded
 * once, then nothing leaves the phone), or, when this build has it, online (the passage is sent to Tarteel's translation server).
 * Any screen with Arabic text can use this.
 */
export function PassageTranslation({ text, from = "ar" }: { text: string; from?: TranslateLang }) {
  const th = useTheme();
  const t = useT();
  const on = useSettings((s) => s.translateOn);
  const online = useSettings((s) => s.translateOnline);
  const targetPref = useSettings((s) => s.translateTarget);
  const wifiOnly = useSettings((s) => s.translateWifiOnly);
  const ui = useSettings((s) => s.uiLanguage);
  const set = useSettings((s) => s.set);
  const to = targetLanguage(targetPref, ui);
  const engines = useEngines();
  const engine = engines ? chooseEngine(engines, online) : undefined;
  const key = translationKey(text, to, engine?.id ?? "");
  const [state, setState] = useState<State>({ k: "idle" });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  // A different passage, language or engine starts again, and stops a translation still running for the old one.
  useEffect(() => {
    stop.current?.abort();
    setState({ k: "idle" });
  }, [key]);

  const run = async (eng: TranslatorPort): Promise<void> => {
    stop.current?.abort();
    const c = new AbortController();
    stop.current = c;
    try {
      setState({ k: "preparing" });
      await eng.prepare(from, to, { wifiOnly });
      if (c.signal.aborted) return;
      setState({ k: "translating", done: 0, total: 1 });
      const tr = await translateText(eng, text, from, to, { signal: c.signal, onProgress: (done, total) => !c.signal.aborted && setState({ k: "translating", done, total }) });
      if (c.signal.aborted) return;
      rememberTranslation(translationKey(text, to, eng.id), tr);
      setState({ k: "ready", tr });
    } catch (e) {
      if (c.signal.aborted || (e instanceof TranslateError && e.code === "cancelled")) return;
      const code = e instanceof TranslateError ? e.code : "failed";
      setState({ k: "error", code: code === "download-failed" || code === "unavailable" || code === "busy" || code === "offline" ? code : "failed" });
    }
  };

  if (engines === undefined) return null;
  if (engines.device === null && engines.online === null) return <Caption>{t("trUnavailable")}</Caption>;

  const remembered = engine ? rememberedTranslation(key) : undefined;
  const view: State = state.k === "idle" && remembered ? { k: "ready", tr: remembered } : state;

  if (view.k === "ready")
    return (
      <Card padding={14}>
        <View style={{ gap: 8 }}>
          <Text style={{ color: th.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>{`${t("trLabel")} · ${view.tr.engineName}`}</Text>
          <Text selectable style={{ color: th.text, fontSize: 16, lineHeight: 25, writingDirection: "ltr" }}>{view.tr.text}</Text>
          <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("trConsentWarn")}</Text>
        </View>
      </Card>
    );

  if (view.k === "preparing" || view.k === "translating")
    return <Caption>{view.k === "preparing" ? t("trPreparing") : `${t("trWorking")} ${view.done}/${view.total}`}</Caption>;

  return (
    <View style={{ gap: 8 }}>
      {view.k === "error" ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{t(ERROR_KEY[view.code])}</Text> : null}
      {on && engine ? (
        <View style={{ flexDirection: "row" }}>
          <Button label={view.k === "error" ? t("trRetry") : t("bkTranslate")} onPress={() => void run(engine)} />
        </View>
      ) : (
        <Card padding={14}>
          <View style={{ gap: 8 }}>
            {engines.device !== null ? (
              <>
                <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("trConsentTitle")}</Text>
                <Text style={{ color: th.text, fontSize: 13, lineHeight: 19 }}>{t("trConsentBody")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <Button
                    label={t("trConsentOn")}
                    onPress={() => {
                      set("translateOn", true);
                      set("translateOnline", false);
                      if (engines.device) void run(engines.device);
                    }}
                  />
                </View>
              </>
            ) : null}
            {engines.online !== null ? (
              <>
                <Text style={{ color: th.text, fontSize: 15, fontWeight: "700" }}>{t("trConsentOnlineTitle")}</Text>
                <Text style={{ color: th.text, fontSize: 13, lineHeight: 19 }}>{t("trConsentOnlineBody")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <Button
                    label={t("trConsentOnlineOn")}
                    onPress={() => {
                      set("translateOn", true);
                      set("translateOnline", true);
                      if (engines.online) void run(engines.online);
                    }}
                  />
                </View>
              </>
            ) : null}
            <Text style={{ color: th.muted, fontSize: 12, lineHeight: 18 }}>{t("trConsentWarn")}</Text>
          </View>
        </Card>
      )}
    </View>
  );
}
