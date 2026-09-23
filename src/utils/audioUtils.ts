import { Howl } from 'howler';

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
