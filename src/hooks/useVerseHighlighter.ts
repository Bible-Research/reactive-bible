import { useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { useBibleStore } from '../store';
import { VerseTimestamp, VerseScope } from '../types';

/**
 * Polls audio playback position and sets the
 * audio-active verse based on timestamps.
 *
 * `scope` ties the highlight to a rendering context: 'bible' for
 * chapter playback, or a PlaylistItem.itemId (e.g. note id) so only
 * the playing card's verses light up.
 */
export const useVerseHighlighter = (
  audio: Howl | null,
  isPlaying: boolean,
  timestamps: VerseTimestamp[],
  bookId: string,
  chapter: number,
  scope: VerseScope,
) => {
  const setAudioActiveVerse = useBibleStore(
    (s) => s.setAudioActiveVerse
  );
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!audio || !isPlaying || timestamps.length === 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      const currentTime = audio.seek() as number;
      if (typeof currentTime !== 'number') return;

      // Binary search for the active verse
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

      setAudioActiveVerse({
        bookId,
        chapter,
        verse: activeVerseNum,
        scope,
      });
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [
    audio,
    isPlaying,
    timestamps,
    bookId,
    chapter,
    scope,
    setAudioActiveVerse,
  ]);

  // Clear on unmount
  useEffect(() => {
    return () => setAudioActiveVerse(null);
  }, [setAudioActiveVerse]);
};
