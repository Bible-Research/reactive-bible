import { Howl } from 'howler';
import type { VerseTimestamp } from '../types';

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

/**
 * Tears down a Howl (and its blob: URL, when preloaded bytes were
 * fetched locally) without letting teardown events reach handlers.
 *
 * stop() runs first so 'stop' subscribers still fire — the
 * playlist's bounds checker clears its poll and <audio> listener
 * from that event. off() then detaches every listener, BEFORE
 * unload() clears the node's src: the pending play() rejection
 * unload() can cause reaches no handler (it propagates on a
 * microtask, after off() has run), so teardown never surfaces as
 * a playerror. volume(0) silences the node even if the pooled
 * <audio> element drains buffered audio after release —
 * mute(true) would set node.muted, which the pool never resets
 * and would silence the NEXT chapter's Howl. unload() alone can
 * let the underlying html5 <audio> element keep playing for a
 * few seconds until the next chapter finishes loading.
 */
export const disposeHowl = (
  howl: Howl | null,
  blobUrl: string | null = null,
): void => {
  if (howl) {
    try {
      howl.stop();
      howl.off();
      howl.volume(0);
      howl.unload();
    } catch (err) {
      console.warn('Failed to dispose audio:', err);
    }
  }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
};

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
