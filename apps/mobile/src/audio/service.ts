import TrackPlayer, { Event } from "react-native-track-player";
import { audio } from "./runtime";

/**
 * Headless playback service, registered in index.js: lock-screen, notification and headset controls.
 * The arrows move by SURAH, like the app's own big ones: an ayah is a few seconds long.
 */
export async function PlaybackService(): Promise<void> {
  const c = audio.controller;
  TrackPlayer.addEventListener(Event.RemotePlay, () => void c.resume());
  TrackPlayer.addEventListener(Event.RemotePause, () => void c.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => void c.nextSurah().catch(() => undefined));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => void c.previousSurah().catch(() => undefined));
  TrackPlayer.addEventListener(Event.RemoteStop, () => void c.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => void c.seekTo(e.position));
  // autoHandleInterruptions covers most cases; this is the fallback.
  TrackPlayer.addEventListener(Event.RemoteDuck, (e) => {
    if (e.paused) void c.pause();
  });
}
