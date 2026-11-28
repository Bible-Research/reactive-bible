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
  localizedBookName,
  adjustTimestampsForENGESV,
} from '../utils/bibleUtils';
import {
  findTranslationByFilesetId,
  resolveTextFileset,
} from '../utils/filesetGroups';
import {
  isChapterCoveredForFileset,
} from '../utils/structureCoverage';
import { orderedAudioCandidates } from '../utils/audioCandidates';
import { notifyAudioSubstitution } from '../utils/audioSubstitution';
import { useVerseHighlighter } from './useVerseHighlighter';
import {
  disposeHowl,
  osPausedNode,
  playAlreadyRequested,
} from '../utils/audioUtils';
import { attachVerseBounds } from '../utils/verseBounds';
import { captureHandledWarning } from '../utils/errorReporter';
import i18n from '../i18n';

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
  // Generation counter for playIndex runs. start()/next()/
  // previous() can supersede a run whose URL/timestamp fetches
  // are still in flight — without this the stale run resumes and
  // materializes a Howl for the wrong item, overwriting
  // audioRef while the orphaned Howl keeps loading/playing.
  const playSeqRef = useRef(0);
  // The Howl a play() was already issued for. Howler queues
  // such a call while 'loading' and playing() stays false
  // through the whole load window — the queue can still be
  // undrained inside the 'load' handlers — so only this
  // marker keeps resume()/onload from stacking a second
  // sound instance. Cleared on pause/'end'/error/dispose.
  const playRequestedHowlRef = useRef<Howl | null>(null);
  // Guards the "no verse timestamps" notification so a playlist
  // of timestampless recordings warns once, not per item.
  const timestampsNoticeShownRef = useRef(false);
  // Cross-translation substitutions already announced this
  // playlist — mirrors the chapter engine's once-per-(pair,
  // book) notice so a version swap is never silent.
  const substitutionNotifiedRef = useRef(new Set<string>());

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
    currentItem?.scope ?? currentItem?.itemId ?? '',
  );

  const unloadCurrent = useCallback(() => {
    // Null the ref before disposing — no re-entrant 'stop'
    // handler can observe a half-torn-down Howl.
    const current = audioRef.current;
    audioRef.current = null;
    playRequestedHowlRef.current = null;
    disposeHowl(current);
    setAudio(null);
    setTimestamps([]);
    setAudioActiveVerse(null);
  }, [setAudioActiveVerse]);

  const playIndex = useCallback(
    async (allItems: PlaylistItem[], index: number) => {
      // Every run is a new generation — a superseded coroutine
      // must never materialize a Howl or advance the playlist.
      const seq = ++playSeqRef.current;
      const stale = () =>
        stoppedRef.current || seq !== playSeqRef.current;
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
        if (advanced || stale()) return;
        advanced = true;
        void playIndex(allItems, index + 1);
      };

      if (!item.bookId || item.startVerse == null) {
        advanceNext();
        return;
      }

      const itemBookName = localizedBookName(item.bookId) ?? item.bookId;
      // Ordered candidates: timestamp-backed sibling recording,
      // then resolved primary, codec sibling, other-testament
      // member, and the translation's remaining audio options —
      // see orderedAudioCandidates.
      const candidates = orderedAudioCandidates(
        activeAudioFilesetId,
        item.bookId,
        translations,
        undefined,
        activeTextFilesetId,
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
        // Prefetch the first candidate whose OWNING bible's
        // structure covers the chapter — the same pick the
        // interactive walk lands on. Candidates whose coverage
        // is KNOWN absent (e.g. a Psalms+NT-only LAVLVR asked
        // for Job) are skipped without a request; an unloaded
        // owner structure counts as covered (unknown), so a
        // wrong skip can never strand a playable recording.
        const nextFilesetId =
          orderedAudioCandidates(
            activeAudioFilesetId,
            next.bookId,
            translations,
            undefined,
            activeTextFilesetId,
          ).find((id) =>
            isChapterCoveredForFileset(
              id, next.bookId, next.chapter, translations,
            ),
          ) ?? null;
        if (!nextFilesetId) return;
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
        // ENGKJV has no verse timestamps — the interactive
        // paths skip it; the prefetch must not pay a
        // guaranteed-empty request either.
        if (tsId && tsId !== 'ENGKJV') {
          getAudioTimestamps(next.bookId, next.chapter, tsId)
            .catch(() => { /* prefetch - ignore errors */ });
        }
      };

      if (candidates.length === 0) {
        showNotification({
          title: i18n.t('audio.noFileset'),
          message: i18n.t('audio.selectTranslation'),
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
            // A candidate whose owning bible is KNOWN not to
            // cover this passage can only 404 — skip it instead
            // of paying the doomed request (LATLVR's Psalms+NT
            // coverage on an OT book burned the whole chain).
            // Covered-when-unknown keeps unresolvable owners
            // tried, and the terminal-failure path below is
            // unchanged when every candidate is skipped.
            if (
              candidateId !== 'ENGKJV' &&
              !isChapterCoveredForFileset(
                candidateId,
                item.bookId,
                item.chapter,
                translations,
              )
            ) {
              continue;
            }
            try {
              const audioUrl =
                candidateId === 'ENGKJV'
                  ? getKjvAudioUrl(item.bookId, item.chapter)
                  : await getBibleAudioUrl(
                      item.bookId,
                      item.chapter,
                      candidateId,
                    );

              if (stale()) return;

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

              if (stale()) return;

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
                  title: i18n.t('audio.noTimestamps'),
                  message:
                    i18n.t('audio.noTimestampsMsg'),
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

              // Loop seeks back to the item's first verse — for
              // verseNumbers lists that is the first included
              // verse, not necessarily startVerse.
              const verses = item.verseNumbers;
              const loopStartTs = verses
                ? fetchedTimestamps.find(
                    (t) => verses.includes(t.verse_start),
                  )?.timestamp ?? startTs
                : startTs;

              const howl = new Howl({
                src: [audioUrl],
                html5: true,
                pool: 1,
                onload: () => {
                  if (stale()) {
                    disposeHowl(howl);
                    return;
                  }
                  howl.seek(startTs);
                  // A play requested while 'loading' (resume()
                  // during the load window) sits in Howler's
                  // queue and can still be undrained here —
                  // playing() stays false through the whole
                  // window, so only the request marker keeps a
                  // second play() from stacking another sound
                  // instance (its own <audio> node).
                  if (
                    !playAlreadyRequested(
                      howl,
                      playRequestedHowlRef.current,
                    )
                  ) {
                    playRequestedHowlRef.current = howl;
                    try {
                      howl.play();
                    } catch (err) {
                      // A synchronous throw must not leave the
                      // marker set — it would swallow every
                      // later resume for this Howl.
                      playRequestedHowlRef.current = null;
                      console.warn(
                        'Play operation failed:',
                        err,
                      );
                    }
                  }
                  prefetchNext(index);
                },
                onplay: () => {
                  if (stale()) return;
                  // Media Session metadata/state is owned
                  // centrally by useMediaSession (wired in
                  // Audio.tsx). Do not write to
                  // navigator.mediaSession here to avoid
                  // duplicate owners.
                  if (stale()) return;
                  setIsPlaying(true);
                  setShowPlayer(true);
                  // A winning candidate owned by another
                  // translation is a version swap — announce
                  // it once per (pair, book) like chapter
                  // mode instead of silently substituting.
                  notifyAudioSubstitution(
                    activeAudioFilesetId,
                    candidateId,
                    item.bookId,
                    translations,
                    substitutionNotifiedRef.current,
                  );
                },
                onpause: () => {
                  if (playRequestedHowlRef.current === howl) {
                    playRequestedHowlRef.current = null;
                  }
                  if (stale()) return;
                  setIsPlaying(false);
                },
                onend: () => {
                  if (playRequestedHowlRef.current === howl) {
                    playRequestedHowlRef.current = null;
                  }
                  // Always advance on the media `end` event.
                  // When the page is frozen the 100 ms poll
                  // never fires; reaching the real file end
                  // means we are past any verse-bound end
                  // timestamp anyway.
                  advanceNext();
                },
                onloaderror: (_id, err) => {
                  if (playRequestedHowlRef.current === howl) {
                    playRequestedHowlRef.current = null;
                  }
                  // A superseded run must stay inert — unloading
                  // during a pending play can surface a playerror,
                  // which must not spawn a detached retry.
                  if (stale()) return;
                  console.error(
                    'Playlist audio load error:',
                    err,
                  );
                  // Release the failed Howl (stops its bounds
                  // poll) — whether we retry or were superseded.
                  disposeHowl(howl);
                  if (stale()) return;
                  if (i + 1 < candidates.length) {
                    retryNextCandidate(i + 1);
                    return;
                  }
                  captureHandledWarning(
                    'Playlist audio load failed: ' + String(err),
                    'media-failure',
                    {
                      filesetId: candidateId,
                      book: item.bookId,
                      chapter: item.chapter,
                      item: item.label,
                    },
                  );
                  showNotification({
                    title: i18n.t('audio.loadFailed'),
                    message:
                      i18n.t('audio.couldNotLoad', { label: item.label }),
                    color: 'orange',
                    autoClose: 5000,
                  });
                  advanceNext();
                },
                onplayerror: (_id, err) => {
                  if (playRequestedHowlRef.current === howl) {
                    playRequestedHowlRef.current = null;
                  }
                  if (stale()) return;
                  console.error(
                    'Playlist audio play error:',
                    err,
                  );
                  disposeHowl(howl);
                  if (stale()) return;
                  if (i + 1 < candidates.length) {
                    retryNextCandidate(i + 1);
                    return;
                  }
                  captureHandledWarning(
                    'Playlist audio play failed: ' + String(err),
                    'media-failure',
                    {
                      filesetId: candidateId,
                      book: item.bookId,
                      chapter: item.chapter,
                      item: item.label,
                    },
                  );
                  showNotification({
                    title: i18n.t('audio.playFailed'),
                    message:
                      i18n.t('audio.couldNotPlay', { label: item.label }),
                    color: 'orange',
                    autoClose: 5000,
                  });
                  advanceNext();
                },
              });

              if (endTs !== null || item.verseNumbers) {
                attachVerseBounds(howl, {
                  endTs,
                  verseNumbers: item.verseNumbers,
                  // The FULL chapter's rows — skipped-verse
                  // detection must recognize playback drifting
                  // into a non-included verse.
                  timestamps: fetchedTimestamps,
                  loopStartTs,
                  onAdvance: advanceNext,
                  // `stale` (not just stoppedRef): a superseded
                  // seq must also halt the bounds checker.
                  isStopped: stale,
                });
              }

              // A newer playIndex superseded this coroutine
              // while the Howl was being set up — dispose it
              // instead of overwriting the current item's audio.
              if (stale()) {
                disposeHowl(howl);
                return;
              }
              audioRef.current = howl;
              setAudio(howl);
              return;
            } catch (err) {
              if (stale()) return;
              if (err instanceof BookNotInFilesetError) continue;
              // Report sites name the fileset that actually
              // failed — not the retry's startAt candidate.
              // A primitive or frozen rejection can't carry
              // the stamp — assigning to a frozen Error throws
              // in strict mode and would replace the real
              // rejection, so leave those unstamped.
              if (err instanceof Error && !Object.isFrozen(err)) {
                (err as { filesetId?: string }).filesetId =
                  candidateId;
              }
              throw err;
            }
          }

          // Every candidate was exhausted — report once.
          if (stale()) return;
          captureHandledWarning(
            'Playlist audio candidates exhausted',
            'media-failure',
            {
              filesetId: activeAudioFilesetId,
              candidates: candidates.join(','),
              book: item.bookId,
              chapter: item.chapter,
              item: item.label,
            },
          );
          showNotification({
            title: i18n.t('audio.notAvailable'),
            message:
              i18n.t('audio.noAudioForSkipping', {
                book: itemBookName,
                translation: translationName,
              }),
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
            if (stale()) return;
            console.error('Playlist retry failed:', err);
            captureHandledWarning(
              'Playlist audio retry failed: ' +
                (err instanceof Error ? err.message : String(err)),
              'media-failure',
              {
                filesetId:
                  (err as { filesetId?: string }).filesetId ??
                  candidates[startAt],
                book: item.bookId,
                chapter: item.chapter,
                item: item.label,
              },
            );
            showNotification({
              title: i18n.t('audio.unavailable'),
              message:
                i18n.t('audio.couldNotLoad', { label: item.label }),
              color: 'orange',
              autoClose: 5000,
            });
            advanceNext();
          });
        };

        await loadFromIndex(0);
      } catch (err) {
        if (stale()) return;
        console.error('Playlist error loading item:', err);
        captureHandledWarning(
          'Playlist audio error: ' +
            (err instanceof Error ? err.message : String(err)),
          'media-failure',
          {
            filesetId:
              (err as { filesetId?: string }).filesetId ??
              activeAudioFilesetId,
            book: item.bookId,
            chapter: item.chapter,
            item: item.label,
          },
        );
        showNotification({
          title: i18n.t('audio.unavailable'),
          message: i18n.t('audio.couldNotLoad', { label: item.label }),
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
      substitutionNotifiedRef.current.clear();
      setItems(newItems);
      void playIndex(newItems, startIndex);
    },
    [playIndex],
  );

  const pause = useCallback(() => {
    // Clear the request marker eagerly — a pause inside the
    // load window must retire the queued play's marker or a
    // later resume() would be swallowed by the stale flag.
    playRequestedHowlRef.current = null;
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    const current = audioRef.current;
    if (!current) return;
    // The OS can pause the <audio> node behind Howler's back
    // (Android audio-focus loss in a car): playing() still
    // reports true while the node is silent — replay the node
    // to resume in place; howl.play() would stack a second
    // sound instead of reviving this one.
    const node = osPausedNode(current);
    if (node) {
      void node.play();
      return;
    }
    // play() on an already-playing Howl — or on one whose
    // play is still queued in Howler's load window — spawns a
    // second sound instance. A redundant media-session 'play'
    // (Bluetooth reconnect, head-unit re-dispatch, focus
    // regain) must not layer the file over itself.
    if (
      playAlreadyRequested(current, playRequestedHowlRef.current)
    ) {
      return;
    }
    playRequestedHowlRef.current = current;
    try {
      current.play();
    } catch (err) {
      // A synchronous throw must not leave the marker set —
      // it would swallow every later resume for this Howl.
      playRequestedHowlRef.current = null;
      console.warn('Play operation failed:', err);
    }
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
    // Invalidate any load still in flight so it cannot
    // materialize a Howl after the stop.
    playSeqRef.current += 1;
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
