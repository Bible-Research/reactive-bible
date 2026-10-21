import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import {
  getKjvAudioUrl,
  getBibleAudioUrl,
  getAudioTimestamps,
  getAdjacentChapters,
  BookNotInFilesetError,
} from "../api";
import { shallow } from "zustand/shallow";
import { showNotification } from "@mantine/notifications";
import {
  toBookName,
  buildBiblePath,
  resolveTimestampsFilesetId,
  adjustTimestampsForENGESV,
} from "../utils/bibleUtils";
import {
  findTranslationByFilesetId,
  resolveTextFileset,
  splitCodec,
  type CodecKey,
} from "../utils/filesetGroups";
import { orderedAudioCandidates } from "../utils/audioCandidates";
import { disposeHowl } from "../utils/howlUtils";
import {
  selectedStartVerse,
  verseStartTimestamp,
  seekHowlWhenLoaded,
} from "../utils/verseSeek";
import { useVerseHighlighter } from "./useVerseHighlighter";
import { Translation, VerseTimestamp } from "../types";

const chapterKey = (
  filesetId: string | null,
  bookId: string,
  chapter: number,
): string => `${filesetId ?? 'none'}:${bookId}:${chapter}`;

// Inverse of chapterKey's trailing bookId:chapter — the filesetId
// segment is not needed by callers.
const parseChapterKey = (
  key: string,
): { bookId: string; chapter: number } | null => {
  const parts = key.split(':');
  const chapter = Number(parts[parts.length - 1]);
  const bookId = parts[parts.length - 2];
  return bookId && Number.isInteger(chapter)
    ? { bookId, chapter }
    : null;
};

// Brief silence between chapters on auto-advance.
const INTER_CHAPTER_GAP_MS = 2000;

export interface UseChapterAudioReturn {
  audio: Howl | null;
  audioRef: MutableRefObject<Howl | null>;
  isPlaying: boolean;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  isLooping: boolean;
  setIsLooping: Dispatch<SetStateAction<boolean>>;
  timestamps: VerseTimestamp[];
  activeBookId: string;
  activeChapter: number;
  activeAudioFilesetId: string | null;
  translations: Translation[];
  safePlay: () => void;
  safePause: () => void;
  safeSeek: (targetTime: number) => void;
  advanceChapter: (direction: 1 | -1) => boolean;
  handleClose: () => void;
}

/**
 * Chapter-mode audio engine: owns the Howl lifecycle for the
 * active book/chapter (load, play/pause/seek, verse-timestamp
 * fetching, auto-advance with inter-chapter gap, next-chapter
 * preload, fileset fallback walk) plus verse highlighting. The
 * `isPlaylistMode` flag tells the reset effect to stand down
 * while the playlist owns playback. Playlist orchestration,
 * media-session wiring and JSX live in the Audio container.
 */
