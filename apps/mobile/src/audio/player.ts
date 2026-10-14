import { Image } from "react-native";
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, State } from "react-native-track-player";
import type { Track } from "react-native-track-player";
import type { PlaybackController, PlayerPort, PlayerState, PlayerTrack } from "@tarteel/audio";

// The mark is shown as artwork on the lock screen and in the notification: there is no cover art for a recitation.
// react-native-track-player types `artwork` as a string, so the bundled image is handed over as its resolved uri.
/* eslint-disable @typescript-eslint/no-require-imports */
const ARTWORK_SOURCE = require("../../assets/brand/icon.png") as number;
/* eslint-enable @typescript-eslint/no-require-imports */
let artworkUri: string | undefined;
const artwork = (): string => {
  if (artworkUri === undefined) artworkUri = Image.resolveAssetSource(ARTWORK_SOURCE).uri;
  return artworkUri;
};

const toTrack = (t: PlayerTrack): Track => ({ id: t.id, url: t.url, title: t.title, artist: t.artist, album: t.album, artwork: artwork() });
const fromTrack = (t: Track): PlayerTrack => ({ id: String(t.id), url: String(t.url), title: t.title ?? "", artist: t.artist ?? "", album: t.album });

/** Maps `PlayerPort` onto react-native-track-player. The player is set up lazily on first play, never at app start. */
export function createTrackPlayerPort(): PlayerPort {
  return {
    async setup() {
      try {
        // A phone call or an assistant pauses the recitation and, when the interruption says so, resumes it.
        await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      } catch (e) {
        // "already initialized" is benign on a fast reload.
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.toLowerCase().includes("already")) throw e;
      }
      await TrackPlayer.updateOptions({
        // Swiping the app away does not stop the recitation: the notification's controls are what a listener reaches for.
        android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
        capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
        progressUpdateEventInterval: 1,
      });
    },
    reset: () => TrackPlayer.reset(),
    add: async (tracks, insertBefore) => {
      await TrackPlayer.add(tracks.map(toTrack), insertBefore);
    },
    remove: async (indexes) => {
      await TrackPlayer.remove(indexes);
    },
    getQueue: async () => (await TrackPlayer.getQueue()).map(fromTrack),
    getTrack: async (index) => {
      const t = await TrackPlayer.getTrack(index);
      return t ? fromTrack(t) : undefined;
    },
    getActiveIndex: async () => (await TrackPlayer.getActiveTrackIndex()) ?? null,
    play: () => TrackPlayer.play(),
    pause: () => TrackPlayer.pause(),
    seekTo: (s) => TrackPlayer.seekTo(s),
    skipToNext: () => TrackPlayer.skipToNext(),
    skipToPrevious: () => TrackPlayer.skipToPrevious(),
    setRate: (r) => TrackPlayer.setRate(r),
  };
}

function mapState(state: State): PlayerState {
  switch (state) {
    case State.Playing:
      return "playing";
    case State.Loading:
    case State.Buffering:
      return "loading";
    case State.Stopped:
    case State.None:
    case State.Error:
      return "stopped";
    default:
      return "paused"; // Ready, Paused, Ended
  }
}

/** Forwards the player's events to the controller. Called once, after the player is set up. */
export function wirePlayerEvents(controller: PlaybackController): void {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (e) => {
    const previous = e.lastTrack ? { positionSec: e.lastPosition ?? 0, durationSec: e.lastTrack.duration ?? 0 } : undefined;
    controller.handleActiveTrackChanged(e.track ? String(e.track.id) : null, previous);
  });
  TrackPlayer.addEventListener(Event.PlaybackState, (e) => controller.handlePlayerState(mapState(e.state)));
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => controller.handleQueueEnded());
  TrackPlayer.addEventListener(Event.PlaybackError, () => controller.handlePlaybackError());
}
