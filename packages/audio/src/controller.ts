import { applyRepeats, buildTracks, canSwapAt, listenWindow, LISTEN_REFILL_AT, LISTEN_WINDOW, parseTrackId, pauseBetweenRepeatsMs, prefetchTargets } from "./queue.ts";
import { ayahCountOf, expandRange, sameRef } from "./refs.ts";
import type { AyahRef, PlayerTrack, Reciter } from "./types.ts";

/** What the controller needs from a player library. The mobile adapter maps this onto react-native-track-player. */
export interface PlayerPort {
  setup(): Promise<void>;
  reset(): Promise<void>;
  add(tracks: PlayerTrack[], insertBefore?: number): Promise<void>;
  remove(indexes: number[]): Promise<void>;
  getQueue(): Promise<PlayerTrack[]>;
  getTrack(index: number): Promise<PlayerTrack | undefined>;
  getActiveIndex(): Promise<number | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  setRate(rate: number): Promise<void>;
}

export interface PlaybackPolicy {
  /** When false, nothing is ever fetched for playback: only audio already on the device plays. */
  allowStreaming: boolean;
  rate: number;
  repeatEachAyah: number;
  repeatRange: number;
  /** Pause after each finished ayah as a multiple of its length (0 = off). The hifz "recite it back" drill. */
  pauseFactor: number;
}

export interface PlaybackStatus {
  /** Ayah currently loaded (playing or paused); null when idle. */
  active: AyahRef | null;
  playing: boolean;
  /** Buffering or loading, for spinners. */
  loading: boolean;
  reciterId: string | null;
  /**
   * Playback stopped at this ayah because its audio is neither on the device nor reachable. Only the app can tell
   * "the network is down" from "there is a gap in the download", and the second one the user can fix.
   */
  gap: AyahRef | null;
  /** A start was refused: this ayah is not downloaded and streaming is off. */
  blocked: AyahRef | null;
}

export interface ControllerDeps {
  player: PlayerPort;
  getReciter: () => Reciter | null;
  getPolicy: () => PlaybackPolicy;
  /** The device URI of an ayah's audio, or null when it is not downloaded. */
  localUri: (reciter: Reciter, ref: AyahRef) => Promise<string | null>;
  /** Warm one ayah onto the device; resolves its URI or null. Only called for entries that are streaming URLs. */
  prefetch: (reciter: Reciter, ref: AyahRef) => Promise<string | null>;
  label: (ref: AyahRef) => { title: string; album?: string };
  /** A continuous listen reached this ayah (for the listening place). */
  onListened?: (ref: AyahRef, reciterId: string) => void;
  onPausedChange?: (paused: boolean) => void;
  /** Test seam for the repeat pause timer. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

export type StartResult = { started: true } | { started: false; reason: "no-reciter" | "invalid" | "blocked" | "superseded"; blockedAt?: AyahRef };

export type PlayerState = "playing" | "paused" | "loading" | "stopped";

export interface PlaybackController {
  getStatus(): PlaybackStatus;
  subscribe(listener: () => void): () => void;
  isListening(): boolean;
  playRange(from: AyahRef, to: AyahRef, opts?: { useRepeats?: boolean }): Promise<StartResult>;
  /** From an ayah to the end of its surah ("play from here"). */
  playFromAyah(ref: AyahRef): Promise<StartResult>;
  /** From here to the end of the book, surah after surah. Memorisation repeats are not applied. */
  listenFrom(ref: AyahRef): Promise<StartResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  skipToNextAyah(): Promise<void>;
  skipToPreviousAyah(): Promise<void>;
  /** The lock-screen arrows move by SURAH: an ayah is seconds long, and nobody wants 286 presses to leave al-Baqarah. */
  nextSurah(): Promise<StartResult | void>;
  /** Restarts the current surah unless already at its first ayah; only then steps back. */
  previousSurah(): Promise<StartResult>;
  setRate(rate: number): Promise<void>;
  // Events, called by the platform adapter:
  handleActiveTrackChanged(trackId: string | null, previous?: { positionSec: number; durationSec: number }): void;
  handlePlayerState(state: PlayerState): void;
  handleQueueEnded(): void;
  handlePlaybackError(): void;
}

const IDLE: PlaybackStatus = { active: null, playing: false, loading: false, reciterId: null, gap: null, blocked: null };

