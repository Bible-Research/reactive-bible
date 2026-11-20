import { Howl } from 'howler';
import type { VerseTimestamp } from '../types';

// Fixed height of the bottom AudioPlayer bar in px — BottomNav's
// `bottom` offset and the page bottom padding must clear it.
export const AUDIO_PLAYER_HEIGHT = 152;

// Origins whose audio CDN answers cross-origin fetch() without
// Access-Control-Allow-Origin. A blocked fetch rejects AND logs
// a CORS error to the console that no try/catch can silence, so
// known hosts are skipped outright and any other host that
// rejects is remembered for the session — at most one console
// error per origin instead of one per chapter.
const KNOWN_CORSLESS_AUDIO_ORIGINS = [
  // api.esv.org redirects its audio to audio.esv.org, which
  // sends no CORS headers on either response (verified live).
  'https://audio.esv.org',
];
const corslessAudioOrigins = new Set<string>(
  KNOWN_CORSLESS_AUDIO_ORIGINS
);

/**
 * Test-only reset: drops session-learned origins back to the
 * known-host seed so prefetch tests start deterministic.
 */
export const resetAudioPrefetchForTests = (): void => {
  corslessAudioOrigins.clear();
  KNOWN_CORSLESS_AUDIO_ORIGINS.forEach((origin) =>
    corslessAudioOrigins.add(origin)
  );
};

/**
 * fetch() a chapter's mp3 bytes so the transition needs no
 * network at all — returns a blob: URL on success, or null when
 * the bytes can't be fetched cross-origin (no CORS, or a failed
 * response). The caller then hands the source URL straight to
 * the Howl: its html5 <audio> element streams it without CORS.
 *
 * A rejected fetch means this origin will never serve a CORS
 * read — Chrome logs that failure to the console even when the
 * promise is caught, so the origin is remembered and later
 * preloads go straight to element streaming instead of logging
 * once per chapter.
 */
export const prefetchAudioBlob = async (
  url: string,
): Promise<string | null> => {
  let origin: string | null = null;
  try {
    const parsed = new URL(url).origin;
    // 'null' is the opaque-origin literal (data:, about:) — not
    // a real host to remember.
    if (parsed !== 'null') origin = parsed;
  } catch {
    // Unparseable — still let fetch try (a same-origin relative
    // URL can't hit CORS anyway).
  }
  if (origin && corslessAudioOrigins.has(origin)) return null;
  try {
    const resp = await fetch(url);
    // A readable response — even a 404 — proves CORS is served
    // for this origin, so only rejections mark it.
    if (!resp.ok) return null;
    return URL.createObjectURL(await resp.blob());
  } catch {
    if (origin) corslessAudioOrigins.add(origin);
    return null;
  }
};

/**
 * Returns the Howl's current playback position in seconds, or null
 * when the position is not trustworthy. While a sound is still
 * loading, Howler's `seek()` returns the Howl instance itself (not
 * a number); a frozen/throttled page can also produce NaN or stale
 * values. Feeding those back into `seek()` corrupts the html5
 * <audio> element — the "stuck / broken noise" seen when pressing
 * headphone seek buttons on a locked Android screen.
 */
export const getPlayPosition = (audio: Howl | null): number | null => {
  if (!audio || audio.state() !== 'loaded') return null;
  const pos = audio.seek();
  return typeof pos === 'number' && Number.isFinite(pos) ? pos : null;
};

// The canonical teardown lives in howlUtils (shared by the
// chapter player and the playlist hook); re-exported here so
// existing `../utils/audioUtils` imports keep working.
export { disposeHowl } from './howlUtils';

interface HowlSoundInternals {
  _sounds?: { _node?: HTMLAudioElement }[];
}

/**
 * Returns the underlying html5 <audio> node of a Howl created with
 * `html5: true`, or null for WebAudio-backed or not-yet-loaded
 * Howls. Media events (timeupdate, ended) on this node are still
 * delivered to a backgrounded page when JS timers are frozen, which
 * makes them a reliable fallback for advancement logic.
 */
export const getHtml5AudioNode = (
  audio: Howl | null,
): HTMLAudioElement | null => {
  if (!audio) return null;
  const node = (audio as unknown as HowlSoundInternals)._sounds?.[0]
    ?._node;
  return node instanceof HTMLAudioElement ? node : null;
};

/**
 * The html5 <audio> node of a Howl whose Howler bookkeeping
 * still claims a playing sound while the node itself is
 * paused — the OS suspended playback behind Howler's back
 * (Android audio-focus loss in a car, a Bluetooth handover).
 * Returns null when there is no desync. `howl.play()` is the
 * wrong recovery: it never resumes a sound, it stacks a new
 * one — while replaying this node resumes at the position
 * the OS paused.
 */
export const osPausedNode = (
  audio: Howl | null,
): HTMLAudioElement | null => {
  if (!audio || !audio.playing()) return null;
  const node = getHtml5AudioNode(audio);
  return node && node.paused ? node : null;
};

/**
 * True when a play for `audio` is already pending or audible —
 * another play() would stack a second sound instance instead
 * of resuming. Real Howler's play() on a still-'loading' Howl
 * only queues the play: playing() stays false for the whole
 * load window and the queue can still be undrained when the
 * 'load' handlers run, so playing() alone cannot cover it.
 * `requested` is the caller's marker for the Howl it already
 * issued play() on (Howler's internal queue is not
 * introspectable); clear it on pause/stop/'end'/error/dispose.
 */
export const playAlreadyRequested = (
  audio: Howl,
  requested: Howl | null,
): boolean => requested === audio || audio.playing();

/**
 * Binary search: the `verse_start` of the last timestamp row at
 * or before `currentTime` — i.e. the verse being read aloud.
 * A position before the first row (e.g. a chapter announcement)
 * still yields that first verse. Returns null for an empty
 * timestamp list.
 */
export const activeVerseAtTime = (
  timestamps: VerseTimestamp[],
  currentTime: number,
): number | null => {
  if (timestamps.length === 0) return null;
  let lo = 0;
  let hi = timestamps.length - 1;
  let activeVerseNum = timestamps[0].verse_start;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (timestamps[mid].timestamp <= currentTime) {
      activeVerseNum = timestamps[mid].verse_start;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return activeVerseNum;
};
