// Custom entry (replaces the plain expo-router entry) so that headless JS tasks and notification
// background handlers are registered BEFORE the app UI mounts. Android may start the app process
// just to run these when a full-screen alert button is pressed.
import TrackPlayer from "react-native-track-player";
import "./src/headless/register";
import "expo-router/entry";
// Lock-screen / notification / headset controls for recitation. Registered before the UI so that a media button
// pressed while the app is in the background reaches the player.
// registerPlaybackService wants a factory that returns the handler synchronously, so this has to be a lazy require()
// (an import() would hand back a promise). Metro resolves it at build time.
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
TrackPlayer.registerPlaybackService(() => require("./src/audio/service").PlaybackService);
