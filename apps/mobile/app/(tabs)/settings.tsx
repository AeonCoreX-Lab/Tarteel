import { useState } from "react";
import type { ReactNode } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { LIMITS, clamp } from "@tarteel/core";
import { METHODS, resolveMethod, validateCoordinates } from "@tarteel/prayer";
import { BRAND } from "../../src/brand";
import { TranslationPicker } from "../../src/components/TranslationPicker";
import { Button, Caption, Card, Heading, Row, ScreenScroll, Segmented } from "../../src/components/ui";
import { LocationError, deviceRegion, detectLocation } from "../../src/platform/location";
import { RECITERS, selectedReciter } from "../../src/audio/runtime";
import { hadeethEncEnabled, hadithEnabled } from "../../src/hadith/runtime";
import { quranEncEnabled, quranpediaEnabled, wikipediaEnabled } from "../../src/online/runtime";
import { knowledgeConfigured } from "../../src/knowledge/runtime";
import { useApp } from "../../src/state/app";
import { useSettings } from "../../src/state/settings";
import { useT } from "../../src/i18n";
import { HEADING_FONT, useTheme } from "../../src/theme";

// Tanzil's terms of use require the source to be clearly indicated, with a link to tanzil.net.
const TANZIL_URL = "https://tanzil.net";
const QURAN_TEXT_CREDIT = "Tanzil Project · Uthmani text, version 1.1 · CC BY 3.0 (verbatim copies only)";

function Group({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.brassText, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase", paddingHorizontal: 4 }}>{title}</Text>
      <Card padding={16}><View style={{ gap: 14 }}>{children}</View></Card>
    </View>
  );
}

function Stepper({ label, value, step, min, max, format, onChange }: {
  label: string; value: number; step: number; min: number; max: number; format?: (n: number) => string; onChange: (n: number) => void;
}) {
  const th = useTheme();
  const t = useT();
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: th.text, fontWeight: "600" }}>{label}</Text>
      <Row>
        <Button label={`− ${t("decrease")}`} onPress={() => onChange(clamp(round(value - step), min, max))} disabled={value <= min} />
        <Text accessibilityLabel={`${label}: ${format ? format(value) : value}`} style={{ color: th.text, fontSize: 16, minWidth: 48, textAlign: "center" }}>{format ? format(value) : value}</Text>
        <Button label={`+ ${t("increase")}`} onPress={() => onChange(clamp(round(value + step), min, max))} disabled={value >= max} />
      </Row>
    </View>
  );
}

