import { useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { useBibleStore } from '../store';
import { VerseTimestamp } from '../types';

/**
 * Polls audio playback position and sets the
 * audio-active verse based on timestamps.
 *
 * Designed to work for both chapter-play and
 * future note-play modes.
 */
export const useVerseHighlighter = (
  audio: Howl | null,
  isPlaying: boolean,
  timestamps: VerseTimestamp[]
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
      let activeVerse = timestamps[0].verse_start;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (timestamps[mid].timestamp <= currentTime) {
          activeVerse = timestamps[mid].verse_start;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      setAudioActiveVerse(activeVerse);
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [audio, isPlaying, timestamps, setAudioActiveVerse]);

  // Clear on unmount
  useEffect(() => {
    return () => setAudioActiveVerse(null);
  }, [setAudioActiveVerse]);
};
