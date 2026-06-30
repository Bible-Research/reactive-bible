import { useState, useRef, useCallback, useEffect } from 'react';
import { Howl } from 'howler';
import { showNotification } from '@mantine/notifications';
import { useBibleStore } from '../store';
import {
  getKjvAudioUrl,
  getBibleAudioUrl,
  getAudioTimestamps,
} from '../api';
import { PlaylistItem, VerseTimestamp } from '../types';
import {
  resolveTimestampsFilesetId,
  filesetCoversTestament,
  getTestamentByBookName,
  adjustTimestampsForENGESV,
  findTestamentFallback,
} from '../utils/bibleUtils';
import { useVerseHighlighter } from './useVerseHighlighter';

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
  const setAudioPlaylistEnded = useBibleStore(
    (s) => s.setAudioPlaylistEnded
  );

  const isActive = items.length > 0 && currentIndex >= 0;
  const currentItem = isActive ? (items[currentIndex] ?? null) : null;

  useVerseHighlighter(
    audio,
    isPlaying,
    timestamps,
    currentItem?.book ?? '',
    currentItem?.chapter ?? 0,
  );

  const unloadCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.unload();
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
        setAudioPlaylistEnded(true);
        return;
      }

      const item = allItems[index];

      if (!item.book || item.startVerse == null) {
        playIndex(allItems, index + 1);
        return;
      }

      const testament = getTestamentByBookName(item.book);
      const fileset = translations
        .flatMap((t) => t.filesets)
        .find((f) => f.id === activeAudioFilesetId);

      let effectiveFilesetId = activeAudioFilesetId;

      if (
        testament &&
        fileset &&
        !filesetCoversTestament(fileset.size, testament)
      ) {
        const fallbackId = findTestamentFallback(
          activeAudioFilesetId!,
          testament,
          translations.flatMap((t) => t.filesets),
        );
        if (fallbackId) {
          console.log(
            `🔄 Playlist auto-switching to ${fallbackId} for ${item.book}`
          );
          effectiveFilesetId = fallbackId;
        } else {
          showNotification({
            title: 'Audio not available',
            message:
              `The selected audio version does not cover ` +
              `${item.book}. Skipping to next item.`,
            color: 'orange',
            autoClose: 5000,
          });
          playIndex(allItems, index + 1);
          return;
        }
      }

      unloadCurrent();
      setCurrentIndex(index);

      const prefetchNext = (i: number) => {
        const next = allItems[i + 1];
        if (!next || !activeAudioFilesetId) return;
        if (activeAudioFilesetId !== 'ENGKJV') {
          getBibleAudioUrl(
            next.book,
            next.chapter,
            activeAudioFilesetId,
          ).catch(() => {});
        }
        const tsId = resolveTimestampsFilesetId(
          activeAudioFilesetId,
          activeTextFilesetId,
          next.book,
        );
        if (tsId) {
          getAudioTimestamps(next.book, next.chapter, tsId)
            .catch(() => {});
        }
      };

      try {
        let audioUrl: string;
        if (activeAudioFilesetId === 'ENGKJV') {
          audioUrl = getKjvAudioUrl(item.book, item.chapter);
        } else if (effectiveFilesetId) {
          audioUrl = await getBibleAudioUrl(
            item.book,
            item.chapter,
            effectiveFilesetId,
          );
        } else {
          showNotification({
            title: 'No audio fileset selected',
            message: 'Select an audio translation to use playlist.',
            color: 'orange',
            autoClose: 5000,
          });
          return;
        }

        if (stoppedRef.current) return;

        let fetchedTimestamps: VerseTimestamp[] = [];
        if (activeAudioFilesetId !== 'ENGKJV') {
          const tsId = resolveTimestampsFilesetId(
            activeAudioFilesetId,
            activeTextFilesetId,
            item.book,
          );
          if (tsId) {
            const rawTimestamps = await getAudioTimestamps(
              item.book,
              item.chapter,
              tsId,
            );
            fetchedTimestamps = adjustTimestampsForENGESV(
              rawTimestamps,
              activeAudioFilesetId,
            );
          }
        }

        if (stoppedRef.current) return;

        const filteredTimestamps = item.verseNumbers
          ? fetchedTimestamps.filter((t) =>
              item.verseNumbers!.includes(t.verse_start),
            )
          : fetchedTimestamps.filter(
              (t) =>
                t.verse_start >= item.startVerse &&
                t.verse_start <= item.endVerse,
            );

        setTimestamps(filteredTimestamps);

        const startTs =
          filteredTimestamps.find(
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
              howl.unload();
              return;
            }
            howl.seek(startTs);
            howl.play();
            prefetchNext(index);
          },
          onplay: () => {
            setIsPlaying(true);
            setShowPlayer(true);

            if ('mediaSession' in navigator) {
              const translationName =
                translations.find((t) =>
                  t.filesets.some(
                    (f) => f.id === activeAudioFilesetId,
                  ),
                )?.name || 'Bible Audio';
              navigator.mediaSession.metadata =
                new MediaMetadata({
                  title: item.label,
                  artist: translationName,
                  album: 'Bible Audio',
                });
              navigator.mediaSession.playbackState = 'playing';
            }
          },
          onpause: () => {
            setIsPlaying(false);
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'paused';
            }
          },
          onend: () => {
            if (stoppedRef.current) return;
            if (endTs !== null) return; // poll handles advancement
            playIndex(allItems, index + 1);
          },
          onloaderror: (_id, err) => {
            console.error('Playlist audio load error:', err);
            showNotification({
              title: 'Audio load failed',
              message: `Could not load audio for ${item.label}. Skipping.`,
              color: 'orange',
              autoClose: 5000,
            });
            if (!stoppedRef.current) {
              playIndex(allItems, index + 1);
            }
          },
          onplayerror: (_id, err) => {
            console.error('Playlist audio play error:', err);
            showNotification({
              title: 'Audio play failed',
              message: `Could not play audio for ${item.label}. Skipping.`,
              color: 'orange',
              autoClose: 5000,
            });
            if (!stoppedRef.current) {
              playIndex(allItems, index + 1);
            }
          },
        });

        if (endTs !== null) {
          const EPSILON = 0.2;
          let poll: ReturnType<typeof setInterval> | null = null;
          const startPoll = () => {
            poll = setInterval(() => {
              if (!howl || stoppedRef.current) {
                if (poll) clearInterval(poll);
                return;
              }
              const pos = howl.seek() as number;
              if (
                typeof pos === 'number' &&
                pos >= endTs - EPSILON
              ) {
                if (poll) clearInterval(poll);
                if (!stoppedRef.current) {
                  playIndex(allItems, index + 1);
                }
              }
            }, 100);
          };
          howl.on('play', startPoll);
          howl.on('end', () => { if (poll) clearInterval(poll); });
          howl.on('stop', () => { if (poll) clearInterval(poll); });
        }

        audioRef.current = howl;
        setAudio(howl);
      } catch (err) {
        console.error('Playlist error loading item:', err);
        showNotification({
          title: 'Audio unavailable',
          message: `Could not load audio for ${item.label}. Skipping.`,
          color: 'orange',
          autoClose: 5000,
        });
        if (!stoppedRef.current) {
          playIndex(allItems, index + 1);
        }
      }
    },
    [
      activeAudioFilesetId,
      activeTextFilesetId,
      translations,
      unloadCurrent,
      setAudioActiveVerse,
      setShowPlayer,
      setAudioPlaylistEnded,
    ],
  );

  const start = useCallback(
    (newItems: PlaylistItem[], startIndex = 0) => {
      stoppedRef.current = false;
      setItems(newItems);
      playIndex(newItems, startIndex);
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
    playIndex(items, currentIndex + 1);
  }, [items, currentIndex, playIndex]);

  const previous = useCallback(() => {
    if (items.length === 0) return;
    const target = Math.max(0, currentIndex - 1);
    playIndex(items, target);
  }, [items, currentIndex, playIndex]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    unloadCurrent();
    setIsPlaying(false);
    setCurrentIndex(-1);
    setItems([]);
    setShowPlayer(false);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
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