export default function SettingsTab() {
  const th = useTheme();
  const t = useT();
  const s = useSettings();
  const router = useRouter();
  const { translations } = useApp();
  const [lat, setLat] = useState(s.location ? String(s.location.latitude) : "");
  const [lng, setLng] = useState(s.location ? String(s.location.longitude) : "");
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const choice = resolveMethod({ userMethodId: s.calcMethodId, userSchool: s.asrSchool, countryCode: s.countryCode });
  const sourceUrl = String(Constants.expoConfig?.extra?.["sourceUrl"] ?? "");

  function saveManual() {
    const check = validateCoordinates(lat.trim() === "" ? NaN : Number(lat), lng.trim() === "" ? NaN : Number(lng));
    if (!check.ok) return setLocMsg(check.reason === "null-island" ? t("coordsNullIsland") : t("coordsInvalid"));
    s.set("location", { latitude: check.latitude, longitude: check.longitude, source: "manual" });
    if (!s.countryCode) s.set("countryCode", deviceRegion());
    setLocMsg(null);
  }
  async function useGps() {
    try {
      const r = await detectLocation();
      s.set("location", r.location);
      if (r.countryCode) s.set("countryCode", r.countryCode);
      setLat(String(r.location.latitude));
      setLng(String(r.location.longitude));
      setLocMsg(null);
    } catch (e) {
      setLocMsg(e instanceof LocationError && e.reason === "permission-denied" ? t("locationDenied") : t("locationFailed"));
    }
  }
  const field = { minHeight: 48, flexGrow: 1, minWidth: 130, borderWidth: 1, borderColor: th.border, borderRadius: 12, paddingHorizontal: 12, color: th.text, backgroundColor: th.surfaceAlt, fontSize: 16 } as const;

  return (
    <ScreenScroll gap={22}>
      <Heading size={30}>{t("settings")}</Heading>

      <Group title={t("appearance")}>
        <Segmented
          label={t("theme")}
          value={s.theme}
          onChange={(v) => s.set("theme", v)}
          options={[{ value: "system", label: t("system") }, { value: "light", label: t("light") }, { value: "dark", label: t("dark") }, { value: "amoled", label: t("amoled") }]}
        />
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("language")}</Text>
        <Segmented label={t("language")} value={s.uiLanguage} onChange={(v) => s.set("uiLanguage", v)} options={[{ value: "en", label: "English" }, { value: "bn", label: "বাংলা" }]} />
      </Group>

      <Group title={t("reading")}>
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("readerMode")}</Text>
        <Segmented
          label={t("readerMode")}
          value={s.readerMode}
          onChange={(v) => s.set("readerMode", v)}
          options={[{ value: "arabic", label: t("arabicOnly") }, { value: "translation", label: t("translationOnly") }, { value: "both", label: t("both") }]}
        />
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("translation")}</Text>
        <TranslationPicker translations={translations} selectedId={s.selectedTranslationId} onSelect={(id) => s.set("selectedTranslationId", id)} />
        <Stepper label={t("arabicSize")} value={s.arabicFontSize} step={2} {...LIMITS.arabicFontSize} onChange={(n) => s.set("arabicFontSize", n)} />
        <Stepper label={t("translationSize")} value={s.translationFontSize} step={1} {...LIMITS.translationFontSize} onChange={(n) => s.set("translationFontSize", n)} />
        <Stepper label={t("lineSpacing")} value={s.lineSpacing} step={0.1} {...LIMITS.lineSpacing} format={(n) => n.toFixed(1)} onChange={(n) => s.set("lineSpacing", n)} />
        {/* Preview uses the brand's own words, never Quran text. */}
        <Card tone="alt" padding={14}>
          <Caption>{t("sample")}</Caption>
          <Text style={{ color: th.text, fontSize: s.arabicFontSize, lineHeight: s.arabicFontSize * s.lineSpacing, textAlign: "right", writingDirection: "rtl" }}>{BRAND.arabicName}</Text>
          <Text style={{ color: th.muted, fontSize: s.translationFontSize, lineHeight: s.translationFontSize * 1.5 }}>{t("tagline")}</Text>
        </Card>
        <Row>
          <Button label={t("saveHistory") + ": " + (s.historyEnabled ? "On" : "Off")} onPress={() => s.set("historyEnabled", !s.historyEnabled)} />
        </Row>
      </Group>

      <Group title={t("prayerSettings")}>
        <Caption>
          {t("method")}: {choice.methodId === "auto" ? t("automatic") : METHODS.find((m) => m.id === choice.methodId)?.name} · {choice.school === 1 ? t("hanafi") : t("standardAsr")}
        </Caption>
        <Row>
          <Button label={t("automatic")} selected={s.calcMethodId === null} onPress={() => s.set("calcMethodId", null)} />
          {METHODS.map((m) => <Button key={m.id} label={m.name} selected={s.calcMethodId === m.id} onPress={() => s.set("calcMethodId", m.id)} />)}
        </Row>
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("asrSchool")}</Text>
        <Segmented
          label={t("asrSchool")}
          value={s.asrSchool === null ? "auto" : s.asrSchool === 0 ? "std" : "han"}
          onChange={(v) => s.set("asrSchool", v === "auto" ? null : v === "std" ? 0 : 1)}
          options={[{ value: "auto", label: t("automatic") }, { value: "std", label: t("standardAsr") }, { value: "han", label: t("hanafi") }]}
        />
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("hijriAdjust")}</Text>
        <Segmented
          label={t("hijriAdjust")}
          value={s.hijriOffsetDays}
          onChange={(v) => s.set("hijriOffsetDays", v)}
          options={[-2, -1, 0, 1, 2].map((d) => ({ value: d, label: d > 0 ? `+${d}` : String(d) }))}
        />
        <Text style={{ color: th.text, fontWeight: "600" }}>{t("summaryLocation")}</Text>
        <Row>
          <TextInput value={lat} onChangeText={setLat} placeholder={t("latitude")} placeholderTextColor={th.muted} accessibilityLabel={t("latitude")} keyboardType="numbers-and-punctuation" style={field} />
          <TextInput value={lng} onChangeText={setLng} placeholder={t("longitude")} placeholderTextColor={th.muted} accessibilityLabel={t("longitude")} keyboardType="numbers-and-punctuation" style={field} />
        </Row>
        <Row>
          <Button label={t("save")} onPress={saveManual} />
          <Button label={t("useGps")} onPress={() => void useGps()} />
        </Row>
        {locMsg ? <Text accessibilityLiveRegion="polite" style={{ color: th.text, fontSize: 13 }}>{locMsg}</Text> : null}
        <Row><Button label={t("runSetup")} onPress={() => { s.set("onboardingComplete", false); router.replace("/setup"); }} /></Row>
      </Group>

      <Group title={t("recitation")}>
        <Text style={{ color: th.text, fontSize: 15 }}>
          {RECITERS.length === 0 ? t("listenNotAvailable") : `${t("reciter")}: ${selectedReciter()?.name ?? t("chooseReciter")}`}
        </Text>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("recitationPrivacy")}</Text>
        <Row><Button label={t("reciters")} onPress={() => router.push("/reciters")} /></Row>
      </Group>

      {knowledgeConfigured ? (
        <Group title={t("libraryTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("libraryIntro")}</Text>
          <Row><Button label={t("libraryTitle")} onPress={() => router.push("/library")} /></Row>
        </Group>
      ) : null}

      {hadeethEncEnabled ? (
        <Group title={t("hdSettingTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hdSettingBody")}</Text>
          <Segmented label={t("hdSettingTitle")} value={s.onlineHadeethEnc ? 1 : 0} onChange={(v) => s.set("onlineHadeethEnc", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("hadSettingOn") }]} />
          <Row><Button label={t("hdTitle")} onPress={() => router.push("/hadeeth")} /></Row>
        </Group>
      ) : null}

      {quranEncEnabled ? (
        <Group title={t("tfSettingTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("tfSettingBody")}</Text>
          <Segmented label={t("tfSettingTitle")} value={s.onlineQuranEnc ? 1 : 0} onChange={(v) => s.set("onlineQuranEnc", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]} />
        </Group>
      ) : null}

      {quranpediaEnabled ? (
        <Group title={t("qpSettingTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("qpSettingBody")}</Text>
          <Segmented label={t("qpSettingTitle")} value={s.onlineQuranpedia ? 1 : 0} onChange={(v) => s.set("onlineQuranpedia", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("tsOn") }]} />
        </Group>
      ) : null}

      {wikipediaEnabled ? (
        <Group title={t("wkSettingTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("wkSettingBody")}</Text>
          <Segmented label={t("wkSettingTitle")} value={s.onlineWikipedia ? 1 : 0} onChange={(v) => s.set("onlineWikipedia", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("hadSettingOn") }]} />
        </Group>
      ) : null}

      {hadithEnabled ? (
        <Group title={t("hadSettingTitle")}>
          <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("hadSettingBody")}</Text>
          <Segmented label={t("hadSettingTitle")} value={s.onlineHadith ? 1 : 0} onChange={(v) => s.set("onlineHadith", v === 1)} options={[{ value: 0, label: t("off") }, { value: 1, label: t("hadSettingOn") }]} />
          <Row><Button label={t("hadTitle")} onPress={() => router.push("/hadith")} /></Row>
        </Group>
      ) : null}

      <Group title={t("privacy")}>
        <Text style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{t("privacyNote")}</Text>
      </Group>

      <Group title={t("sources")}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT }}>{t("quranText")}</Text>
          <Text selectable style={{ color: th.muted, fontSize: 13 }}>{QURAN_TEXT_CREDIT}</Text>
          <Row><Button label="tanzil.net" hint={TANZIL_URL} onPress={() => void Linking.openURL(TANZIL_URL)} /></Row>
        </View>
        {translations.map((tr) => (
          <View key={tr.id} style={{ gap: 2 }}>
            <Text style={{ color: th.text, fontWeight: "700", fontFamily: HEADING_FONT }}>{tr.languageName} · {tr.translator}</Text>
            <Text selectable style={{ color: th.muted, fontSize: 13 }}>{tr.attribution}</Text>
            <Text selectable style={{ color: th.muted, fontSize: 13 }}>{tr.copyright} · {tr.licenseName} · v{tr.version}</Text>
            <Text selectable style={{ color: th.muted, fontSize: 13 }}>{tr.sourceName} — {tr.sourceUrl}</Text>
          </View>
        ))}
      </Group>

      <Group title={t("about")}>
        <Text style={{ color: th.text, fontSize: 18, fontWeight: "700", fontFamily: HEADING_FONT }}>{BRAND.name} · {BRAND.arabicName}</Text>
        <Caption>{t("version")} {String(Constants.expoConfig?.version ?? "")}</Caption>
        <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>{t("licenseNote")}</Text>
        <Row><Button label={t("sourceCode")} hint={sourceUrl} onPress={() => void Linking.openURL(sourceUrl)} /></Row>
      </Group>
    </ScreenScroll>
  );
}
