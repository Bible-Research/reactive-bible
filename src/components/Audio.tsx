import { useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBibleStore } from "../store";
import { ActionIcon, rem, Loader } from "@mantine/core";
import {
  IconPlayerPlay,
  IconAlertCircle,
  IconPlayerPause,
} from "@tabler/icons-react";
import AudioPlayer from "./AudioPlayer";
import { localizedBookName, buildBiblePath } from "../utils/bibleUtils";
import { findTranslationByFilesetId } from "../utils/filesetGroups";
import { getPlayPosition } from "../utils/audioUtils";
import {
  verseNavTarget,
  type VerseNavState,
} from "../utils/verseNav";
import { verseDomId } from "../utils/verseRefs";
import { useAudioPlaylist } from "../hooks/useAudioPlaylist";
import { useAudioKeepAlive } from "../hooks/useAudioKeepAlive";
import { useChapterAudio } from "../hooks/useChapterAudio";
import { useActiveStructure } from "../hooks/useBookName";
import {
  useMediaSession,
  MediaSessionControls,
  MediaSessionMetadata,
  MediaSessionPosition,
} from "../hooks/useMediaSession";

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

  const showPlayer = useBibleStore((state) => state.showAudioPlayer);
  const setShowPlayer = useBibleStore(
    (state) => state.setShowAudioPlayer
  );
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
      // visible. `scope` (the note id) names the DOM ids;
      // itemId is unique per chapter block.
      document
        .getElementById(
          verseDomId(item.scope ?? item.itemId, {
            bookId: item.bookId,
            chapter: item.chapter,
            verse: item.startVerse,
          })
        )
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    void navigate(
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

  // Stop an orphaned playlist. The route that built it (notes,
  // search) clears `audioPlaylistItems` on unmount — without this
  // the hook keeps playing invisibly, and the auto-navigation
  // effect above pulls the user back to the playing item's chapter
  // on every advance, so a manual chapter click only seemed to
  // take effect once the current item finished.
  const playlistActive = playlist.isActive;
  const stopPlaylist = playlist.stop;
  useEffect(() => {
    if (!isPlaylistMode && playlistActive) {
      stopPlaylist();
    }
  }, [isPlaylistMode, playlistActive, stopPlaylist]);

  // Chapter-mode audio engine (non-playlist): Howl lifecycle,
  // verse timestamps, auto-advance, preload, fallback walk.
  const {
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
  } = useChapterAudio(isPlaylistMode);

  // Last applied verse-nav step — lets repeat same-direction
  // presses chain off the last target (see verseNavTarget).
  const lastNavRef = useRef<VerseNavState | null>(null);
  // A new Howl means a chapter/recording change — the chain
  // must not step a fresh recording from an old target.
  useEffect(() => {
    lastNavRef.current = null;
  }, [audio]);

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

  // Structure swap must rebuild the media title's book name.
  const activeStructure = useActiveStructure();

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
    // Read the name off the subscribed structure — its
    // identity change is also this memo's invalidation
    // signal when a fresher structure swaps in.
    const bookRow = activeStructure?.books.find(
      (b) => b.book_id === activeBookId.toUpperCase(),
    );
    const bookLabel =
      bookRow?.name ?? localizedBookName(activeBookId);
    return {
      title: `${bookLabel ?? activeBookId} ` +
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
    activeStructure,
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
    // Repeat presses in one direction chain off the last seek
    // target (see verseNavTarget) — needed because the audio
    // element applies seeks asynchronously and a follow-up press
    // would otherwise compute from a stale position.
    const trackNav = (direction: 1 | -1) => {
      const pos = getPlayPosition(audioRef.current);
      if (pos === null) return;
      const now = Date.now();
      const result = verseNavTarget(
        timestamps,
        pos,
        direction,
        lastNavRef.current,
        now,
      );
      if (result.kind === 'chapter') {
        lastNavRef.current = null;
        advanceChapter(result.direction);
        return;
      }
      lastNavRef.current = {
        direction,
        before: pos,
        target: result.time,
        at: now,
      };
      safeSeek(result.time);
    };
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
      nextTrack: () => trackNav(1),
      previousTrack: () => trackNav(-1),
      seekBy: (offset) => {
        const pos = getPlayPosition(audioRef.current);
        if (pos === null) return;
        // An outside seek breaks the nav chain.
        lastNavRef.current = null;
        safeSeek(pos + offset);
      },
      seekTo: (time) => {
        if (!Number.isFinite(time)) return;
        lastNavRef.current = null;
        safeSeek(time);
      },
    };
  }, [
    isPlaylistMode,
    playlist,
    audioRef,
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
  }, [isPlaylistMode, playlist.audio, audioRef]);

  useMediaSession({
    active: mediaActive,
    isPlaying: mediaIsPlaying,
    metadata: mediaMetadata,
    controls: mediaControls,
    getPosition: getMediaPosition,
  });

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
    // While the fetch is in flight there is nothing to pause
    // yet — the button acts as a cancel so a hung request
    // (getBibleAudioUrl has no timeout) can never wedge the
    // spinner. The in-flight load sees isPlaying go false and
    // discards its result.
    if (loading) {
      setIsPlaying(false);
      setLoading(false);
      // No Howl will ever arrive for a cancelled load — release
      // the player's reserved space (a hung fetch would never
      // reach the mid-flight bail that closes it).
      setShowPlayer(false);
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
        title={
          isPlaylistMode
            ? playlistPlaying
              ? "Pause playlist"
              : "Play all notes"
            : error ||
              (loading
                ? "Cancel loading"
                : isPlaying
                  ? "Pause audio"
                  : "Play audio")
        }
      >
        {!isPlaylistMode && loading ? (
          <Loader size={rem(20)} />
        ) : !isPlaylistMode && error ? (
          <IconAlertCircle size={rem(20)} color="orange" />
        ) : playlistPlaying || chapterPlaying ? (
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
                  void navigate(
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
