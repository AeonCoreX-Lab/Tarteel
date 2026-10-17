import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nextStep, previousStep, setupProgress } from "@tarteel/core";
import type { SetupStepId } from "@tarteel/core";
import { METHODS, previewAsrBySchool, resolveMethod, validateCoordinates } from "@tarteel/prayer";
import { LocationError, deviceRegion, detectLocation } from "../src/platform/location";
import { suggestedUiLanguage } from "../src/platform/locale";
import { TranslationPicker } from "../src/components/TranslationPicker";
import { WelcomeCarousel } from "../src/components/WelcomeCarousel";
import { calculateTimes } from "../src/platform/prayer-adapter";
import { to12h } from "../src/prayer/format";
import { useApp } from "../src/state/app";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";
import { Button, PillButton, Row } from "../src/components/ui";

export default function Setup() {
  const th = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const { translations } = useApp();
  const [step, setStep] = useState<SetupStepId>("welcome");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lat, setLat] = useState(s.location ? String(s.location.latitude) : "");
  const [lng, setLng] = useState(s.location ? String(s.location.longitude) : "");
  const [showMethods, setShowMethods] = useState(false);

  // First launch: start in Bangla when the device is set to Bangla (the user can still change it on the next step).
  useEffect(() => {
    if (!s.onboardingComplete) s.set("uiLanguage", suggestedUiLanguage());
  }, []);

  const ctx = { hasLocation: s.location !== null, hasTranslations: translations.length > 0 };
  const progress = setupProgress(step, ctx);
  const go = (to: SetupStepId) => { setMsg(null); setStep(to); };

  async function gps() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await detectLocation();
      const ok = validateCoordinates(r.location.latitude, r.location.longitude);
      if (!ok.ok) throw new LocationError("unavailable");
      s.set("location", r.location);
      if (r.countryCode) s.set("countryCode", r.countryCode);
      setLat(String(r.location.latitude));
      setLng(String(r.location.longitude));
    } catch (e) {
      setMsg(e instanceof LocationError && e.reason === "permission-denied" ? t("locationDenied") : t("locationFailed"));
    } finally {
      setBusy(false);
    }
  }

  function saveManual() {
    const check = validateCoordinates(lat.trim() === "" ? NaN : Number(lat), lng.trim() === "" ? NaN : Number(lng));
    if (!check.ok) return setMsg(check.reason === "null-island" ? t("coordsNullIsland") : t("coordsInvalid"));
    s.set("location", { latitude: check.latitude, longitude: check.longitude, source: "manual" });
    if (!s.countryCode) s.set("countryCode", deviceRegion());
    setMsg(null);
  }

  const field = { minHeight: 48, minWidth: 130, borderWidth: 1, borderColor: th.border, borderRadius: 8, paddingHorizontal: 12, color: th.text, backgroundColor: th.surface, fontSize: 16 } as const;
  const h1 = { color: th.text, fontSize: 28, lineHeight: 35, fontWeight: "700" as const, fontFamily: HEADING_FONT };
  const body = { color: th.muted, fontSize: 15, lineHeight: 22 };

  const choice = resolveMethod({ userMethodId: s.calcMethodId, userSchool: s.asrSchool, countryCode: s.countryCode });
  let asr: ReturnType<typeof previewAsrBySchool> | null = null;
  if (step === "method" && s.location) {
    try { asr = previewAsrBySchool(calculateTimes, s.location, new Date(), choice.methodId); } catch { asr = null; }
  }

  let content: ReactNode = null;
  if (step === "language") {
    content = (
      <>
        <Text accessibilityRole="header" style={h1}>{t("setupWelcome")}</Text>
        <Text style={body}>{t("setupPromise")}</Text>
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("language")}</Text>
        <Row>
          <Button label="English" selected={s.uiLanguage === "en"} onPress={() => s.set("uiLanguage", "en")} />
          <Button label="বাংলা" selected={s.uiLanguage === "bn"} onPress={() => s.set("uiLanguage", "bn")} />
        </Row>
      </>
    );
  } else if (step === "location") {
    content = (
      <>
        <Text accessibilityRole="header" style={h1}>{t("needLocationTitle")}</Text>
        <Text style={body}>{t("needLocationBody")}</Text>
        <Row>
          <Button label={busy ? t("locating") : t("useMyLocation")} onPress={() => void gps()} disabled={busy} />
        </Row>
        {busy ? <ActivityIndicator color={th.accent} /> : null}
        <Text style={{ color: th.text, fontWeight: "600", marginTop: 8 }}>{t("enterManually")}</Text>
        <Row>
          <TextInput value={lat} onChangeText={setLat} placeholder={t("latitude")} placeholderTextColor={th.muted} accessibilityLabel={t("latitude")} keyboardType="numbers-and-punctuation" style={field} />
          <TextInput value={lng} onChangeText={setLng} placeholder={t("longitude")} placeholderTextColor={th.muted} accessibilityLabel={t("longitude")} keyboardType="numbers-and-punctuation" style={field} />
        </Row>
        <Row><Button label={t("save")} onPress={saveManual} /></Row>
        {s.location ? (
          <Text accessibilityLiveRegion="polite" style={{ color: th.accentText, fontWeight: "600" }}>
            ✓ {s.location.latitude.toFixed(3)}, {s.location.longitude.toFixed(3)}
          </Text>
        ) : (
          <Text style={body}>{t("skipLocationNote")}</Text>
        )}
      </>
    );
  } else if (step === "method") {
    const m = choice.methodId === "auto" ? t("automatic") : METHODS.find((x) => x.id === choice.methodId)?.name;
    content = (
      <>
        <Text accessibilityRole="header" style={h1}>{t("method")}</Text>
        <View style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, gap: 4 }}>
          <Text style={{ color: th.text, fontSize: 16, fontWeight: "600" }}>{m}</Text>
          <Text style={{ color: th.muted, fontSize: 13 }}>{choice.source === "country" ? t("defaultForRegion") : choice.source === "user" ? t("yourChoice") : t("automatic")}</Text>
        </View>
        <Row>
          <Button label={showMethods ? t("hideMethods") : t("chooseAnother")} onPress={() => setShowMethods((v) => !v)} />
        </Row>
        {showMethods ? (
          <Row>
            <Button label={t("automatic")} selected={s.calcMethodId === null} onPress={() => s.set("calcMethodId", null)} />
            {METHODS.map((x) => <Button key={x.id} label={x.name} selected={s.calcMethodId === x.id} onPress={() => s.set("calcMethodId", x.id)} />)}
          </Row>
        ) : null}

        <Text accessibilityRole="header" style={{ color: th.text, fontSize: 18, fontWeight: "700", marginTop: 8 }}>{t("asrSchool")}</Text>
        {asr ? (
          <>
            <Text style={body}>{t("asrChoiceBody")} {asr.differenceMinutes} {t("minutes")}.</Text>
            {([["standardAsr", asr.standard, 0], ["hanafi", asr.hanafi, 1]] as const).map(([key, time, value]) => {
              const selected = choice.school === value;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t(key)}, ${to12h(time)}`}
                  onPress={() => s.set("asrSchool", value)}
                  style={{ minHeight: 64, padding: 14, borderRadius: 10, borderWidth: selected ? 2 : 1, borderColor: selected ? th.accent : th.border, backgroundColor: th.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text style={{ color: th.text, fontSize: 16, fontWeight: selected ? "700" : "500" }}>{t(key)}</Text>
                  <Text style={{ color: th.text, fontSize: 20, fontVariant: ["tabular-nums"] }}>{to12h(time)}</Text>
                </Pressable>
              );
            })}
          </>
        ) : <Text style={body}>{t("timesFailed")}</Text>}
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("confirmLocal")}</Text>
      </>
    );
  } else if (step === "translation") {
    content = (
      <>
        <Text accessibilityRole="header" style={h1}>{t("translationTitle")}</Text>
        <Text style={body}>{t("translationBody")}</Text>
        <TranslationPicker
          translations={translations}
          selectedId={s.selectedTranslationId}
          onSelect={(id) => { s.set("selectedTranslationId", id); s.set("readerMode", id === null ? "arabic" : "both"); }}
        />
      </>
    );
  } else {
    const tr = translations.find((x) => x.id === s.selectedTranslationId);
    content = (
      <>
        <Text accessibilityRole="header" style={h1}>{t("readyTitle")}</Text>
        <View style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: th.border, backgroundColor: th.surface, gap: 8 }}>
          <Text style={{ color: th.text }}>{t("language")}: {s.uiLanguage === "bn" ? "বাংলা" : "English"}</Text>
          <Text style={{ color: th.text }}>{t("summaryLocation")}: {s.location ? `${s.location.latitude.toFixed(2)}, ${s.location.longitude.toFixed(2)}` : t("notSet")}</Text>
          {s.location ? <Text style={{ color: th.text }}>{t("method")}: {choice.methodId === "auto" ? t("automatic") : METHODS.find((x) => x.id === choice.methodId)?.name} · {choice.school === 1 ? t("hanafi") : t("standardAsr")}</Text> : null}
          <Text style={{ color: th.text }}>{t("translation")}: {tr ? `${tr.languageName} · ${tr.translator}` : t("none")}</Text>
        </View>
        <Text style={body}>{t("changeLater")}</Text>
      </>
    );
  }

  if (step === "welcome") return <WelcomeCarousel onDone={() => setStep("language")} />;

  const isFirst = step === "language";
  const isLast = step === "ready";
  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      {progress ? (
        <View accessible accessibilityLabel={`${t("step")} ${progress.now} / ${progress.total}`} style={{ paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: th.border }}>
            <View style={{ height: 4, borderRadius: 2, width: `${(progress.now / progress.total) * 100}%`, backgroundColor: th.accent }} />
          </View>
          <Text style={{ color: th.muted, fontSize: 12, marginTop: 6 }}>{t("step")} {progress.now} / {progress.total}</Text>
        </View>
      ) : <View style={{ height: insets.top + 12 }} />}

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1 }}>
        {content}
        {msg ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 14 }}>{msg}</Text> : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: th.border }}>
        {!isFirst ? <Button label={t("back")} onPress={() => go(previousStep(step, ctx))} /> : null}
        <View style={{ flex: 1 }} />
        {step === "location" && !s.location ? <Button label={t("skip")} onPress={() => go(nextStep(step, ctx))} /> : null}
        <View style={{ minWidth: 150 }}>
          {isLast ? (
            <PillButton label={t("startApp")} onPress={() => { s.set("onboardingComplete", true); router.replace("/"); }} />
          ) : (
            <PillButton label={t("continue")} disabled={step === "location" && !s.location} onPress={() => go(nextStep(step, ctx))} />
          )}
        </View>
      </View>
    </View>
  );
}
