import { Platform } from "react-native";
import notifee, {
  AlarmType, AndroidCategory, AndroidImportance, AndroidNotificationSetting, AndroidVisibility, AuthorizationStatus, TriggerType,
} from "react-native-notify-kit";
import type { Notification, TriggerNotification } from "react-native-notify-kit";
import { PRAYER_ALARM_ACTIVITY, canUseFullScreenIntent, openFullScreenIntentSettings } from "tarteel-android";
import { ALERT_ID_PREFIX, diffAlerts } from "@tarteel/prayer";
import type { PlannedAlert, ScheduledAlert } from "@tarteel/prayer";

/**
 * Thin adapter between Tarteel's alert PLAN (packages/prayer, pure and tested) and Android notifications.
 * Proof-of-concept status: this has not run on a device yet. See docs/upstream/NOTIFICATIONS-REPORT.md.
 */
export const CHANNEL_ID = "tarteel-prayer-alerts";
export const SNOOZE_MAX_MINUTES = 60;

export interface AlertOptions {
  /** Raise the full-screen alert over the lock screen. */
  fullScreen: boolean;
  /** Use the alarm-clock primitive: strongest delivery guarantee, but Android shows an alarm icon in the status bar. */
  alarmClock: boolean;
}

export interface AlertText {
  title: string;
  subtitle: string;
  body: string;
}

export type Tri = "on" | "off" | "unknown";
export interface AlertStatus {
  notifications: Tri;
  exactAlarm: Tri;
  fullScreen: Tri;
}

const isAndroid = Platform.OS === "android";

export async function ensureChannel(): Promise<void> {
  if (!isAndroid) return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Prayer alerts",
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: "default", // Tarteel's own adhan audio replaces this once a licensed recording is chosen
    vibration: true,
  });
}

export async function getAlertStatus(): Promise<AlertStatus> {
  if (!isAndroid) return { notifications: "unknown", exactAlarm: "unknown", fullScreen: "unknown" };
  const s = await notifee.getNotificationSettings();
  const setting = (v: AndroidNotificationSetting | undefined): Tri =>
    v === AndroidNotificationSetting.ENABLED ? "on" : v === AndroidNotificationSetting.DISABLED ? "off" : "unknown";
  const fsFromLib = setting(s.android?.fullScreenIntent);
  return {
    notifications: s.authorizationStatus === AuthorizationStatus.AUTHORIZED ? "on" : s.authorizationStatus === AuthorizationStatus.DENIED ? "off" : "unknown",
    exactAlarm: setting(s.android?.alarm),
    // Cross-check with the vendored native module: it reads the same Android permission directly.
    fullScreen: fsFromLib !== "unknown" ? fsFromLib : (await canUseFullScreenIntent()) ? "on" : "off",
  };
}

export const requestNotificationPermission = () => notifee.requestPermission();
export const openExactAlarmSettings = () => notifee.openAlarmPermissionSettings();
export const openFullScreenSettings = openFullScreenIntentSettings;
/** Vendor autostart / battery screens (Xiaomi, Infinix, Tecno, Samsung...). Best effort. */
export const openBackgroundSettings = () => notifee.openPowerManagerSettings();

// Colours/labels the vendored full-screen activity reads from the notification's `data`.
function fullScreenData(snoozeMinutes = 10): Record<string, string> {
  return {
    fullScreen: "1",
    fsStop: "Stop",
    fsSnooze: `Snooze ${snoozeMinutes} min`,
    fsSnoozeMinutes: String(snoozeMinutes),
    fsSnoozeAlt: JSON.stringify([5, 15, 30].map((m) => ({ m, l: `Snooze ${m} min` }))),
    fsRtl: "0",
    fsSkyTop: "#0F2A24",
    fsSkyBottom: "#1F5A4A",
    fsInk: "light",
  };
}

async function schedule(id: string, at: Date, text: AlertText, opts: AlertOptions, data: Record<string, string> = {}): Promise<void> {
  const notification: Notification = {
    id,
    title: text.title,
    subtitle: text.subtitle,
    body: text.body,
    data: { ...fullScreenData(), ...data },
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      smallIcon: "ic_stat_prayer",
      pressAction: { id: "default", launchActivity: "default" },
      ...(opts.fullScreen ? { fullScreenAction: { id: "default", launchActivity: PRAYER_ALARM_ACTIVITY } } : {}),
    },
  };
  await notifee.createTriggerNotification(notification, {
    type: TriggerType.TIMESTAMP,
    timestamp: at.getTime(),
    alarmManager: { type: opts.alarmClock ? AlarmType.SET_ALARM_CLOCK : AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
  });
}

/** A one-off alert N seconds from now, for hands-on testing (screen off, app swiped away, after reboot...). */
export async function scheduleTest(secondsFromNow: number, opts: AlertOptions): Promise<Date> {
  await ensureChannel();
  const at = new Date(Date.now() + secondsFromNow * 1000);
  await schedule(`${ALERT_ID_PREFIX}test.${at.getTime()}`, at, { title: "Test alert", subtitle: at.toLocaleTimeString(), body: "If you can read this, the alert fired." }, opts);
  return at;
}

export async function listScheduled(): Promise<ScheduledAlert[]> {
  if (!isAndroid) return [];
  const all: TriggerNotification[] = await notifee.getTriggerNotifications();
  const out: ScheduledAlert[] = [];
  for (const t of all) {
    const id = t.notification.id;
    const ts = (t.trigger as { timestamp?: number }).timestamp;
    if (id && typeof ts === "number") out.push({ id, at: ts });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Brings the device's schedule in line with the plan; touches only our own ids. */
export async function syncAlerts(
  planned: PlannedAlert[],
  describe: (a: PlannedAlert) => AlertText,
  opts: AlertOptions,
): Promise<{ created: number; cancelled: number }> {
  await ensureChannel();
  const diff = diffAlerts(await listScheduled(), planned);
  if (diff.toCancel.length) await notifee.cancelTriggerNotifications(diff.toCancel);
  for (const a of diff.toCreate) await schedule(a.id, a.at, describe(a), opts, { prayer: a.event });
  return { created: diff.toCreate.length, cancelled: diff.toCancel.length };
}

export async function cancelAllAlerts(): Promise<number> {
  const ids = (await listScheduled()).map((s) => s.id).filter((id) => id.startsWith(ALERT_ID_PREFIX));
  if (ids.length) await notifee.cancelTriggerNotifications(ids);
  return ids.length;
}

// ---- Headless task: a button was pressed on the full-screen alert.

interface AlarmTaskData {
  action?: string;
  minutes?: number;
  id?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  data?: Record<string, string>;
}

export async function prayerAlarmActionTask(raw: AlarmTaskData): Promise<void> {
  try {
    if (raw.action !== "snooze") return;
    const asked = Number(raw.minutes);
    const minutes = Number.isFinite(asked) && asked > 0 ? Math.min(asked, SNOOZE_MAX_MINUTES) : 10;
    await ensureChannel();
    await schedule(
      `${ALERT_ID_PREFIX}snooze.${Date.now()}`,
      new Date(Date.now() + minutes * 60_000),
      { title: raw.title ?? "Prayer", subtitle: raw.subtitle ?? "", body: raw.body ?? "" },
      { fullScreen: true, alarmClock: false },
      raw.data ?? {},
    );
  } catch (e) {
    console.warn("[alerts] snooze failed", e);
  }
}
