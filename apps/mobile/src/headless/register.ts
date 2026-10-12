import { AppRegistry } from "react-native";
import notifee from "react-native-notify-kit";
import { prayerAlarmActionTask } from "../platform/alerts";

// Run by the vendored Kotlin PrayerAlarmHeadlessService when a button on the full-screen alert is pressed.
AppRegistry.registerHeadlessTask("PrayerAlarmAction", () => prayerAlarmActionTask);

// notify-kit asks for a background handler to exist. Presses are handled by the native activity,
// so there is nothing to do here yet.
notifee.onBackgroundEvent(async () => {});
