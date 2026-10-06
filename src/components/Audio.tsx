import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { ActionIcon, rem, Loader } from "@mantine/core";
import {
  IconPlayerPlay,
  IconAlertCircle,
  IconPlayerPause,
} from "@tabler/icons-react";
import AudioPlayer from "./AudioPlayer";
import { useVerseHighlighter } from "../hooks/useVerseHighlighter";
import { VerseTimestamp } from "../types";
import { showNotification } from "@mantine/notifications";
import {
  toBookName,
  buildBiblePath,
  resolveTimestampsFilesetId,
  adjustTimestampsForENGESV,
} from "../utils/bibleUtils";
import {
  findTranslationByFilesetId,
  resolveAudioFileset,
  splitCodec,
  type CodecKey,
} from "../utils/filesetGroups";
import { getPlayPosition } from "../utils/audioUtils";
import { verseDomId } from "../utils/verseRefs";
import { useAudioPlaylist } from "../hooks/useAudioPlaylist";
import { useAudioKeepAlive } from "../hooks/useAudioKeepAlive";
import {
  useMediaSession,
  MediaSessionControls,
  MediaSessionMetadata,
  MediaSessionPosition,
} from "../hooks/useMediaSession";

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

const MEDIA_ARTWORK: MediaImage[] = [
  { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
];

// Brief silence between chapters on auto-advance.
const INTER_CHAPTER_GAP_MS = 2000;

const Audio = () => {
  const playlist = useAudioPlaylist();
  const audioPlaylistItems = useBibleStore(
    (s) => s.audioPlaylistItems
  );
  const isPlaylistMode =
    audioPlaylistItems != null && audioPlaylistItems.length > 0;

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
    useBibleStore((state) => ({
      activeAudioFilesetId: state.activeAudioFilesetId,
      activeTextFilesetId: state.activeTextFilesetId,
      translations: state.translations,
    }));
  const showPlayer = useBibleStore((state) => state.showAudioPlayer);
  const setShowPlayer = useBibleStore((state) => state.setShowAudioPlayer);
  const audioPlaylistStartIndex = useBibleStore(
    (s) => s.audioPlaylistStartIndex
  );
  const setAudioPlaylistStartIndex = useBibleStore(
    (s) => s.setAudioPlaylistStartIndex
  );
  const navigate = useNavigate();
  const location = useLocation();

  // Navigate to the playing item's chapter so Verse components
  // are in the DOM and can receive the audioActiveVerse highlight
  // Skip navigation on search or notes pages
  // (they handle their own UI)
  useEffect(() => {
    const item = playlist.currentItem;
    if (!item) return;
    if (location.pathname === '/search') return;
    if (location.pathname.startsWith('/notes')) {
      // Notes pages render note cards — scroll to the playing
      // card's first verse so the audio-follow highlight is
      // visible.
      document
        .getElementById(
          verseDomId(item.itemId, {
            bookId: item.bookId,
            chapter: item.chapter,
            verse: item.startVerse,
          })
        )
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    navigate(
      buildBiblePath(item.bookId, item.chapter, [item.startVerse]),
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.currentItem?.itemId]);

  // Start playlist when an external component signals a start index
  useEffect(() => {
    if (
      audioPlaylistStartIndex === null ||
      !audioPlaylistItems ||
      audioPlaylistItems.length === 0
    ) return;
    setAudioPlaylistStartIndex(null);
    playlist.start(audioPlaylistItems, audioPlaylistStartIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPlaylistStartIndex]);

  // Resolve which audio fileset actually serves a book through
  // the grouped "audio product" (testament splits, opus16/mp3
  // codec pairs, generated voices). Reads store state so it is
  // always current.
  const resolveAudio = useCallback(
    (bookId: string, filesetId: string | null) =>
      resolveAudioFileset(
        filesetId,
        bookId,
        useBibleStore.getState().translations,
      ),
    [],
  );

  // Ordered candidates for a book with the codec that last
  // played for this selection moved to the front — after an
  // opus16 decode failure the mp3 sibling leads the next
  // chapter's load and preload instead of re-picking opus16.
  const resolveCandidates = useCallback(
    (
      bookId: string,
      filesetId: string | null,
    ): { filesetId: string; candidates: string[] } | null => {
      const resolved = resolveAudio(bookId, filesetId);
      if (!resolved) return null;
      const candidates = [
        resolved.filesetId,
        ...resolved.alternates,
      ];
      const remembered = filesetId
        ? workingCodecRef.current.get(filesetId)
        : undefined;
      if (remembered) {
        const i = candidates.findIndex(
          (id) => splitCodec(id).codec === remembered,
        );
        if (i > 0) candidates.unshift(candidates.splice(i, 1)[0]);
      }
      return { filesetId: candidates[0], candidates };
    },
    [resolveAudio],
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

  const disposeHowl = useCallback(
    (howl: Howl | null, blobUrl: string | null = null) => {
      if (howl) {
        // Detach listeners first: clearing the node's src during
        // unload() rejects a still-pending play() request, and
        // the resulting playerror is teardown noise that must not
        // surface as a user-facing playback error.
        // volume(0) silences the node even if the pooled <audio>
        // element drains buffered audio after release — mute(true)
        // would set node.muted, which the pool never resets and
        // would silence the NEXT chapter's Howl. stop() halts
        // playback immediately — unload() alone can let the
        // underlying html5 <audio> element keep playing for a few
        // seconds until the next chapter finishes loading.
        try {
          howl.off();
          howl.volume(0);
          howl.stop();
          howl.unload();
        } catch (err) {
          console.warn('Failed to dispose chapter audio:', err);
        }
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [],
  );

  const discardPreloaded = useCallback(() => {
    // Invalidate any in-flight preload so it cannot write a stale
    // record after this discard.
    preloadTokenRef.current += 1;
    const pre = preloadedRef.current;
    preloadedRef.current = null;
    if (pre) disposeHowl(pre.howl, pre.blobUrl);
  }, [disposeHowl]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  // Start `howl` after the inter-chapter gap. The guard keeps a
  // Howl torn down during the pause from resurrecting.
  const scheduleChapterPlay = useCallback(
    (howl: Howl) => {
      clearAdvanceTimer();
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        if (
          audioRef.current !== howl ||
          howl.state() === 'unloaded'
        ) {
          return;
        }
        howl.play();
      }, INTER_CHAPTER_GAP_MS);
    },
    [clearAdvanceTimer],
  );

  // Navigate one chapter forward/backward. Returns false when there
  // is no adjacent chapter in that direction.
  const advanceChapter = useCallback(
    (direction: 1 | -1): boolean => {
      const state = useBibleStore.getState();
      const { previous, next } = getAdjacentChapters(
        state.activeBookId,
        state.activeChapter,
      );
      const target = direction === 1 ? next : previous;
      if (!target) return false;
      // Navigate only — BibleRoute syncs the store from the URL.
      // Writing the store first would let a commit see the old URL
      // with the new chapter; the route's URL->store sync would
      // then revert the advance and tear down the adopted Howl
      // mid-play.
      navigate(buildBiblePath(target.bookId, target.chapter), {
        replace: true,
      });
      return true;
    },
    [navigate],
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

      const state = useBibleStore.getState();
      const { next } = getAdjacentChapters(
        state.activeBookId,
        state.activeChapter,
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
          // Update book/chapter state + URL. The reset effect sees
          // audioChapterKeyRef match and keeps this Howl playing.
          advanceChapter(1);
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
      if (!advanceChapter(1)) {
        // No next chapter — stop playing.
        pendingGapRef.current = false;
        setIsPlaying(false);
      }
    },
    [advanceChapter, disposeHowl, resolveFilesetFor],
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
        // chapter-key check stops a superseded load's late
        // error from starting a fallback for a passage the user
        // already navigated away from.
        const keyNow = audioChapterKeyRef.current;
        if (!keyNow) return false;
        const [playingId, bookId, chapter] = keyNow.split(':');
        if (
          bookId !== state.activeBookId ||
          Number(chapter) !== state.activeChapter
        ) {
          return false;
        }
        const resolved = resolveCandidates(
          state.activeBookId,
          state.activeAudioFilesetId,
        );
        if (!resolved) return false;
        const i = resolved.candidates.indexOf(playingId);
        pending = {
          seq: loadSeqRef.current,
          ids: resolved.candidates,
          nextIndex: i >= 0 ? i + 1 : 1,
        };
        fallbackRef.current = pending;
      }
      const nextId = pending.ids[pending.nextIndex];
      if (!nextId) return false;
      pending.nextIndex += 1;
      const { activeBookId, activeChapter } = state;
      void (async () => {
        try {
          const url = await resolveAudioUrl(
            activeBookId,
            activeChapter,
            nextId,
          );
          if (pending.seq !== loadSeqRef.current) return;
          if (!url || typeof url !== 'string') {
            tryNextFallbackRef.current();
            return;
          }
          // Swap out the failed Howl for the new candidate.
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
            activeBookId,
            activeChapter,
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
          reportChapterAudioFailure(err, activeBookId);
        }
      })();
      return true;
    };
  });

  // Reset chapter audio when chapter/book/version changes
  // (non-playlist only)
  useEffect(() => {
    // Every run means the passage or mode changed — supersede any
    // chapter load still in flight; its post-await token check
    // will discard the result.
    loadSeqRef.current += 1;
    if (isPlaylistMode) return;
    const key = chapterKey(
      resolveFilesetFor(activeBookId, activeAudioFilesetId),
      activeBookId,
      activeChapter,
    );
    const current = audioRef.current;
    if (current && audioChapterKeyRef.current === key) {
      // The ended handler already adopted the preloaded Howl for
      // this chapter — keep it playing.
      setTimestamps([]);
      setAudioActiveVerse(null);
      return;
    }
    if (current) {
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
    discardPreloaded();
    setTimestamps([]);
    setAudioActiveVerse(null);
  }, [
    isPlaylistMode,
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    resolveFilesetFor,
    disposeHowl,
    discardPreloaded,
    clearAdvanceTimer,
    setAudioActiveVerse,
  ]);

  // Fetch timestamps when audio or text fileset changes
  useEffect(() => {
    if (!activeAudioFilesetId) return;
    const tsFilesetId = resolveTimestampsFilesetId(
      resolveFilesetFor(activeBookId, activeAudioFilesetId),
      activeTextFilesetId,
      activeBookId,
    );
    if (!tsFilesetId) return;
    getAudioTimestamps(
      activeBookId,
      activeChapter,
      tsFilesetId,
    ).then((ts) => {
      const adjusted = adjustTimestampsForENGESV(
        ts,
        activeAudioFilesetId,
      );
      setTimestamps(adjusted);
    });
  }, [
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    activeTextFilesetId,
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

  // ----- Unified Media Session wiring (single global owner) -----
  const translationName = useMemo(
    () =>
      findTranslationByFilesetId(
        activeAudioFilesetId,
        translations,
      )?.name || 'Bible Audio',
    [translations, activeAudioFilesetId],
  );

  const mediaActive = isPlaylistMode ? playlist.isActive : audio !== null;
  const mediaIsPlaying = isPlaylistMode ? playlist.isPlaying : isPlaying;

  // Keep the WebView alive for lock-screen playback in the
  // Capacitor shell (no-op in the browser).
  useAudioKeepAlive(mediaActive, mediaIsPlaying);

  const mediaMetadata = useMemo<MediaSessionMetadata | null>(() => {
    if (isPlaylistMode) {
      if (!playlist.currentItem) return null;
      return {
        title: playlist.currentItem.label,
        artist: translationName,
        album: 'Bible Audio',
        artwork: MEDIA_ARTWORK,
      };
    }
    if (!audio) return null;
    return {
      title: `${toBookName(activeBookId) ?? activeBookId} ` +
        `${activeChapter}`,
      artist: translationName,
      album: 'Bible Audio',
      artwork: MEDIA_ARTWORK,
    };
  }, [
    isPlaylistMode,
    playlist.currentItem,
    audio,
    activeBookId,
    activeChapter,
    translationName,
  ]);

  const mediaControls = useMemo<MediaSessionControls>(() => {
    if (isPlaylistMode) {
      const seekRelative = (offset: number) => {
        const a = playlist.audio;
        const pos = getPlayPosition(a);
        if (!a || pos === null) return;
        const duration = a.duration();
        const target = Math.max(
          0,
          Math.min(duration || Infinity, pos + offset),
        );
        a.seek(target);
      };
      const seekAbsolute = (time: number) => {
        const a = playlist.audio;
        if (!a || a.state() !== 'loaded') return;
        if (!Number.isFinite(time)) return;
        a.seek(time);
      };
      return {
        play: () => playlist.resume(),
        pause: () => playlist.pause(),
        stop: () => playlist.stop(),
        nextTrack: () => playlist.next(),
        previousTrack: () => playlist.previous(),
        seekBy: seekRelative,
        seekTo: seekAbsolute,
      };
    }
    return {
      play: () => {
        void safePlay();
      },
      pause: () => {
        void safePause();
      },
      stop: () => {
        void safePause();
      },
      nextTrack: () => {
        const pos = getPlayPosition(audioRef.current);
        if (pos === null) return;
        if (timestamps.length === 0) {
          // No verse timestamps (e.g. KJV) — seek forward 10s.
          safeSeek(pos + 10);
          return;
        }
        // Jump to the next verse's start. The 0.5s epsilon means
        // a press right on a verse boundary still lands on the
        // following verse.
        const nextVerse = timestamps.find(
          (t) => t.timestamp > pos + 0.5,
        );
        if (nextVerse) {
          safeSeek(nextVerse.timestamp);
          return;
        }
        // Already in the last verse — next chapter.
        advanceChapter(1);
      },
      previousTrack: () => {
        const pos = getPlayPosition(audioRef.current);
        if (pos === null) return;
        if (timestamps.length === 0) {
          // No verse timestamps (e.g. KJV) — seek backward 10s.
          safeSeek(pos - 10);
          return;
        }
        // Index of the verse currently playing; -1 when the
        // position precedes verse 1 (e.g. a chapter
        // announcement).
        const idx = timestamps.reduce(
          (acc, t, i) => (t.timestamp <= pos ? i : acc),
          -1,
        );
        // Media-player convention: restart the verse when we are
        // more than 2s into it.
        if (idx >= 0 && pos - timestamps[idx].timestamp > 2) {
          safeSeek(timestamps[idx].timestamp);
          return;
        }
        // Near a verse boundary — jump to the previous verse.
        if (idx > 0) {
          safeSeek(timestamps[idx - 1].timestamp);
          return;
        }
        // At (or before) verse 1 — previous chapter.
        advanceChapter(-1);
      },
      seekBy: (offset) => {
        const pos = getPlayPosition(audioRef.current);
        if (pos === null) return;
        safeSeek(pos + offset);
      },
      seekTo: (time) => {
        if (Number.isFinite(time)) safeSeek(time);
      },
    };
  }, [
    isPlaylistMode,
    playlist,
    safePlay,
    safePause,
    safeSeek,
    advanceChapter,
    timestamps,
  ]);

  const getMediaPosition = useCallback((): MediaSessionPosition | null => {
    const a = isPlaylistMode ? playlist.audio : audioRef.current;
    const pos = getPlayPosition(a);
    if (!a || pos === null) return null;
    return {
      duration: a.duration(),
      position: pos,
      playbackRate: 1,
    };
  }, [isPlaylistMode, playlist.audio]);

  useMediaSession({
    active: mediaActive,
    isPlaying: mediaIsPlaying,
    metadata: mediaMetadata,
    controls: mediaControls,
    getPosition: getMediaPosition,
  });

  useEffect(() => {
    const loadAndPlayAudio = async () => {
      if (isPlaying && audio !== null) {
        if (pendingGapRef.current) {
          // This chapter arrived via auto-advance — start it
          // after the inter-chapter gap, not immediately.
          pendingGapRef.current = false;
          scheduleChapterPlay(audio);
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

            if (audioUrl === null) {
              throw new BookNotInFilesetError(
                `No audio for ${activeBookId} ${activeChapter}`
              );
            }

            // Remaining candidates are consumed on Howler
            // load/play errors (codec fallback: opus16 → mp3
            // is always the first retry).
            fallbackRef.current = { seq, ids: candidates, nextIndex };

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

          audioChapterKeyRef.current = key;
          setAudio(audioHowl);
          audioRef.current = audioHowl;
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
    clearAdvanceTimer();
    pendingGapRef.current = false;
    discardPreloaded();
    disposeHowl(audio, activeBlobUrlRef.current);
    activeBlobUrlRef.current = null;
    audioChapterKeyRef.current = null;
    audioRef.current = null;
    setAudio(null);
  };

  const handlePlaylistClose = () => {
    playlist.stop();
    setShowPlayer(false);
  };

  const handlePlayPause = () => {
    if (isPlaylistMode) {
      if (!playlist.isActive) {
        playlist.start(audioPlaylistItems);
      } else if (playlist.isPlaying) {
        playlist.pause();
      } else {
        playlist.resume();
      }
      return;
    }
    setIsPlaying((value) => !value);
    setShowPlayer(true);
  };

  const playlistPlaying = isPlaylistMode && playlist.isPlaying;
  const chapterPlaying = !isPlaylistMode && isPlaying;

  return (
    <>
      <ActionIcon
        variant="transparent"
        onClick={handlePlayPause}
        disabled={!isPlaylistMode && loading}
        title={
          isPlaylistMode
            ? playlistPlaying
              ? "Pause playlist"
              : "Play all notes"
            : error || (isPlaying ? "Playing..." : "Play audio")
        }
      >
        {!isPlaylistMode && loading ? (
          <Loader size={rem(20)} />
        ) : !isPlaylistMode && error ? (
          <IconAlertCircle size={rem(20)} color="orange" />
        ) : playlistPlaying ? (
          <IconPlayerPause size={rem(20)} />
        ) : (
          <IconPlayerPlay size={rem(20)} />
        )}
      </ActionIcon>

      {isPlaylistMode && showPlayer && playlist.audio && (
        <AudioPlayer
          audio={playlist.audio}
          isPlaying={playlistPlaying}
          isLooping={isLooping}
          onPlayPause={handlePlayPause}
          onLoopToggle={() => setIsLooping((value) => !value)}
          onClose={handlePlaylistClose}
          subtitle={playlist.currentItem?.label}
          onFocus={
            playlist.currentItem
              ? () => {
                  const item = playlist.currentItem;
                  if (!item) return;
                  navigate(
                    buildBiblePath(
                      item.bookId,
                      item.chapter,
                      [item.startVerse],
                    ),
                  );
                }
              : undefined
          }
        />
      )}

      {!isPlaylistMode && showPlayer && audio && (
        <AudioPlayer
          audio={audio}
          isPlaying={chapterPlaying}
          isLooping={isLooping}
          onPlayPause={() => setIsPlaying((value) => !value)}
          onLoopToggle={() => setIsLooping((value) => !value)}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default Audio;
