// Custom entry (replaces the plain expo-router entry) so that headless JS tasks and notification
// background handlers are registered BEFORE the app UI mounts. Android may start the app process
// just to run these when a full-screen alert button is pressed.
import "./src/headless/register";
import "expo-router/entry";