export const useChapterAudio = (
  isPlaylistMode: boolean,
): UseChapterAudioReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<Howl | null>(null);
  const [audio, setAudio] = useState<Howl | null>(null);
  // Chapter key of the Howl currently in audioRef — lets the reset
  // effect tell "user navigated" (tear down) from "the ended
  // handler already adopted the preloaded Howl for this chapter"
  // (keep playing).
  const audioChapterKeyRef = useRef<string | null>(null);
  // Pre-created Howl holding the next chapter's bytes, fetched
  // while the current chapter plays — shrinks the ended -> play()
  // gap to almost nothing (critical on a frozen lock-screen
  // renderer).
  const preloadedRef = useRef<{
    key: string;
    howl: Howl;
    blobUrl: string | null;
  } | null>(null);
  const preloadTokenRef = useRef(0);
  // Invalidates in-flight chapter loads. Bumped on chapter end,
  // navigation, and when a newer load supersedes an older one — a
  // stale fetch can then never materialize a Howl.
  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const activeBlobUrlRef = useRef<string | null>(null);
  // Delay timer for the auto-advance inter-chapter gap, plus a
  // flag telling the load effect to schedule the next chapter's
  // play() instead of starting it immediately.
  const advanceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingGapRef = useRef(false);
  // Ordered fallback fileset ids for the chapter currently
  // loading/playing — consumed one at a time when a candidate
  // fails at fetch time (book not in fileset) or inside Howler
  // (undecodable codec → mp3 sibling retries first).
  const fallbackRef = useRef<{
    seq: number;
    ids: string[];
    nextIndex: number;
    bookId: string;
    chapter: number;
  } | null>(null);
  const tryNextFallbackRef = useRef<() => boolean>(() => false);
  // Remembers the codec that last played per audio selection —
  // a codec that failed to decode (e.g. opus16 on an old
  // device) must not be re-picked for the next chapter's
  // preload or fallback walk.
  const workingCodecRef = useRef(new Map<string, CodecKey>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const isLoopingRef = useRef(false);
  const [timestamps, setTimestamps] = useState<VerseTimestamp[]>([]);
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const setAudioActiveVerse = useBibleStore(
    (s) => s.setAudioActiveVerse
  );
  const { activeAudioFilesetId, activeTextFilesetId, translations } =
    useBibleStore(
      (state) => ({
        activeAudioFilesetId: state.activeAudioFilesetId,
        activeTextFilesetId: state.activeTextFilesetId,
        translations: state.translations,
      }),
      shallow
    );
  const setShowPlayer = useBibleStore(
    (state) => state.setShowAudioPlayer
  );
  const navigate = useNavigate();
  const location = useLocation();

  // Ordered candidates for a book with the codec that last
  // played for this selection moved to the front — after an
  // opus16 decode failure the mp3 sibling leads the next
  // chapter's load and preload instead of re-picking opus16.
  const resolveCandidates = useCallback(
    (
      bookId: string,
      filesetId: string | null,
    ): { filesetId: string; candidates: string[] } | null => {
      const remembered = filesetId
        ? workingCodecRef.current.get(filesetId)
        : undefined;
      const candidates = orderedAudioCandidates(
        filesetId,
        bookId,
        useBibleStore.getState().translations,
        remembered,
      );
      if (candidates.length === 0) return null;
      return { filesetId: candidates[0], candidates };
    },
    [],
  );

  // Primary concrete fileset id for a book — used where only the
  // first candidate is needed (chapter keys, preloading).
  const resolveFilesetFor = useCallback(
    (bookId: string, filesetId: string | null): string | null => {
      if (!filesetId) return filesetId;
      return (
        resolveCandidates(bookId, filesetId)?.filesetId ??
        filesetId
      );
    },
    [resolveCandidates],
  );

  const resolveAudioUrl = useCallback(
    (
      bookId: string,
      chapter: number,
      filesetId: string,
    ): Promise<string> | string =>
      filesetId === 'ENGKJV'
        ? getKjvAudioUrl(bookId, chapter)
        : getBibleAudioUrl(bookId, chapter, filesetId),
    [],
  );

  const discardPreloaded = useCallback(() => {
    // Invalidate any in-flight preload so it cannot write a stale
    // record after this discard.
    preloadTokenRef.current += 1;
    const pre = preloadedRef.current;
    preloadedRef.current = null;
    if (pre) disposeHowl(pre.howl, pre.blobUrl);
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  // Start the pending chapter after the inter-chapter gap. The
  // guard keeps a Howl torn down during the pause from
  // resurrecting.
  const scheduleChapterPlay = useCallback(() => {
    clearAdvanceTimer();
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      // Play whatever Howl owns audioRef at fire time — not
      // necessarily the one the gap was scheduled for. A mid-gap
      // loaderror can swap in a fallback replacement; gating on
      // the original Howl would skip play entirely and strand
      // the replacement (the load effect's advanceTimerRef check
      // suppresses safePlay while a timer is pending).
      const current = audioRef.current;
      if (!current || current.state() === 'unloaded') return;
      current.play();
    }, INTER_CHAPTER_GAP_MS);
  }, [clearAdvanceTimer]);

  // Move the reader to `target`. On /bible the URL is the source
  // of truth, so navigate and let BibleRoute's URL->store sync
  // apply it (writing the store first would let a commit see the
  // old URL with the new chapter and revert the advance,
  // tearing down the adopted Howl mid-play). Off the reader
  // (/search, /notes) a chapter boundary must not yank the user
  // back — update the store directly like the sync would. The
  // URL stays stale meanwhile; that is intentional, and
  // BibleRoute's sync picks the store position back up when the
  // user returns to the reader.
  const goToChapter = useCallback(
    (target: { bookId: string; chapter: number }) => {
      if (location.pathname.startsWith('/bible')) {
        void navigate(
          buildBiblePath(target.bookId, target.chapter),
          { replace: true },
        );
      } else {
        useBibleStore
          .getState()
          .setActiveBookAndChapter(target.bookId, target.chapter);
      }
    },
    [location.pathname, navigate],
  );

  // Advance one chapter forward/backward. Returns false when
  // there is no adjacent chapter in that direction.
  const advanceChapter = useCallback(
    (direction: 1 | -1): boolean => {
      const state = useBibleStore.getState();
      // Adjacency follows the chapter actually playing — the
      // store can lag a commit behind an auto-advance (URL->
      // store sync), which would collapse rapid multi-skips
      // onto the same stale target.
      const playing = audioChapterKeyRef.current
        ? parseChapterKey(audioChapterKeyRef.current)
        : null;
      const { previous, next } = getAdjacentChapters(
        playing?.bookId ?? state.activeBookId,
        playing?.chapter ?? state.activeChapter,
      );
      const target = direction === 1 ? next : previous;
      if (!target) return false;
      goToChapter(target);
      return true;
    },
    [goToChapter],
  );

  // Fetch the next chapter's audio bytes and pre-create its Howl
  // while the current chapter is still playing.
  const preloadNextChapter = useCallback(() => {
    const state = useBibleStore.getState();
    // "Next" must follow the chapter actually playing, not the
    // store: right after an auto-advance the store can still show
    // the previous chapter (BibleRoute's URL->store sync lands a
    // commit later), which would re-preload the just-adopted
    // chapter and leave the real next one unprepared.
    const playing = audioChapterKeyRef.current
      ? parseChapterKey(audioChapterKeyRef.current)
      : null;
    const { next } = getAdjacentChapters(
      playing?.bookId ?? state.activeBookId,
      playing?.chapter ?? state.activeChapter,
    );
    if (!next) return;
    // Resolve for the NEXT book — a chapter boundary can cross
    // books and even testaments (MAL -> MAT); testament-split
    // filesets like ENGESV resolve differently per testament.
    const filesetId = resolveFilesetFor(
      next.bookId,
      state.activeAudioFilesetId,
    );
    if (!filesetId) return;
    const key = chapterKey(filesetId, next.bookId, next.chapter);
    if (preloadedRef.current?.key === key) return;
    const token = ++preloadTokenRef.current;
    void (async () => {
      try {
        const url = await resolveAudioUrl(
          next.bookId,
          next.chapter,
          filesetId,
        );
        if (!url || token !== preloadTokenRef.current) return;
        // Grab the actual mp3 bytes so the chapter transition needs
        // no network at all. Hosts without CORS fall back to the
        // media element streaming the URL directly.
        let src = url;
        let blobUrl: string | null = null;
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            blobUrl = URL.createObjectURL(await resp.blob());
            src = blobUrl;
          }
        } catch {
          // CORS or network failure — stream the URL directly.
        }
        if (token !== preloadTokenRef.current) {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          return;
        }
        discardPreloaded();
        // A blob: URL carries no file extension, so Howler's
        // codec sniffing fails and the Howl stays 'unloaded'
        // forever. Pass the source URL's extension explicitly.
        const base = url.split('?')[0].split('#')[0];
        const dot = base.lastIndexOf('.');
        const ext =
          dot > -1 ? base.slice(dot + 1).toLowerCase() : '';
        const format = /^[a-z0-9]{1,5}$/.test(ext)
          ? [ext]
          : undefined;
        const howl = new Howl({
          src: [src],
          format,
          html5: true,
          pool: 1,
          preload: true,
        });
        preloadedRef.current = { key, howl, blobUrl };
      } catch {
        // Prefetch is best-effort; playback falls back to on-demand.
      }
    })();
  }, [resolveAudioUrl, resolveFilesetFor, discardPreloaded]);

  const handleChapterPlay = useCallback(() => {
    setIsPlaying(true);
    setLoading(false);
    // Remember the codec that actually played for this audio
    // selection so a codec that keeps failing to decode is not
    // re-picked for the next chapter's preload.
    const selection =
      useBibleStore.getState().activeAudioFilesetId;
    const playingId = audioChapterKeyRef.current?.split(':')[0];
    if (selection && playingId && playingId !== 'none') {
      workingCodecRef.current.set(
        selection,
        splitCodec(playingId).codec,
      );
    }
    preloadNextChapter();
  }, [preloadNextChapter]);

  const handleChapterPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleChapterLoadError = useCallback(
    (_id: number, err: unknown) => {
      console.error('Audio load error:', err);
      // A candidate that fetched but cannot be decoded (e.g.
      // opus16 on an old device) retries as its next alternate —
      // typically the mp3 sibling — before surfacing an error.
      if (tryNextFallbackRef.current()) return;
      setError('Failed to load audio');
      setIsPlaying(false);
      setLoading(false);
    },
    [],
  );

  const handleChapterPlayError = useCallback(
    (_id: number, err: unknown) => {
      console.error('Audio play error:', err);
      if (tryNextFallbackRef.current()) return;
      setError('Failed to play audio');
      setIsPlaying(false);
      setLoading(false);
    },
    [],
  );

  // Kept in a ref so `onChapterEnd` can wire the adopted Howl
  // without a circular dependency between the two callbacks.
  const wireChapterHowlRef = useRef<(howl: Howl) => void>(
    () => undefined,
  );

  // Chapter ended. Prefer the pre-created next-chapter Howl:
  // adopting it needs neither a fetch nor a new <audio> element —
  // the two things that break auto-advance on a frozen lock
  // screen. play() itself is deferred by the inter-chapter gap
  // (INTER_CHAPTER_GAP_MS) via pendingGapRef.
  const onChapterEnd = useCallback(
    (finished: Howl) => {
      // Defensive: onend shouldn't fire when looping.
      if (finished.loop()) return;

      // Invalidate any load still in flight — the advance below
      // supersedes whatever passage it was fetching.
      loadSeqRef.current += 1;

      // "Next" follows the chapter that just ended, not the
      // store — during the URL->store sync window the store can
      // still show the previous chapter and the adoption check
      // below would compare against the wrong target.
      const state = useBibleStore.getState();
      const ended = audioChapterKeyRef.current
        ? parseChapterKey(audioChapterKeyRef.current)
        : null;
      const { next } = getAdjacentChapters(
        ended?.bookId ?? state.activeBookId,
        ended?.chapter ?? state.activeChapter,
      );
      const pre = preloadedRef.current;
      if (next && pre) {
        const filesetId = resolveFilesetFor(
          next.bookId,
          state.activeAudioFilesetId,
        );
        if (
          pre.key ===
            chapterKey(filesetId, next.bookId, next.chapter) &&
          pre.howl.state() !== 'unloaded'
        ) {
          preloadedRef.current = null;
          disposeHowl(finished, activeBlobUrlRef.current);
          activeBlobUrlRef.current = pre.blobUrl;
          const nextHowl = pre.howl;
          wireChapterHowlRef.current(nextHowl);
          nextHowl.loop(isLoopingRef.current);
          audioRef.current = nextHowl;
          audioChapterKeyRef.current = pre.key;
          // The load effect consumes this flag and schedules the
          // adopted Howl's play() after the inter-chapter gap.
          pendingGapRef.current = true;
          setAudio(nextHowl);
          // Update book/chapter state + URL (or just the store
          // off the reader). The reset effect sees
          // audioChapterKeyRef match and keeps this Howl playing.
          goToChapter(next);
          return;
        }
      }

      // Tear down the finished Howl immediately. Otherwise the load
      // effect's `isPlaying && audio !== null` branch would call
      // safePlay() on this ended instance and restart it from 0,
      // replaying the same chapter until the next one loads.
      disposeHowl(finished, activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      audioRef.current = null;
      audioChapterKeyRef.current = null;
      setAudio(null);

      // The next chapter's fresh load must honor the gap too.
      pendingGapRef.current = true;
      if (next) {
        goToChapter(next);
      } else {
        // No next chapter — stop playing.
        pendingGapRef.current = false;
        setIsPlaying(false);
      }
    },
    [goToChapter, resolveFilesetFor],
  );

  useEffect(() => {
    wireChapterHowlRef.current = (howl: Howl) => {
      howl.on('play', handleChapterPlay);
      howl.on('pause', handleChapterPause);
      howl.on('end', () => onChapterEnd(howl));
      howl.once('loaderror', handleChapterLoadError);
      howl.once('playerror', handleChapterPlayError);
    };
  }, [
    handleChapterPlay,
    handleChapterPause,
    onChapterEnd,
    handleChapterLoadError,
    handleChapterPlayError,
  ]);

  // Reports a chapter audio failure the same way from the
  // initial load and the fallback walk: a coverage miss that
  // exhausted every alternate gets the book/translation hint,
  // any other failure (rate limit, provider, network) keeps its
  // own message instead of a generic 'Audio unavailable'.
  const reportChapterAudioFailure = useCallback(
    (err: unknown, bookId: string) => {
      let errorMsg = 'Audio unavailable';
      if (err instanceof Error) {
        // Extract just the key part of the error
        if (err.message.includes('not available')) {
          errorMsg = 'Audio not available';
        } else if (err.message.includes('No Fileset')) {
          errorMsg = 'Audio not available for this chapter';
        } else {
          errorMsg = err.message.split(':')[0]; // Get first part
        }
      }

      const state = useBibleStore.getState();
      const filesetId = state.activeAudioFilesetId;
      let hint =
        'Try selecting a different audio version in the ' +
        'Translation Settings ("Change Translation" button).';
      if (err instanceof BookNotInFilesetError) {
        const bookLabel = toBookName(bookId) ?? bookId;
        const owner = findTranslationByFilesetId(
          filesetId,
          state.translations,
        );
        hint =
          `No audio for ${bookLabel} in ` +
          `${owner?.name ?? filesetId}.`;
      }

      showNotification({
        title: errorMsg,
        message: hint,
        color: 'orange',
        autoClose: 8000,
      });
      setError(errorMsg);
      setIsPlaying(false);
      setLoading(false);
      setShowPlayer(false);
    },
    [setShowPlayer],
  );

  // Loads the next fallback candidate for the current chapter.
  // Returns false when no candidates remain (or the load it
  // belongs to was superseded) so error handlers know whether
  // to surface a failure.
  useEffect(() => {
    tryNextFallbackRef.current = () => {
      const state = useBibleStore.getState();
      let pending = fallbackRef.current;
      if (!pending || pending.seq !== loadSeqRef.current) {
        // A Howl adopted from the preload path never armed a
        // fallback record (or the record belongs to the previous
        // chapter) — re-resolve this chapter's candidates so a
        // decode failure walks THIS product's alternates. The
        // playing chapter comes from audioChapterKeyRef, not the
        // store: during the URL->store sync window the store can
        // still show the previous chapter and the comparison
        // would misfire, surfacing 'Failed to load audio'
        // instead of walking the alternates.
        const keyNow = audioChapterKeyRef.current;
        if (!keyNow) return false;
        const parsed = parseChapterKey(keyNow);
        if (!parsed) return false;
        const playingId = keyNow.split(':').slice(0, -2).join(':');
        const resolved = resolveCandidates(
          parsed.bookId,
          state.activeAudioFilesetId,
        );
        if (!resolved) return false;
        const i = resolved.candidates.indexOf(playingId);
        pending = {
          seq: loadSeqRef.current,
          ids: resolved.candidates,
          nextIndex: i >= 0 ? i + 1 : 1,
          bookId: parsed.bookId,
          chapter: parsed.chapter,
        };
        fallbackRef.current = pending;
      }
      const nextId = pending.ids[pending.nextIndex];
      if (!nextId) return false;
      pending.nextIndex += 1;
      const { bookId, chapter } = pending;
      void (async () => {
        try {
          const url = await resolveAudioUrl(bookId, chapter, nextId);
          if (pending.seq !== loadSeqRef.current) return;
          if (!url || typeof url !== 'string') {
            tryNextFallbackRef.current();
            return;
          }
          // Swap out the failed Howl for the new candidate. If
          // the failure arrived during the inter-chapter gap a
          // play() may still be scheduled against the OLD Howl —
          // the timer guards on `audioRef.current !== howl` and
          // would bail, leaving isPlaying true in silence.
          // Clearing it lets the load effect start (or
          // reschedule) the replacement.
          clearAdvanceTimer();
          disposeHowl(audioRef.current, activeBlobUrlRef.current);
          activeBlobUrlRef.current = null;
          const howl = new Howl({
            src: [url],
            html5: true,
            pool: 1,
            loop: isLoopingRef.current,
            onplay: handleChapterPlay,
            onpause: handleChapterPause,
            onend: () => onChapterEnd(howl),
            onloaderror: handleChapterLoadError,
            onplayerror: handleChapterPlayError,
          });
          audioChapterKeyRef.current = chapterKey(
            nextId,
            bookId,
            chapter,
          );
          audioRef.current = howl;
          setAudio(howl);
          // isPlaying is still true — the load effect's
          // `audio !== null` branch drives play via safePlay.
        } catch (err) {
          if (pending.seq !== loadSeqRef.current) return;
          // Coverage misses keep walking the alternates; any
          // other failure surfaces its own message rather than
          // being masked as a generic 'Audio unavailable'.
          if (
            err instanceof BookNotInFilesetError &&
            tryNextFallbackRef.current()
          ) {
            return;
          }
          reportChapterAudioFailure(err, bookId);
        }
      })();
      return true;
    };
  });

  // Reset chapter audio when chapter/book/version/mode changes —
  // playlist mode routes here for a full chapter-engine teardown.
  useEffect(() => {
    // Every run means the passage or mode changed — supersede any
    // chapter load still in flight; its post-await token check
    // will discard the result.
    loadSeqRef.current += 1;
    if (isPlaylistMode) {
      // Chapter audio and the playlist are mutually exclusive —
      // without this teardown a chapter still playing (or a load
      // still able to flip isPlaying back on) would stream in
      // parallel with the playlist, and two useVerseHighlighter
      // instances would fight over audioActiveVerse.
      const current = audioRef.current;
      disposeHowl(current, activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      audioRef.current = null;
      audioChapterKeyRef.current = null;
      setAudio(null);
      // isPlaying is chapter-mode state — a still-true value
      // would make the load effect fetch chapter audio next to
      // the playlist.
      isPlayingRef.current = false;
      setIsPlaying(false);
      clearAdvanceTimer();
      pendingGapRef.current = false;
      discardPreloaded();
      setTimestamps([]);
      setAudioActiveVerse(null);
      return;
    }
    const key = chapterKey(
      resolveFilesetFor(activeBookId, activeAudioFilesetId),
      activeBookId,
      activeChapter,
    );
    const current = audioRef.current;
    // Dispose only when the passage actually changed: a key match
    // means the ended handler already adopted this chapter's
    // preloaded Howl and it must keep playing.
    if (current && audioChapterKeyRef.current !== key) {
      disposeHowl(current, activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      audioRef.current = null;
      audioChapterKeyRef.current = null;
      isPlayingRef.current = false;
      // User navigated mid-gap — cancel the scheduled play so the
      // new chapter starts promptly.
      clearAdvanceTimer();
      pendingGapRef.current = false;
      setAudio(null);
    }
    // Re-check the ref, not the captured `current` local: the
    // dispose branch above clears it on a key mismatch. Only a
    // still-live Howl — the ended handler adopted this chapter's
    // preloaded one — may skip the discard and keep playing.
    if (audioRef.current) {
      setTimestamps([]);
      setAudioActiveVerse(null);
      return;
    }
    discardPreloaded();
    setTimestamps([]);
    setAudioActiveVerse(null);
  }, [
    isPlaylistMode,
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    resolveFilesetFor,
    discardPreloaded,
    clearAdvanceTimer,
    setAudioActiveVerse,
  ]);

  // Fetch timestamps when audio or text fileset changes
  useEffect(() => {
    if (!activeAudioFilesetId) return;
    // Stored ids may be grouped product ids — resolve to the
    // concrete members so the ENGESV_API timestamp special cases
    // keep matching.
    const resolvedAudioId = resolveFilesetFor(
      activeBookId,
      activeAudioFilesetId,
    );
    const tsFilesetId = resolveTimestampsFilesetId(
      resolvedAudioId,
      resolveTextFileset(
        activeTextFilesetId,
        activeBookId,
        translations,
      ),
      activeBookId,
    );
    if (!tsFilesetId) return;
    void getAudioTimestamps(
      activeBookId,
      activeChapter,
      tsFilesetId,
    ).then((ts) => {
      const adjusted = adjustTimestampsForENGESV(
        ts,
        resolvedAudioId,
      );
      setTimestamps(adjusted);
    });
  }, [
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    activeTextFilesetId,
    translations,
    resolveFilesetFor,
  ]);

  // Hook: highlight active verse during playback
  useVerseHighlighter(
    audio,
    isPlaying,
    timestamps,
    activeBookId,
    activeChapter,
    'bible',
  );

  const safeSeek = useCallback((targetTime: number) => {
    const currentAudio = audioRef.current;
    if (!currentAudio || currentAudio.state() !== 'loaded') return;
    if (!Number.isFinite(targetTime)) return;
    try {
      const duration = currentAudio.duration();
      const clampedTime = Math.max(
        0,
        Math.min(duration || Infinity, targetTime),
      );
      currentAudio.seek(clampedTime);
    } catch (err) {
      console.warn('Seek operation failed:', err);
    }
  }, []);

  // Synchronous and fire-and-forget. Howler's html5 `play()` returns a sound
  // id (number), not a promise, and handles the underlying <audio> element's
  // play promise internally (rejections surface via onplayerror). Keeping
  // these synchronous guarantees Media Session action handlers return
  // immediately and never block the main thread (prevents Android ANR).
  const safePlay = useCallback(() => {
    const currentAudio = audioRef.current;
    if (!currentAudio || currentAudio.playing()) return;
    try {
      currentAudio.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (err) {
      console.warn('Play operation failed:', err);
    }
  }, []);

  const safePause = useCallback(() => {
    // Pausing during the inter-chapter gap must also cancel the
    // scheduled play — otherwise the next chapter starts despite
    // the pause.
    clearAdvanceTimer();
    pendingGapRef.current = false;
    const currentAudio = audioRef.current;
    if (!currentAudio || !currentAudio.playing()) return;
    try {
      currentAudio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } catch (err) {
      console.warn('Pause operation failed:', err);
    }
  }, [clearAdvanceTimer]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  useEffect(() => {
    const loadAndPlayAudio = async () => {
      if (isPlaying && audio !== null) {
        // `audio` can lag the refs by a commit: the adoption path
        // writes audioRef synchronously and publishes through
        // setAudio, and an off-reader advance writes the store
        // directly — a render can land in between with the
        // disposed predecessor still in state. Never drive a
        // torn-down Howl; the successor arrives next render with
        // pendingGap still armed.
        if (audio.state() === 'unloaded') return;
        if (pendingGapRef.current) {
          // This chapter arrived via auto-advance — start it
          // after the inter-chapter gap, not immediately.
          pendingGapRef.current = false;
          scheduleChapterPlay();
        } else if (advanceTimerRef.current === null) {
          // Skip safePlay while a scheduled play is pending —
          // store-sync re-runs of this effect must not jump the
          // gap.
          safePlay();
        }
        return;
      }

      if (!isPlaying && audio !== null) {
        safePause();
        return;
      }

      // Only load new audio if we're playing and don't have audio yet
      if (isPlaying && audio === null) {
        setLoading(true);
        setError(null);

        // Read live store state — this render's closure can lag the
        // store by a commit when a chapter ends (its setAudio(null)
        // lands before the book/chapter advance), and a stale render
        // must never fetch the just-ended chapter.
        const {
          activeBookId,
          activeChapter,
          activeAudioFilesetId,
        } = useBibleStore.getState();

        // A fetch still in flight from a previous run loses to this
        // one — its post-await token check discards the Howl.
        if (loadInFlightRef.current) {
          loadSeqRef.current += 1;
        }
        loadInFlightRef.current = true;
        const seq = loadSeqRef.current;

        try {
          const resolved = resolveCandidates(
            activeBookId,
            activeAudioFilesetId,
          );
          // If no audio fileset is selected, do nothing.
          if (!resolved) {
            setIsPlaying(false);
            setLoading(false);
            return;
          }
          const candidates = resolved.candidates;

          // Earliest selected verse in this chapter — playback
          // starts at its timestamp instead of 0. Only the
          // bible-scoped selection counts; note-card selections
          // ('note:<id>') and refs in other chapters are ignored.
          const startVerse = selectedStartVerse(
            useBibleStore.getState().verseSelection,
            activeBookId,
            activeChapter,
          );

          // Kick off the timestamp lookup in parallel with the
          // audio fetch so a slow request doesn't delay the start
          // (getAudioTimestamps is cache-first and the timestamps
          // effect usually warmed it). ENGKJV audio has no verse
          // timestamps — it keeps starting at 0.
          const startTsPromise = verseStartTimestamp(
            activeBookId,
            activeChapter,
            resolved.filesetId,
            useBibleStore.getState().activeTextFilesetId,
            useBibleStore.getState().translations,
            startVerse,
          );

          let key = chapterKey(
            resolved.filesetId,
            activeBookId,
            activeChapter,
          );
          const pre = preloadedRef.current;
          let audioHowl: Howl;

          if (
            pre &&
            pre.key === key &&
            pre.howl.state() !== 'unloaded'
          ) {
            // Adopt the Howl pre-created while the previous chapter
            // played — its bytes are already local.
            preloadedRef.current = null;
            audioHowl = pre.howl;
            activeBlobUrlRef.current = pre.blobUrl;
            wireChapterHowlRef.current(audioHowl);
            audioHowl.loop(isLoopingRef.current);
            // Arm fallback for the adopted chapter too — a decode
            // failure on it must walk this product's candidates,
            // not the previous chapter's (already consumed) list.
            const adopted = candidates.indexOf(resolved.filesetId);
            fallbackRef.current = {
              seq,
              ids: candidates,
              nextIndex: adopted >= 0 ? adopted + 1 : 1,
              bookId: activeBookId,
              chapter: activeChapter,
            };
          } else {
            if (pre) discardPreloaded();

            // Walk candidates in order — a book outside the
            // fileset's coverage (BookNotInFilesetError) tries the
            // next alternate; other fetch errors abort.
            let audioUrl: string | null = null;
            let nextIndex = 0;
            while (nextIndex < candidates.length) {
              const candidate = candidates[nextIndex];
              nextIndex += 1;
              try {
                audioUrl = await resolveAudioUrl(
                  activeBookId,
                  activeChapter,
                  candidate,
                );
                if (audioUrl && typeof audioUrl === 'string') {
                  key = chapterKey(
                    candidate,
                    activeBookId,
                    activeChapter,
                  );
                  break;
                }
                audioUrl = null;
              } catch (err) {
                if (seq !== loadSeqRef.current) return;
                if (err instanceof BookNotInFilesetError) continue;
                throw err;
              }
            }

            // A teardown/advance (or a newer load) superseded this
            // fetch while it was in flight — do not materialize
            // its Howl.
            if (seq !== loadSeqRef.current) return;

            // A pause or player close that landed while the fetch
            // was in flight wins — never materialize a Howl that
            // would immediately start playing, and clear the
            // spinner.
            if (!isPlayingRef.current) {
              setLoading(false);
              return;
            }

            if (audioUrl === null) {
              throw new BookNotInFilesetError(
                `No audio for ${activeBookId} ${activeChapter}`
              );
            }

            // Remaining candidates are consumed on Howler
            // load/play errors (codec fallback: opus16 → mp3
            // is always the first retry).
            fallbackRef.current = {
              seq,
              ids: candidates,
              nextIndex,
              bookId: activeBookId,
              chapter: activeChapter,
            };

            audioHowl = new Howl({
              src: [audioUrl],
              html5: true,
              pool: 1,
              loop: isLoopingRef.current,
              onplay: handleChapterPlay,
              onpause: handleChapterPause,
              onend: () => onChapterEnd(audioHowl),
              onloaderror: handleChapterLoadError,
              onplayerror: handleChapterPlayError,
            });
            activeBlobUrlRef.current = null;
          }

          // An adopted preload path reaches here without
          // awaiting — the isPlaying intent cannot have flipped
          // mid-branch — but a pause during a fetch above was
          // already screened. Belt and braces: never publish a
          // Howl that would immediately play against intent.
          if (!isPlayingRef.current) {
            disposeHowl(audioHowl, activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
            setLoading(false);
            return;
          }
          audioChapterKeyRef.current = key;
          setAudio(audioHowl);
          audioRef.current = audioHowl;

          // Seek to the selected verse. A still-loading Howl is
          // covered by 'load'; an already-loaded one (e.g. the
          // adopted preload) seeks right away. A superseded load
          // skips the seek — the reset effect owns its teardown,
          // and disposeHowl's off() detaches the listener anyway.
          const startTs = await startTsPromise;
          if (seq === loadSeqRef.current && startTs > 0) {
            seekHowlWhenLoaded(audioHowl, startTs);
          }
        } catch (err) {
          // A superseded load must not surface errors or flip
          // playback state — the winning run owns both.
          if (seq !== loadSeqRef.current) return;

          console.error('Error loading audio:', err);
          // Coverage gaps only surface here after every resolved
          // alternate was tried — report the book/translation pair.
          reportChapterAudioFailure(err, activeBookId);
        } finally {
          // Only the run still owning the sequence clears the flag
          // — a superseded run must not mask a newer load.
          if (seq === loadSeqRef.current) {
            loadInFlightRef.current = false;
          }
        }
      }
    };

    void loadAndPlayAudio();
  }, [
    isPlaying,
    audio,
    safePlay,
    safePause,
    scheduleChapterPlay,
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    resolveCandidates,
    resolveAudioUrl,
    discardPreloaded,
    onChapterEnd,
    handleChapterPlay,
    handleChapterPause,
    handleChapterLoadError,
    handleChapterPlayError,
    reportChapterAudioFailure,
    setShowPlayer,
  ]);

  const handleClose = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setShowPlayer(false);
    // Invalidate any in-flight load/fallback fetch — without this
    // bump a pending resolve materializes a fresh Howl and
    // re-registers media-session handlers for a closed player.
    loadSeqRef.current += 1;
    clearAdvanceTimer();
    pendingGapRef.current = false;
    setAudioActiveVerse(null);
    discardPreloaded();
    disposeHowl(audio, activeBlobUrlRef.current);
    activeBlobUrlRef.current = null;
    audioChapterKeyRef.current = null;
    audioRef.current = null;
    setAudio(null);
  };

  return {
    audio,
    audioRef,
    isPlaying,
    setIsPlaying,
    loading,
    setLoading,
    error,
    isLooping,
    setIsLooping,
    timestamps,
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    translations,
    safePlay,
    safePause,
    safeSeek,
    advanceChapter,
    handleClose,
  };
};
