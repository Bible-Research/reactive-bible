import { useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { useBibleStore } from '../store';
import { VerseTimestamp, VerseScope } from '../types';
import {
  activeVerseAtTime,
  getPlayPosition,
} from '../utils/audioUtils';

/**
 * Polls audio playback position and sets the
 * audio-active verse based on timestamps.
 *
 * `scope` ties the highlight to a rendering context: 'bible' for
 * chapter playback, or a PlaylistItem.scope (e.g. note id) so only
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
      const currentTime = getPlayPosition(audio);
      if (currentTime === null) return;
      const activeVerseNum = activeVerseAtTime(
        timestamps,
        currentTime,
      );
      if (activeVerseNum === null) return;

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
