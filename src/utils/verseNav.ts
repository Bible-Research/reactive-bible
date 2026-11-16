// src/utils/verseNav.ts
//
// Pure decision logic for chapter-mode previous/next media
// controls: which timestamp to seek to (or when to cross a
// chapter boundary) for one `previoustrack`/`nexttrack` press.

import type { VerseTimestamp } from '../types';

/**
 * One applied navigation step. Kept in a ref by the caller so a
 * repeat press in the same direction can chain off the last
 * TARGET rather than the live playback position — html5 seeks
 * are applied asynchronously (Howler pause/play cycle +
 * `_playLock` queuing), so reading the position back while taps
 * arrive makes follow-up presses compute from a stale position
 * and either restart the verse or land somewhere arbitrary.
 */
export interface VerseNavState {
  direction: 1 | -1;
  /** Position the press was computed from, in seconds. */
  before: number;
  /** The position we just seeked to, in seconds. */
  target: number;
  /** Epoch ms when the press was handled. */
  at: number;
}

export type VerseNavResult =
  | { kind: 'seek'; time: number }
  | { kind: 'chapter'; direction: 1 | -1 };

/** Same-direction presses within this window chain a verse step
 * off the last target instead of restarting the current verse. */
export const NAV_CHAIN_WINDOW_MS = 4000;

/** An isolated back-press this deep into a verse restarts it —
 * the standard media-player convention, kept for verse units. */
export const RESTART_VERSE_AFTER_S = 2;

/** Forward epsilon: a press right on a verse boundary lands on
 * the following verse, not the one just entered. */
export const NEXT_EPSILON_S = 0.5;

/** Relative seek used when the recording has no verse
 * timestamps at all (e.g. ENGKJV). */
export const SEEK_FALLBACK_S = 10;

const verseIndexAt = (
  timestamps: VerseTimestamp[],
  pos: number,
): number =>
  timestamps.reduce(
    (acc, t, i) => (t.timestamp <= pos ? i : acc),
    -1,
  );

/**
 * Whether `pos` can still plausibly belong to `lastNav`'s jump:
 * between the position the press started from and the target,
 * plus playback drift since. A position outside that corridor
 * means an outside seek (player slider, browser restore)
 * intervened — chaining would step off a target the audio no
 * longer stands near.
 */
const chainStillValid = (
  pos: number,
  lastNav: VerseNavState,
  now: number,
): boolean => {
  if (now - lastNav.at > NAV_CHAIN_WINDOW_MS) {
    return false;
  }
  const elapsed = (now - lastNav.at) / 1000;
  const lo = Math.min(lastNav.before, lastNav.target) - 1;
  const hi = Math.max(lastNav.before, lastNav.target) + elapsed + 2;
  return pos >= lo && pos <= hi;
};

/**
 * Where one prev/next press should land.
 *
 * `lastNav` chains repeat presses: a same-direction press inside
 * NAV_CHAIN_WINDOW_MS steps from the last target position instead
 * of `pos`, so rapid multi-taps walk verses deterministically no
 * matter how far the just-issued seek has applied. Chained back-
 * presses never "restart the verse" — a repeat tap means "keep
 * going back", and the restart convention would trap the user in
 * the verse they just landed on (the previous behavior that made
 * headphone/car double-taps feel random).
 */
export const verseNavTarget = (
  timestamps: VerseTimestamp[],
  pos: number,
  direction: 1 | -1,
  lastNav: VerseNavState | null,
  now: number,
): VerseNavResult => {
  const chained =
    lastNav !== null &&
    lastNav.direction === direction &&
    chainStillValid(pos, lastNav, now);
  const base = chained ? lastNav.target : pos;

  if (timestamps.length === 0) {
    return {
      kind: 'seek',
      time: Math.max(0, base + direction * SEEK_FALLBACK_S),
    };
  }

  if (direction === 1) {
    const next = timestamps.find(
      (t) => t.timestamp > base + NEXT_EPSILON_S,
    );
    return next
      ? { kind: 'seek', time: next.timestamp }
      : { kind: 'chapter', direction: 1 };
  }

  const idx = verseIndexAt(timestamps, base);
  if (
    !chained &&
    idx >= 0 &&
    base - timestamps[idx].timestamp > RESTART_VERSE_AFTER_S
  ) {
    return { kind: 'seek', time: timestamps[idx].timestamp };
  }
  if (idx > 0) {
    return { kind: 'seek', time: timestamps[idx - 1].timestamp };
  }
  // At (or before) the first timestamped unit — previous chapter.
  return { kind: 'chapter', direction: -1 };
};