export function createPlaybackController(deps: ControllerDeps): PlaybackController {
  const { player } = deps;
  let status: PlaybackStatus = IDLE;
  const listeners = new Set<() => void>();
  let setupPromise: Promise<void> | null = null;
  /** Bumped by every command that replaces the queue; continuations check it so a stale one drops its work. */
  let epoch = 0;
  let listening = false;
  /** The first ayah NOT yet queued while listening, or null at the end of the book. */
  let listenCursor: AyahRef | null = null;
  /** Monotonic, so an appended track can never reuse an id. */
  let listenIndex = 0;
  /** An ayah the queue stops in front of because streaming is off; becomes `gap` when the queue ends. */
  let pendingGap: AyahRef | null = null;
  const inFlight = new Set<string>();
  /** A top-up is being built. Two quick track changes both see a low queue; only the first may extend it. */
  let extending = false;
  let pauseTimer: unknown = null;
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelSchedule = deps.cancelSchedule ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const setStatus = (next: Partial<PlaybackStatus>): void => {
    status = { ...status, ...next };
    for (const l of [...listeners]) l();
  };
  const clearPauseTimer = (): void => {
    if (pauseTimer !== null) {
      cancelSchedule(pauseTimer);
      pauseTimer = null;
    }
  };
  const ensureSetup = (): Promise<void> => (setupPromise ??= player.setup().catch((e) => {
    setupPromise = null; // allow a retry after a failed setup
    throw e;
  }));
  const endListening = (): void => {
    listening = false;
    listenCursor = null;
    listenIndex = 0;
  };

  async function localMap(reciter: Reciter, refs: readonly AyahRef[]): Promise<Map<string, string | null>> {
    const unique = new Map<string, AyahRef>();
    for (const r of refs) unique.set(`${r.surahId}:${r.ayahNumber}`, r);
    const entries = await Promise.all([...unique].map(async ([k, r]) => [k, await deps.localUri(reciter, r).catch(() => null)] as const));
    return new Map(entries);
  }

  async function build(reciter: Reciter, refs: readonly AyahRef[], indexOffset: number) {
    const local = await localMap(reciter, refs);
    return buildTracks({
      refs,
      reciter,
      localUri: (r) => local.get(`${r.surahId}:${r.ayahNumber}`) ?? null,
      allowStreaming: deps.getPolicy().allowStreaming,
      label: deps.label,
      indexOffset,
    });
  }

  async function start(refs: AyahRef[], opts: { listen: boolean; cursor: AyahRef | null }): Promise<StartResult> {
    const mine = ++epoch;
    clearPauseTimer();
    const reciter = deps.getReciter();
    if (!reciter) return { started: false, reason: "no-reciter" };
    if (refs.length === 0) return { started: false, reason: "invalid" };
    await ensureSetup();
    if (mine !== epoch) return { started: false, reason: "superseded" };
    setStatus({ reciterId: reciter.id, loading: true, gap: null, blocked: null });
    const built = await build(reciter, refs, 0);
    if (mine !== epoch) return { started: false, reason: "superseded" };
    if (built.tracks.length === 0) {
      setStatus({ loading: false, blocked: built.blockedAt });
      return { started: false, reason: "blocked", blockedAt: built.blockedAt ?? undefined };
    }
    const policy = deps.getPolicy();
    endListening();
    pendingGap = built.blockedAt;
    await player.reset();
    await player.add(built.tracks);
    await player.setRate(policy.rate);
    await player.play();
    if (mine !== epoch) return { started: false, reason: "superseded" };
    // Armed only once the queue is really in the player: a top-up that ran against the OLD queue would extend
    // something we have just reset.
    if (opts.listen) {
      listening = true;
      listenCursor = built.blockedAt ? null : opts.cursor;
      listenIndex = built.tracks.length;
      deps.onListened?.(refs[0] as AyahRef, reciter.id);
    }
    setStatus({ active: refs[0] as AyahRef, playing: true, loading: false });
    return { started: true };
  }

  async function snapshot(): Promise<{ queue: PlayerTrack[]; idx: number } | null> {
    try {
      const [queue, idx] = await Promise.all([player.getQueue(), player.getActiveIndex()]);
      return idx === null ? null : { queue, idx };
    } catch {
      return null;
    }
  }

  function prefetchUpcoming(snap: { queue: PlayerTrack[]; idx: number }): void {
    const reciter = deps.getReciter();
    if (!reciter) return;
    for (const t of prefetchTargets(snap.queue, snap.idx)) {
      const key = `${reciter.id}:${t.ref.surahId}:${t.ref.ayahNumber}`;
      if (inFlight.has(key)) continue;
      inFlight.add(key);
      const mine = epoch;
      void deps
        .prefetch(reciter, t.ref)
        .then(async (uri) => {
          if (!uri || mine !== epoch) return;
          const [active, track] = await Promise.all([player.getActiveIndex(), player.getTrack(t.index)]);
          if (!track || track.id !== t.id || !track.url.startsWith("https://") || !canSwapAt(t.index, active)) return;
          await player.remove([t.index]);
          await player.add([{ ...track, url: uri }], t.index);
        })
        .catch(() => undefined)
        .finally(() => void inFlight.delete(key));
    }
  }

  async function extendListening(snap: { queue: PlayerTrack[]; idx: number }): Promise<void> {
    if (!listening || !listenCursor || extending) return;
    if (snap.queue.length - (snap.idx + 1) >= LISTEN_REFILL_AT) return;
    const reciter = deps.getReciter();
    if (!reciter) return;
    const mine = epoch;
    const { refs, cursor } = listenWindow(listenCursor, LISTEN_WINDOW);
    // Claim the cursor BEFORE the await: two quick track changes would otherwise queue the same window twice.
    listenCursor = cursor;
    extending = true;
    try {
      const built = await build(reciter, refs, listenIndex);
      if (mine !== epoch || !listening) return;
      listenIndex += refs.length;
      if (built.blockedAt) {
        pendingGap = built.blockedAt;
        listenCursor = null;
      }
      if (built.tracks.length > 0) await player.add(built.tracks);
    } catch {
      // A failed top-up leaves what is queued playing; the next track change tries again.
      if (mine === epoch && listening && listenCursor === cursor) listenCursor = refs[0] ?? cursor;
    } finally {
      extending = false;
    }
  }

  const surahOfActive = (): number => status.active?.surahId ?? 0;

  const controller: PlaybackController = {
    getStatus: () => status,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    isListening: () => listening,

    playFromAyah(ref) {
      const count = ayahCountOf(ref.surahId);
      return controller.playRange(ref, { surahId: ref.surahId, ayahNumber: count }, { useRepeats: false });
    },
    async playRange(from, to, opts = {}) {
      const policy = deps.getPolicy();
      let refs = expandRange(from, to);
      if (opts.useRepeats !== false) refs = applyRepeats(refs, policy.repeatEachAyah, policy.repeatRange);
      return start(refs, { listen: false, cursor: null });
    },
    async listenFrom(ref) {
      if (ayahCountOf(ref.surahId) === 0) return { started: false, reason: "invalid" };
      const clamped = { surahId: ref.surahId, ayahNumber: Math.max(1, Math.min(ayahCountOf(ref.surahId), ref.ayahNumber)) };
      const { refs, cursor } = listenWindow(clamped, LISTEN_WINDOW);
      return start(refs, { listen: true, cursor });
    },

    async pause() {
      clearPauseTimer();
      await ensureSetup();
      await player.pause();
    },
    async resume() {
      clearPauseTimer();
      await ensureSetup();
      await player.play();
    },
    async stop() {
      epoch += 1;
      clearPauseTimer();
      endListening();
      pendingGap = null;
      // Dismisses a "not downloaded" notice too, even when nothing ever played.
      setStatus({ blocked: null, gap: null });
      if (!setupPromise) return; // never started: nothing to stop
      await player.reset();
      setStatus({ active: null, playing: false, loading: false });
    },
    async seekTo(seconds) {
      await ensureSetup();
      await player.seekTo(Math.max(0, seconds));
    },
    async skipToNextAyah() {
      clearPauseTimer();
      await ensureSetup();
      await player.skipToNext().catch(() => undefined); // end of queue
    },
    async skipToPreviousAyah() {
      clearPauseTimer();
      await ensureSetup();
      await player.skipToPrevious().catch(() => undefined);
    },
    async nextSurah() {
      const current = surahOfActive();
      if (current >= 114) return;
      return controller.listenFrom({ surahId: Math.max(1, current + 1), ayahNumber: 1 });
    },
    async previousSurah() {
      const current = status.active?.surahId ?? 1;
      const ayah = status.active?.ayahNumber ?? 1;
      return controller.listenFrom({ surahId: ayah > 1 ? current : Math.max(1, current - 1), ayahNumber: 1 });
    },
    async setRate(rate) {
      await ensureSetup();
      await player.setRate(rate);
    },

    handleActiveTrackChanged(id, previous) {
      clearPauseTimer();
      const ref = id ? parseTrackId(id) : null;
      setStatus({ active: ref });
      if (ref && listening) {
        const reciter = deps.getReciter();
        if (reciter) deps.onListened?.(ref, reciter.id);
      }
      const factor = deps.getPolicy().pauseFactor;
      const pauseMs = previous ? pauseBetweenRepeatsMs({ lastDurationSec: previous.durationSec, lastPositionSec: previous.positionSec, factor }) : null;
      if (ref && pauseMs !== null) {
        void player.pause().then(() => {
          pauseTimer = schedule(() => {
            pauseTimer = null;
            void player.play();
          }, pauseMs);
        });
      }
      // One look at the queue per ayah, shared by both jobs below.
      void snapshot().then((snap) => {
        if (!snap) return;
        prefetchUpcoming(snap);
        void extendListening(snap);
      });
    },
    handlePlayerState(state) {
      if (listening && (state === "paused" || state === "playing")) deps.onPausedChange?.(state === "paused");
      setStatus({ playing: state === "playing", loading: state === "loading" });
      if (state === "stopped") setStatus({ active: null, playing: false, loading: false });
    },
    handleQueueEnded() {
      const gap = pendingGap;
      pendingGap = null;
      endListening();
      setStatus({ active: null, playing: false, loading: false, gap });
    },
    handlePlaybackError() {
      const ref = status.active;
      const reciter = deps.getReciter();
      if (!ref || !reciter) return;
      void deps
        .localUri(reciter, ref)
        .then((local) => {
          // On disk and the player still failed: a broken file or a busy device. Not on disk: a gap in the download.
          if (!local && !sameRef(status.gap, ref)) setStatus({ gap: ref, playing: false, loading: false });
        })
        .catch(() => undefined);
    },
  };
  return controller;
}
