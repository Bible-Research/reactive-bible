import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import {
  getKjvAudioUrl,
  getBibleAudioUrl,
  getAudioTimestamps,
  getAdjacentChapters,
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
  getTestament,
  toBookName,
  buildBiblePath,
  filesetCoversTestament,
  resolveTimestampsFilesetId,
  adjustTimestampsForENGESV,
  findTestamentFallback,
} from "../utils/bibleUtils";
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

const MEDIA_ARTWORK: MediaImage[] = [
  { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
];

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
  const activeBlobUrlRef = useRef<string | null>(null);
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

  // Resolve which audio fileset actually serves a book, applying
  // the OT/NT fallback the API needs (e.g. ENGESV splits filesets
  // by testament). Reads store state so it is always current.
  const resolveFilesetFor = useCallback(
    (bookId: string, filesetId: string | null): string | null => {
      if (!filesetId || filesetId === 'ENGKJV') return filesetId;
      const testament = getTestament(bookId);
      const allFilesets = useBibleStore
        .getState()
        .translations.flatMap((t) => t.filesets);
      const fileset = allFilesets.find((f) => f.id === filesetId);
      if (
        testament &&
        fileset &&
        !filesetCoversTestament(fileset.size, testament)
      ) {
        return (
          findTestamentFallback(filesetId, testament, allFilesets) ??
          filesetId
        );
      }
      return filesetId;
    },
    [],
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
        // stop() halts playback immediately; unload() alone can let
        // the underlying html5 <audio> element keep playing for a
        // few seconds until the next chapter finishes loading.
        try {
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
      state.setActiveBookAndChapter(target.bookId, target.chapter);
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
    const filesetId = resolveFilesetFor(
      state.activeBookId,
      state.activeAudioFilesetId,
    );
    const { next } = getAdjacentChapters(
      state.activeBookId,
      state.activeChapter,
    );
    if (!next || !filesetId) return;
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
        const howl = new Howl({
          src: [src],
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
    preloadNextChapter();
  }, [preloadNextChapter]);

  const handleChapterPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleChapterLoadError = useCallback(
    (_id: number, err: unknown) => {
      console.error('Audio load error:', err);
      setError('Failed to load audio');
      setIsPlaying(false);
      setLoading(false);
    },
    [],
  );

  const handleChapterPlayError = useCallback(
    (_id: number, err: unknown) => {
      console.error('Audio play error:', err);
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
  // starting it inside the `ended` event chain keeps the media
  // pipeline alive and needs neither a fetch nor a new <audio>
  // element — the two things that break auto-advance on a frozen
  // lock screen.
  const onChapterEnd = useCallback(
    (finished: Howl) => {
      // Defensive: onend shouldn't fire when looping.
      if (finished.loop()) return;

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
          setAudio(nextHowl);
          nextHowl.play();
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

      if (!advanceChapter(1)) {
        // No next chapter — stop playing.
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

  // Reset chapter audio when chapter/book/version changes
  // (non-playlist only)
  useEffect(() => {
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
    setAudioActiveVerse,
  ]);

  // Fetch timestamps when audio or text fileset changes
  useEffect(() => {
    if (!activeAudioFilesetId) return;
    const tsFilesetId = resolveTimestampsFilesetId(
      activeAudioFilesetId,
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
  }, [activeBookId, activeChapter, activeAudioFilesetId, activeTextFilesetId]);

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
    const currentAudio = audioRef.current;
    if (!currentAudio || !currentAudio.playing()) return;
    try {
      currentAudio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } catch (err) {
      console.warn('Pause operation failed:', err);
    }
  }, []);

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
      translations.find((t) =>
        t.filesets.some((f) => f.id === activeAudioFilesetId),
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
        advanceChapter(1);
      },
      previousTrack: () => {
        const pos = getPlayPosition(audioRef.current);
        // Media-player convention: restart the chapter unless we
        // are already at (or near) the beginning.
        if (pos !== null && pos > 3) {
          safeSeek(0);
          return;
        }
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
        safePlay();
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

        try {
          const filesetId = resolveFilesetFor(
            activeBookId,
            activeAudioFilesetId,
          );
          // If no audio fileset is selected, do nothing.
          if (!filesetId) {
            setIsPlaying(false);
            setLoading(false);
            return;
          }

          const key = chapterKey(filesetId, activeBookId, activeChapter);
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
          } else {
            if (pre) discardPreloaded();
            const audioUrl = await resolveAudioUrl(
              activeBookId,
              activeChapter,
              filesetId,
            );

            // Validate audio URL
            if (!audioUrl || typeof audioUrl !== 'string') {
              throw new Error(
                `Invalid audio URL: ${audioUrl} for ${filesetId}`
              );
            }

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
          console.error('Error loading audio:', err);

          // Extract user-friendly error message
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

          // Build a testament-aware hint for the notification
          const state = useBibleStore.getState();
          const testament = getTestament(activeBookId);
          const fileset = state.translations
            .flatMap((t) => t.filesets)
            .find((f) => f.id === activeAudioFilesetId);
          let hint =
            'Try selecting a different audio version in the ' +
            'Translation Settings ("Change Translation" button).';
          if (
            testament &&
            fileset &&
            !filesetCoversTestament(fileset.size, testament)
          ) {
            const covered = fileset.size.toUpperCase().startsWith('NT')
              ? 'New Testament'
              : 'Old Testament';
            const needed =
              testament === 'OT' ? 'Old Testament' : 'New Testament';
            hint =
              `The selected audio version (${activeAudioFilesetId}) only ` +
              `covers the ${covered}. Try selecting a ${needed} audio ` +
              `version in the Translation Settings.`;
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
        }
      }
    };

    void loadAndPlayAudio();
  }, [
    isPlaying,
    audio,
    safePlay,
    safePause,
    activeBookId,
    activeChapter,
    activeAudioFilesetId,
    resolveFilesetFor,
    resolveAudioUrl,
    discardPreloaded,
    onChapterEnd,
    handleChapterPlay,
    handleChapterPause,
    handleChapterLoadError,
    handleChapterPlayError,
    setShowPlayer,
  ]);

  const handleClose = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setShowPlayer(false);
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
                  const item = playlist.currentItem!;
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
