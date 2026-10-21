import type { Howl } from 'howler';
import type { VerseTimestamp } from '../types';
import { getHtml5AudioNode, getPlayPosition } from './audioUtils';

/** Advance this far ahead of the bound — never clip a verse. */
const EPSILON = 0.2;

export interface VerseBoundsOptions {
  /**
   * Timestamp of the first verse AFTER the item's range (its
   * playback boundary), or null when the recording has no later
   * row — then only verse-skipping can advance the item.
   */
  endTs: number | null;
  /**
   * Explicit verses to play (a verse-range playlist item);
   * undefined means the contiguous startVerse..endVerse range,
   * so only the endTs boundary applies.
   */
  verseNumbers: number[] | undefined;
  /**
   * The FULL chapter's timestamp rows — not the filtered
   * included-verse list. Detecting drift into a non-included
   * verse requires knowing every verse window.
   */
  timestamps: VerseTimestamp[];
  /**
   * Seek target when the Howl's `loop` flag is set: a looping
   * item replays its verses instead of advancing — the toggle
   * must not be a no-op for bounded items.
   */
  loopStartTs: number;
  /** Advance to the next playlist item (idempotent). */
  onAdvance: () => void;
  /** True once the playlist has been stopped/torn down. */
  isStopped: () => boolean;
}

/**
 * Wires a verse-range bounds checker onto `howl`: polls the
 * playback position every 100 ms and calls `onAdvance` once it
 * crosses `endTs - EPSILON`, and also listens to the html5
 * <audio> node's timeupdate — media events are still delivered
 * to a backgrounded/frozen page when JS timers are suspended.
 * With `verseNumbers` set, playback inside a non-included verse
 * seeks to the next included one, or advances when none remains
 * and `endTs` is set.
 *
 * Teardown runs on 'end' and 'stop' — disposeHowl emits 'stop'
 * first specifically so this cleanup (poll + node listener)
 * fires during unload. Callers gate on
 * `endTs !== null || verseNumbers` — with neither bound there
 * is nothing to check.
 */
export const attachVerseBounds = (
  howl: Howl,
  {
    endTs,
    verseNumbers,
    timestamps,
    loopStartTs,
    onAdvance,
    isStopped,
  }: VerseBoundsOptions,
): void => {
  // Returns true when the checker should stop (item advanced
  // or playback halted).
  const checkBounds = (): boolean => {
    if (!howl || isStopped()) return true;
    const pos = getPlayPosition(howl);
    if (pos === null) return false;
    if (endTs !== null && pos >= endTs - EPSILON) {
      // Looping replays the item's verses instead of
      // advancing — the toggle must not be a no-op for
      // bounded items.
      if (howl.loop()) {
        howl.seek(loopStartTs);
        return false;
      }
      onAdvance();
      return true;
    }
    if (verseNumbers) {
      const currentVerse = timestamps.find((t, i) => {
        const nextT = timestamps[i + 1];
        return (
          t.timestamp <= pos &&
          (!nextT || pos < nextT.timestamp)
        );
      });
      if (
        currentVerse &&
        !verseNumbers.includes(currentVerse.verse_start)
      ) {
        const nextIncludedVerse = timestamps.find(
          (t) =>
            t.timestamp > pos &&
            verseNumbers.includes(t.verse_start),
        );
        if (nextIncludedVerse) {
          howl.seek(nextIncludedVerse.timestamp);
        } else if (endTs !== null) {
          if (howl.loop()) {
            howl.seek(loopStartTs);
            return false;
          }
          onAdvance();
          return true;
        }
      }
    }
    return false;
  };

  // Advance on the <audio> element's timeupdate event as well
  // as the poll: media events are still delivered to a
  // backgrounded/frozen page when JS timers are suspended.
  let node: HTMLAudioElement | null = null;
  const attachNode = () => {
    if (node) return;
    node = getHtml5AudioNode(howl);
    node?.addEventListener('timeupdate', checkBounds);
  };
  attachNode();
  howl.on('play', attachNode);
  howl.on('load', attachNode);

  const poll = setInterval(() => {
    if (checkBounds() && poll) clearInterval(poll);
  }, 100);

  const cleanup = () => {
    clearInterval(poll);
    node?.removeEventListener('timeupdate', checkBounds);
    node = null;
  };
  howl.on('end', cleanup);
  howl.on('stop', cleanup);
};
