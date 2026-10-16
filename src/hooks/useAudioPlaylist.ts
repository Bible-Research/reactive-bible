import { useState, useRef, useCallback, useEffect } from 'react';
import { Howl } from 'howler';
import { showNotification } from '@mantine/notifications';
import { useBibleStore } from '../store';
import {
  getKjvAudioUrl,
  getBibleAudioUrl,
  getAudioTimestamps,
  BookNotInFilesetError,
} from '../api';
import { PlaylistItem, VerseTimestamp } from '../types';
import {
  resolveTimestampsFilesetId,
  toBookName,
  adjustTimestampsForENGESV,
} from '../utils/bibleUtils';
import {
  findTranslationByFilesetId,
  resolveTextFileset,
} from '../utils/filesetGroups';
import { orderedAudioCandidates } from '../utils/audioCandidates';
import { useVerseHighlighter } from './useVerseHighlighter';
import {
  disposeHowl,
  getHtml5AudioNode,
  getPlayPosition,
} from '../utils/audioUtils';

export interface UseAudioPlaylistReturn {
  isActive: boolean;
  isPlaying: boolean;
  currentIndex: number;
  currentItem: PlaylistItem | null;
  audio: Howl | null;
  timestamps: VerseTimestamp[];
  start: (items: PlaylistItem[], startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  stop: () => void;
}

export const useAudioPlaylist = (): UseAudioPlaylistReturn => {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<Howl | null>(null);
  const [timestamps, setTimestamps] = useState<VerseTimestamp[]>([]);

  const audioRef = useRef<Howl | null>(null);
  const stoppedRef = useRef(false);
  // Guards the "no verse timestamps" notification so a playlist
  // of timestampless recordings warns once, not per item.
  const timestampsNoticeShownRef = useRef(false);

  const activeAudioFilesetId = useBibleStore(
    (s) => s.activeAudioFilesetId
  );
  const activeTextFilesetId = useBibleStore(
    (s) => s.activeTextFilesetId
  );
  const translations = useBibleStore((s) => s.translations);
  const setAudioActiveVerse = useBibleStore(
    (s) => s.setAudioActiveVerse
  );
  const setShowPlayer = useBibleStore((s) => s.setShowAudioPlayer);

  const isActive = items.length > 0 && currentIndex >= 0;
  const currentItem = isActive ? (items[currentIndex] ?? null) : null;

  useVerseHighlighter(
    audio,
    isPlaying,
    timestamps,
    currentItem?.bookId ?? '',
    currentItem?.chapter ?? 0,
    currentItem?.itemId ?? '',
  );

  const unloadCurrent = useCallback(() => {
    if (audioRef.current) {
      // disposeHowl emits 'stop' first so the bounds-checker
      // cleanup still runs, then detaches listeners before
      // unload() — a pending play() rejection can't surface as
      // a playerror retry during teardown.
      disposeHowl(audioRef.current);
      audioRef.current = null;
    }
    setAudio(null);
    setTimestamps([]);
    setAudioActiveVerse(null);
  }, [setAudioActiveVerse]);

  const playIndex = useCallback(
    async (allItems: PlaylistItem[], index: number) => {
      if (stoppedRef.current) return;
      if (index >= allItems.length) {
        unloadCurrent();
        setIsPlaying(false);
        setCurrentIndex(-1);
        setShowPlayer(false);
        return;
      }

      const item = allItems[index];

      // Guards against double-advance: Howler emits 'end' when a
      // playing sound is unloaded, so advancing from the bounds
      // checker and then unloading would otherwise skip an item.
      let advanced = false;
      const advanceNext = () => {
        if (advanced || stoppedRef.current) return;
        advanced = true;
        void playIndex(allItems, index + 1);
      };

      if (!item.bookId || item.startVerse == null) {
        advanceNext();
        return;
      }

      const itemBookName = toBookName(item.bookId) ?? item.bookId;
      // Ordered candidates: timestamp-backed sibling recording,
      // then resolved primary, codec sibling, other-testament
      // member, and the translation's remaining audio options —
      // see orderedAudioCandidates.
      const candidates = orderedAudioCandidates(
        activeAudioFilesetId,
        item.bookId,
        translations,
      );
      const translationName =
        findTranslationByFilesetId(
          activeAudioFilesetId,
          translations,
        )?.name ?? 'the selected audio version';

      unloadCurrent();
      setCurrentIndex(index);

      const prefetchNext = (i: number) => {
        const next = allItems[i + 1];
        if (!next || !activeAudioFilesetId) return;
        // Same timestamp-backed substitution as the playing
        // item so the prefetched URL/timestamps match what will
        // actually be loaded.
        const nextFilesetId =
          orderedAudioCandidates(
            activeAudioFilesetId,
            next.bookId,
            translations,
          )[0] ?? activeAudioFilesetId;
        if (nextFilesetId !== 'ENGKJV') {
          getBibleAudioUrl(
            next.bookId,
            next.chapter,
            nextFilesetId,
          ).catch(() => { /* prefetch - ignore errors */ });
        }
        const tsId = resolveTimestampsFilesetId(
          nextFilesetId,
          resolveTextFileset(
            activeTextFilesetId,
            next.bookId,
            translations,
          ),
          next.bookId,
        );
        if (tsId) {
          getAudioTimestamps(next.bookId, next.chapter, tsId)
            .catch(() => { /* prefetch - ignore errors */ });
        }
      };

      if (candidates.length === 0) {
        showNotification({
          title: 'No audio fileset selected',
          message: 'Select an audio translation to use playlist.',
          color: 'orange',
          autoClose: 5000,
        });
        return;
      }

      try {
        // Fetches and plays candidates[startAt]; on a coverage
        // miss (BookNotInFilesetError) or a Howler decode/play
        // failure the next alternate is tried — the mp3 codec
        // sibling always comes first.
        const loadFromIndex = async (
          startAt: number,
        ): Promise<void> => {
          for (let i = startAt; i < candidates.length; i++) {
            const candidateId = candidates[i];
            try {
              const audioUrl =
                candidateId === 'ENGKJV'
                  ? getKjvAudioUrl(item.bookId, item.chapter)
                  : await getBibleAudioUrl(
                      item.bookId,
                      item.chapter,
                      candidateId,
                    );

              if (stoppedRef.current) return;

              let fetchedTimestamps: VerseTimestamp[] = [];
              if (candidateId !== 'ENGKJV') {
                const tsId = resolveTimestampsFilesetId(
                  candidateId,
                  resolveTextFileset(
                    activeTextFilesetId,
                    item.bookId,
                    translations,
                  ),
                  item.bookId,
                );
                if (tsId) {
                  const rawTimestamps =
                    await getAudioTimestamps(
                      item.bookId,
                      item.chapter,
                      tsId,
                    );
                  fetchedTimestamps = adjustTimestampsForENGESV(
                    rawTimestamps,
                    candidateId,
                  );
                }
              }

              if (stoppedRef.current) return;

              // Graceful degradation for recordings with no
              // verse timestamps at all (ENGKJV wordpocket
              // audio, generated TTS, DBT coverage gaps):
              // startTs/endTs below fall back to 0/null so the
              // whole chapter plays. Warn once per playlist
              // rather than silently playing from verse 1.
              if (
                fetchedTimestamps.length === 0 &&
                !timestampsNoticeShownRef.current
              ) {
                timestampsNoticeShownRef.current = true;
                showNotification({
                  title: 'No verse timestamps',
                  message:
                    "Verse-level playback isn't available " +
                    'for this recording — whole chapters ' +
                    'will play.',
                  color: 'orange',
                  autoClose: 8000,
                });
              }

              const verseNumbers = item.verseNumbers;
              const filteredTimestamps = verseNumbers
                ? fetchedTimestamps.filter((t) =>
                    verseNumbers.includes(t.verse_start),
                  )
                : fetchedTimestamps.filter(
                    (t) =>
                      t.verse_start >= item.startVerse &&
                      t.verse_start <= item.endVerse,
                  );

              setTimestamps(filteredTimestamps);

              const startTs =
                fetchedTimestamps.find(
                  (t) => t.verse_start === item.startVerse,
                )?.timestamp ?? 0;

              const endTs = (() => {
                const lastVerse = item.verseNumbers
                  ? Math.max(...item.verseNumbers)
                  : item.endVerse;
                const afterEnd = fetchedTimestamps.find(
                  (t) => t.verse_start > lastVerse,
                );
                return afterEnd ? afterEnd.timestamp : null;
              })();

              const howl = new Howl({
                src: [audioUrl],
                html5: true,
                pool: 1,
                onload: () => {
                  if (stoppedRef.current) {
                    disposeHowl(howl);
                    return;
                  }
                  howl.seek(startTs);
                  howl.play();
                  prefetchNext(index);
                },
                onplay: () => {
                  // Media Session metadata/state is owned
                  // centrally by useMediaSession (wired in
                  // Audio.tsx). Do not write to
                  // navigator.mediaSession here to avoid
                  // duplicate owners.
                  setIsPlaying(true);
                  setShowPlayer(true);
                },
                onpause: () => {
                  setIsPlaying(false);
                },
                onend: () => {
                  // Always advance on the media `end` event.
                  // When the page is frozen the 100 ms poll
                  // never fires; reaching the real file end
                  // means we are past any verse-bound end
                  // timestamp anyway.
                  advanceNext();
                },
                onloaderror: (_id, err) => {
                  console.error(
                    'Playlist audio load error:',
                    err,
                  );
                  if (i + 1 < candidates.length) {
                    // Release the failed Howl (stops its bounds
                    // poll) before retrying the next candidate.
                    disposeHowl(howl);
                    retryNextCandidate(i + 1);
                    return;
                  }
                  showNotification({
                    title: 'Audio load failed',
                    message:
                      `Could not load audio for ` +
                      `${item.label}. Skipping.`,
                    color: 'orange',
                    autoClose: 5000,
                  });
                  advanceNext();
                },
                onplayerror: (_id, err) => {
                  console.error(
                    'Playlist audio play error:',
                    err,
                  );
                  if (i + 1 < candidates.length) {
                    disposeHowl(howl);
                    retryNextCandidate(i + 1);
                    return;
                  }
                  showNotification({
                    title: 'Audio play failed',
                    message:
                      `Could not play audio for ` +
                      `${item.label}. Skipping.`,
                    color: 'orange',
                    autoClose: 5000,
                  });
                  advanceNext();
                },
              });

              if (endTs !== null || item.verseNumbers) {
                const EPSILON = 0.2;
                // Returns true when the checker should stop (item
                // advanced or playback halted).
                const checkBounds = (): boolean => {
                  if (!howl || stoppedRef.current) return true;
                  const pos = getPlayPosition(howl);
                  if (pos === null) return false;
                  if (endTs !== null && pos >= endTs - EPSILON) {
                    advanceNext();
                    return true;
                  }
                  if (item.verseNumbers) {
                    const verseNumbers = item.verseNumbers;
                    const currentVerse = fetchedTimestamps.find(
                      (t, i) => {
                        const nextT = fetchedTimestamps[i + 1];
                        return (
                          t.timestamp <= pos &&
                          (!nextT || pos < nextT.timestamp)
                        );
                      },
                    );
                    if (
                      currentVerse &&
                      !verseNumbers.includes(
                        currentVerse.verse_start,
                      )
                    ) {
                      const nextIncludedVerse =
                        fetchedTimestamps.find(
                          (t) =>
                            t.timestamp > pos &&
                            verseNumbers.includes(
                              t.verse_start,
                            ),
                        );
                      if (nextIncludedVerse) {
                        howl.seek(nextIncludedVerse.timestamp);
                      } else if (endTs !== null) {
                        advanceNext();
                        return true;
                      }
                    }
                  }
                  return false;
                };

                // Advance on the <audio> element's timeupdate
                // event as well as the poll: media events are
                // still delivered to a backgrounded/frozen page
                // when JS timers are suspended.
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
                  node?.removeEventListener(
                    'timeupdate',
                    checkBounds,
                  );
                  node = null;
                };
                howl.on('end', cleanup);
                howl.on('stop', cleanup);
              }

              audioRef.current = howl;
              setAudio(howl);
              return;
            } catch (err) {
              if (stoppedRef.current) return;
              if (err instanceof BookNotInFilesetError) continue;
              throw err;
            }
          }

          // Every candidate was exhausted — report once.
          showNotification({
            title: 'Audio not available',
            message:
              `No audio for ${itemBookName} in ` +
              `${translationName}. Skipping to next item.`,
            color: 'orange',
            autoClose: 5000,
          });
          advanceNext();
        };

        // Retries fired from Howler callbacks run detached —
        // loadFromIndex rethrows non-coverage errors (network,
        // rate limit), so an uncaught rejection would stall the
        // playlist with no notification and no advance.
        const retryNextCandidate = (startAt: number) => {
          void loadFromIndex(startAt).catch((err) => {
            if (stoppedRef.current) return;
            console.error('Playlist retry failed:', err);
            showNotification({
              title: 'Audio unavailable',
              message:
                `Could not load audio for ` +
                `${item.label}. Skipping.`,
              color: 'orange',
              autoClose: 5000,
            });
            advanceNext();
          });
        };

        await loadFromIndex(0);
      } catch (err) {
        console.error('Playlist error loading item:', err);
        showNotification({
          title: 'Audio unavailable',
          message: `Could not load audio for ${item.label}. Skipping.`,
          color: 'orange',
          autoClose: 5000,
        });
        advanceNext();
      }
    },
    [
      activeAudioFilesetId,
      activeTextFilesetId,
      translations,
      unloadCurrent,
      setShowPlayer,
    ],
  );

  const start = useCallback(
    (newItems: PlaylistItem[], startIndex = 0) => {
      stoppedRef.current = false;
      timestampsNoticeShownRef.current = false;
      setItems(newItems);
      void playIndex(newItems, startIndex);
    },
    [playIndex],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play();
  }, []);

  const next = useCallback(() => {
    if (items.length === 0) return;
    void playIndex(items, currentIndex + 1);
  }, [items, currentIndex, playIndex]);

  const previous = useCallback(() => {
    if (items.length === 0) return;
    const target = Math.max(0, currentIndex - 1);
    void playIndex(items, target);
  }, [items, currentIndex, playIndex]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    unloadCurrent();
    setIsPlaying(false);
    setCurrentIndex(-1);
    setItems([]);
    setShowPlayer(false);
    // Media Session is reset centrally by useMediaSession once `active`
    // becomes false (isActive -> false here).
  }, [unloadCurrent, setShowPlayer]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      unloadCurrent();
    };
  }, [unloadCurrent]);

  return {
    isActive,
    isPlaying,
    currentIndex,
    currentItem,
    audio,
    timestamps,
    start,
    pause,
    resume,
    next,
    previous,
    stop,
  };
};
