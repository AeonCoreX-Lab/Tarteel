import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Location from "expo-location";
import { createHeadingSmoother, distanceToKaabaKm, headingQuality, headingStability, isAligned, qiblaBearing, turnToward } from "@tarteel/prayer";
import { Caption, Card, Chip, Heading, ScreenScroll } from "../src/components/ui";
import { useSettings } from "../src/state/settings";
import { useT } from "../src/i18n";
import { HEADING_FONT, useTheme } from "../src/theme";

const SIZE = 280;

export default function QiblaScreen() {
  const th = useTheme();
  const t = useT();
  const location = useSettings((s) => s.location);
  const [heading, setHeading] = useState<{ deg: number; accuracy: number; isTrue: boolean } | null>(null);
  const [denied, setDenied] = useState(false);
  const [stability, setStability] = useState(55);
  const smoother = useRef(createHeadingSmoother(0.25)).current;
  const recent = useRef<number[]>([]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return setDenied(true);
      const s = await Location.watchHeadingAsync((h) => {
        // Prefer TRUE north (the Qibla bearing is relative to true north). -1 means unavailable.
        const isTrue = h.trueHeading >= 0;
        const raw = isTrue ? h.trueHeading : h.magHeading;
        recent.current = [...recent.current.slice(-19), raw];
        setStability(headingStability(recent.current));
        setHeading({ deg: smoother.push(raw), accuracy: h.accuracy, isTrue });
      });
      if (cancelled) s.remove();
      else sub = s;
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  if (!location) return <ScreenScroll><Text style={{ color: th.muted, fontSize: 15, lineHeight: 22 }}>{t("needLocationBody")}</Text></ScreenScroll>;
  const bearing = qiblaBearing(location.latitude, location.longitude);
  const km = Math.round(distanceToKaabaKm(location.latitude, location.longitude));
  if (bearing === null) return <ScreenScroll><Heading size={22}>{t("atKaaba")}</Heading></ScreenScroll>;

  const turn = heading ? turnToward(heading.deg, bearing) : null;
  const aligned = heading ? isAligned(heading.deg, bearing) : false;
  const quality = heading ? headingQuality(heading.accuracy) : null;
  const needsCalibration = heading !== null && (quality !== "good" || stability < 40);
  const instruction = turn === null ? t("findingHeading")
    : aligned ? t("aligned")
    : `${turn < 0 ? t("turnLeft") : t("turnRight")} ${Math.round(Math.abs(turn))}°`;
  const ring = aligned ? th.brass : th.accentText;

  return (
    <ScreenScroll>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Heading size={30} align="center">{Math.round(bearing)}°</Heading>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label={`${km.toLocaleString()} km`} />
          {heading ? <Chip label={heading.isTrue ? t("headingTrue") : t("headingMagnetic")} /> : null}
        </View>
      </View>

      <Card tone="alt" padding={20}>
        <View style={{ alignItems: "center", gap: 18 }}>
          {/* Fixed pointer: the direction the phone is facing */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: SIZE, height: SIZE + 20, alignItems: "center" }}>
            <View style={{ width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 18, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: ring }} />
            {/* The dial turns opposite to the heading so "N" stays at true north */}
            <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 3, borderColor: ring, backgroundColor: th.surface, transform: [{ rotate: `${-(heading?.deg ?? 0)}deg` }] }}>
              <View style={{ position: "absolute", top: 10, bottom: 10, left: 10, right: 10, borderRadius: SIZE / 2, borderWidth: 1, borderColor: th.border }} />
              <Text style={{ position: "absolute", top: 12, alignSelf: "center", color: th.muted, fontWeight: "800", fontFamily: HEADING_FONT }}>N</Text>
              <View style={{ position: "absolute", width: SIZE - 6, height: SIZE - 6, alignItems: "center", transform: [{ rotate: `${bearing}deg` }] }}>
                <View style={{ marginTop: 34, width: 16, height: 78, borderRadius: 8, backgroundColor: th.brass }} />
                <Text style={{ marginTop: 6, color: th.brassText, fontSize: 12, fontWeight: "800" }}>{t("qibla")}</Text>
              </View>
            </View>
          </View>
          <Text accessibilityLiveRegion={aligned ? "polite" : "none"} style={{ color: aligned ? th.brassText : th.text, fontSize: 24, fontWeight: "700", fontFamily: HEADING_FONT, textAlign: "center" }}>{instruction}</Text>
        </View>
      </Card>

      {needsCalibration ? <Caption color={th.text}>{t("calibrate")}</Caption> : null}
      {denied ? <Caption color={th.text}>{t("locationDenied")}</Caption> : null}
    </ScreenScroll>
  );
}
