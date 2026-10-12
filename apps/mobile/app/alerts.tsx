import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_ALERT_SETTINGS, computeRange, planAlerts, resolveMethod } from "@tarteel/prayer";
import type { PlannedAlert, ScheduledAlert } from "@tarteel/prayer";
import {
  cancelAllAlerts, getAlertStatus, listScheduled, openBackgroundSettings, openExactAlarmSettings, openFullScreenSettings,
  requestNotificationPermission, scheduleTest, syncAlerts,
} from "../src/platform/alerts";
import type { AlertStatus, Tri } from "../src/platform/alerts";
import { calculateTimes } from "../src/platform/prayer-adapter";
import { to12h } from "../src/prayer/format";
import { useSettings } from "../src/state/settings";
import { useTheme } from "../src/theme";
import { Button, Row, Section } from "../src/components/ui";

// Proof-of-concept screen for Phase 2. English only on purpose; it will be translated once the design is settled.
const label = (v: Tri) => (v === "on" ? "On" : v === "off" ? "Off" : "Unknown");

export default function AlertsPoc() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledAlert[]>([]);
  const [fullScreen, setFullScreen] = useState(true);
  const [alarmClock, setAlarmClock] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAlertStatus());
      setScheduled(await listScheduled());
    } catch (e) {
      setMsg(`Could not read alert status: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Come back from a system settings screen -> re-read the permissions.
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const run = async (fn: () => Promise<string | void>) => {
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    await refresh();
  };

  const opts = { fullScreen, alarmClock };

  async function schedulePrayers(): Promise<string> {
    if (!s.location) return "Set a location first (Setup or Settings).";
    const choice = resolveMethod({ userMethodId: s.calcMethodId, userSchool: s.asrSchool, countryCode: s.countryCode });
    const rows = computeRange(calculateTimes, s.location, new Date(), 3, choice, s.prayerOffsets);
    const days = rows.flatMap((r) => (r.result.ok ? [r.result.day] : []));
    if (days.length === 0) return "Could not calculate prayer times.";
    const planned = planAlerts({ days, settings: DEFAULT_ALERT_SETTINGS, now: new Date() });
    const describe = (a: PlannedAlert) => ({ title: a.event, subtitle: to12h(a.clock), body: `It is time for ${a.event}` });
    const r = await syncAlerts(planned, describe, opts);
    return `Planned ${planned.length} alerts: created ${r.created}, cancelled ${r.cancelled}.`;
  }

  const row = (name: string, v: Tri, fix?: { label: string; onPress: () => void }) => (
    <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
      <Text style={{ flex: 1, color: th.text, fontSize: 16 }}>{name}</Text>
      <Text style={{ color: v === "on" ? th.accentText : th.muted, fontWeight: "700" }}>{label(v)}</Text>
      {fix && v !== "on" ? <Button label={fix.label} onPress={fix.onPress} /> : null}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: 720, alignSelf: "center" }}>
      <Text style={{ color: th.muted, fontSize: 13, lineHeight: 19 }}>
        Phase 2 proof of concept. To test properly: schedule a test alert, fully close the app, lock the phone, and wait. Then repeat after a restart.
      </Text>

      <Section title="Permissions">
        {status ? (
          <>
            {row("Notifications", status.notifications, { label: "Allow", onPress: () => void run(async () => { await requestNotificationPermission(); }) })}
            {row("Exact alarms", status.exactAlarm, { label: "Open", onPress: () => void run(async () => { await openExactAlarmSettings(); }) })}
            {row("Full-screen alerts", status.fullScreen, { label: "Open", onPress: () => void run(async () => { await openFullScreenSettings(); }) })}
          </>
        ) : <Text style={{ color: th.muted }}>Reading…</Text>}
        <Row>
          <Button label="Background / autostart settings" onPress={() => void run(async () => { await openBackgroundSettings(); })} />
        </Row>
      </Section>

      <Section title="Test alert">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
          <Text style={{ color: th.text, flex: 1 }}>Full-screen alert</Text>
          <Switch value={fullScreen} onValueChange={setFullScreen} accessibilityLabel="Full-screen alert" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 }}>
          <Text style={{ color: th.text, flex: 1 }}>Alarm-clock mode (shows an alarm icon in the status bar)</Text>
          <Switch value={alarmClock} onValueChange={setAlarmClock} accessibilityLabel="Alarm-clock mode" />
        </View>
        <Row>
          <Button label="In 10 seconds" onPress={() => void run(async () => `Scheduled for ${(await scheduleTest(10, opts)).toLocaleTimeString()}`)} />
          <Button label="In 60 seconds" onPress={() => void run(async () => `Scheduled for ${(await scheduleTest(60, opts)).toLocaleTimeString()}`)} />
        </Row>
      </Section>

      <Section title="Real prayer alerts">
        <Text style={{ color: th.muted, fontSize: 13 }}>Plans the next 3 days from your location and method, and schedules only what changed.</Text>
        <Row>
          <Button label="Schedule prayer alerts" onPress={() => void run(schedulePrayers)} />
          <Button label="Cancel all" onPress={() => void run(async () => `Cancelled ${await cancelAllAlerts()} alerts.`)} />
        </Row>
      </Section>

      {msg ? <Text accessibilityLiveRegion="polite" selectable style={{ color: th.text, fontSize: 14, marginTop: 12 }}>{msg}</Text> : null}

      <Section title={`Scheduled (${scheduled.length})`}>
        {scheduled.slice(0, 12).map((a) => (
          <Text key={a.id} selectable style={{ color: th.muted, fontSize: 12 }}>
            {new Date(a.at).toLocaleString()}  ·  {a.id.replace("tarteel.", "")}
          </Text>
        ))}
        {scheduled.length > 12 ? <Text style={{ color: th.muted, fontSize: 12 }}>… and {scheduled.length - 12} more</Text> : null}
      </Section>
    </ScrollView>
  );
}
