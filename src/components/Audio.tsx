import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import { getKjvAudioUrl, getBibleAudioUrl, getAudioTimestamps, getPassage } from "../api";
import { ActionIcon, rem, Loader } from "@mantine/core";
import { IconPlayerPlay, IconAlertCircle, IconPlayerPause } from "@tabler/icons-react";
import AudioPlayer from "./AudioPlayer";
import { useVerseHighlighter } from "../hooks/useVerseHighlighter";
import { VerseTimestamp } from "../types";
import { showNotification } from "@mantine/notifications";
import {
  getTestamentByBookName,
  filesetCoversTestament,
  resolveTimestampsFilesetId,
  adjustTimestampsForENGESV,
  findTestamentFallback,
} from "../utils/bibleUtils";
import { useAudioPlaylist } from "../hooks/useAudioPlaylist";
import {
  useMediaSession,
  MediaSessionControls,
  MediaSessionMetadata,
  MediaSessionPosition,
} from "../hooks/useMediaSession";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [timestamps, setTimestamps] = useState<VerseTimestamp[]>([]);
  const activeBook = useBibleStore((state) => state.activeBook);
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
  const setActiveBookOnly = useBibleStore((state) => state.setActiveBookOnly);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const navigate = useNavigate();
  const location = useLocation();
  const getPassageResult = getPassage();

  // Navigate to the playing item's chapter so Verse components
  // are in the DOM and can receive the audioActiveVerse highlight
  // Skip navigation if we're on search or notes pages (they handle their own UI)
  useEffect(() => {
    const item = playlist.currentItem;
    if (!item) return;
    if (location.pathname === '/search') return;
    if (location.pathname.startsWith('/notes')) return;
    navigate(
      `/bible/${item.book}/${item.chapter}.${item.startVerse}`,
      { replace: true },
    );
  }, [playlist.currentItem?.itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start playlist when an external component signals a start index
  useEffect(() => {
    if (
      audioPlaylistStartIndex === null ||
      !audioPlaylistItems ||
      audioPlaylistItems.length === 0
    ) return;
    setAudioPlaylistStartIndex(null);
    playlist.start(audioPlaylistItems, audioPlaylistStartIndex);
  }, [audioPlaylistStartIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset chapter audio when chapter/book/version changes (non-playlist only)
  useEffect(() => {
    if (isPlaylistMode) return;
    if (audio) {
      audio.unload();
      setAudio(null);
      audioRef.current = null;
    }
    setTimestamps([]);
    setAudioActiveVerse(null);
  }, [activeBook, activeChapter, activeAudioFilesetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch timestamps when audio or text fileset changes
  useEffect(() => {
    if (!activeAudioFilesetId) return;
    const tsFilesetId = resolveTimestampsFilesetId(
      activeAudioFilesetId,
      activeTextFilesetId,
      activeBook,
    );
    if (!tsFilesetId) return;
    getAudioTimestamps(
      activeBook,
      activeChapter,
      tsFilesetId,
    ).then((ts) => {
      const adjusted = adjustTimestampsForENGESV(
        ts,
        activeAudioFilesetId,
      );
      setTimestamps(adjusted);
    });
  }, [activeBook, activeChapter, activeAudioFilesetId, activeTextFilesetId]);

  // Hook: highlight active verse during playback
  useVerseHighlighter(audio, isPlaying, timestamps, activeBook, activeChapter);

  const safeSeek = useCallback((targetTime: number) => {
    const currentAudio = audioRef.current;
    if (!currentAudio) return;
    try {
      const duration = currentAudio.duration();
      const clampedTime = Math.max(0, Math.min(duration, targetTime));
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
    if (!currentAudio || isPlayingRef.current) return;
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
    if (!currentAudio || !isPlayingRef.current) return;
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

  const mediaMetadata = useMemo<MediaSessionMetadata | null>(() => {
    if (isPlaylistMode) {
      if (!playlist.currentItem) return null;
      return {
        title: playlist.currentItem.label,
        artist: translationName,
        album: 'Bible Audio',
      };
    }
    if (!audio) return null;
    return {
      title: `${activeBook} ${activeChapter}`,
      artist: translationName,
      album: 'Bible Audio',
    };
  }, [
    isPlaylistMode,
    playlist.currentItem,
    audio,
    activeBook,
    activeChapter,
    translationName,
  ]);

  const mediaControls = useMemo<MediaSessionControls>(() => {
    if (isPlaylistMode) {
      const seekRelative = (offset: number) => {
        const a = playlist.audio;
        if (!a) return;
        const current = a.seek() as number;
        const duration = a.duration();
        const target = Math.max(
          0,
          Math.min(duration || Infinity, current + offset),
        );
        a.seek(target);
      };
      return {
        play: () => playlist.resume(),
        pause: () => playlist.pause(),
        stop: () => playlist.stop(),
        nextTrack: () => playlist.next(),
        previousTrack: () => playlist.previous(),
        seekBy: seekRelative,
        seekTo: (time) => {
          playlist.audio?.seek(time);
        },
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
      seekBy: (offset) => {
        const a = audioRef.current;
        if (!a) return;
        const current = a.seek() as number;
        safeSeek(current + offset);
      },
      seekTo: (time) => safeSeek(time),
    };
  }, [isPlaylistMode, playlist, safePlay, safePause, safeSeek]);

  const getMediaPosition = useCallback((): MediaSessionPosition | null => {
    const a = isPlaylistMode ? playlist.audio : audioRef.current;
    if (!a) return null;
    return {
      duration: a.duration(),
      position: a.seek() as number,
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

  // Function to navigate to next chapter
  const goToNextChapter = () => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_name === activeBook && 
        book.chapter === activeChapter
    );

    // Check if there's a next chapter
    if (index === -1 || index === getPassageResult.length - 1) {
      return false; // No next chapter
    }

    const next = getPassageResult[index + 1];
    if (next !== null) {
      setActiveBookOnly(next.book_name);
      setActiveBookShort(next.book_id);
      setActiveChapter(next.chapter);
      navigate(
        `/bible/${next.book_name}/${next.chapter}`,
        { replace: true }
      );
      return true; // Successfully moved to next chapter
    }

    return false;
  };

  useEffect(() => {
    const loadAndPlayAudio = async () => {
      if (isPlaying && audio !== null) {
        await safePlay();
        return;
      }

      if (!isPlaying && audio !== null) {
        await safePause();
        return;
      }

      // Only load new audio if we're playing and don't have audio yet
      if (isPlaying && audio === null) {
        setLoading(true);
        setError(null);

        try {
          // If no audio fileset is selected, do nothing.
          if (!activeAudioFilesetId) {
            setIsPlaying(false);
            setLoading(false);
            return;
          }

          let audioUrl: string;
          let effectiveFilesetId = activeAudioFilesetId;

          // KJV has a special, locally-generated URL
          if (activeAudioFilesetId === 'ENGKJV') {
            audioUrl = getKjvAudioUrl(activeBook, activeChapter);
          } else {
            const testament = getTestamentByBookName(activeBook);
            const fileset = translations
              .flatMap((t) => t.filesets)
              .find((f) => f.id === activeAudioFilesetId);
            if (
              testament &&
              fileset &&
              !filesetCoversTestament(fileset.size, testament)
            ) {
              const fallbackId = findTestamentFallback(
                activeAudioFilesetId,
                testament,
                translations.flatMap((t) => t.filesets),
              );
              if (fallbackId) {
                console.log(
                  `🔄 Auto-switching from ${activeAudioFilesetId} ` +
                  `to ${fallbackId} for ${testament}`
                );
                effectiveFilesetId = fallbackId;
              }
            }
            audioUrl = await getBibleAudioUrl(
              activeBook,
              activeChapter,
              effectiveFilesetId
            );
          }

          // Validate audio URL
          if (!audioUrl || typeof audioUrl !== 'string') {
            throw new Error(
              `Invalid audio URL: ${audioUrl} for ${activeAudioFilesetId}`
            );
          }

          // Create and play audio
          const audioHowl = new Howl({
            src: [audioUrl],
            html5: true,
            pool: 1,
            loop: isLooping,
            onplay: () => {
              setIsPlaying(true);
              setLoading(false);
            },
            onpause: () => setIsPlaying(false),
            onend: () => {
              // Double-check: onend shouldn't fire when looping
              // But add defensive check just in case
              if (audioHowl.loop()) {
                // Loop is enabled, don't advance
                return;
              }
              
              // Only advance to next chapter if not looping
              const movedToNext = goToNextChapter();
              if (movedToNext) {
                // Keep playing on next chapter
                // isPlaying stays true
              } else {
                // No next chapter, stop playing
                setIsPlaying(false);
              }
            },
            onloaderror: (_id, err) => {
              console.error('Audio load error:', err);
              setError('Failed to load audio');
              setIsPlaying(false);
              setLoading(false);
            },
            onplayerror: (_id, err) => {
              console.error('Audio play error:', err);
              setError('Failed to play audio');
              setIsPlaying(false);
              setLoading(false);
            },
          });

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
          const testament = getTestamentByBookName(activeBook);
          const fileset = translations
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

    loadAndPlayAudio();
  }, [isPlaying, audio, safePlay, safePause]);

  const handleClose = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setShowPlayer(false);
    audio?.stop();
    audioRef.current = null;
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
                    `/bible/${item.book}/${item.chapter}` +
                    `.${item.startVerse}`,
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
