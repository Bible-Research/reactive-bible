import { useState, useEffect, useRef, useCallback } from "react";
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
  const pendingOperationRef = useRef<Promise<void> | null>(null);
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

  const safePlay = useCallback(async () => {
    const currentAudio = audioRef.current;
    if (!currentAudio || isPlayingRef.current) return;
    if (pendingOperationRef.current) {
      await pendingOperationRef.current;
    }
    try {
      const playPromise = currentAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        pendingOperationRef.current = playPromise as Promise<void>;
        await playPromise;
        pendingOperationRef.current = null;
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (err) {
      console.warn('Play operation failed:', err);
      pendingOperationRef.current = null;
    }
  }, []);

  const safePause = useCallback(async () => {
    const currentAudio = audioRef.current;
    if (!currentAudio || !isPlayingRef.current) return;
    if (pendingOperationRef.current) {
      await pendingOperationRef.current;
    }
    try {
      currentAudio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      pendingOperationRef.current = null;
    } catch (err) {
      console.warn('Pause operation failed:', err);
      pendingOperationRef.current = null;
    }
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !audio) return;

    const translationName = translations.find(
      t => t.filesets.some(f => f.id === activeAudioFilesetId)
    )?.name || 'Unknown Version';
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${activeBook} ${activeChapter}`,
      artist: translationName,
      album: 'Bible Audio',
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    let positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSyncPosition = () => {
      if (positionUpdateTimer) clearTimeout(positionUpdateTimer);
      positionUpdateTimer = setTimeout(() => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        const duration = currentAudio.duration();
        const position = currentAudio.seek() as number;
        if (
          duration > 0 &&
          typeof position === 'number' &&
          !isNaN(position) &&
          position <= duration
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration,
              playbackRate: 1,
              position,
            });
          } catch {
          }
        }
      }, 100);
    };

    navigator.mediaSession.setActionHandler('play', () => {
      safePlay();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      safePause();
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      safePause();
    });

    navigator.mediaSession.setActionHandler(
      'seekbackward',
      (details) => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        const offset = details.seekOffset ?? 10;
        const currentTime = currentAudio.seek() as number;
        const newTime = Math.max(0, currentTime - offset);
        safeSeek(newTime);
        debouncedSyncPosition();
      }
    );

    navigator.mediaSession.setActionHandler(
      'seekforward',
      (details) => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        const offset = details.seekOffset ?? 10;
        const currentTime = currentAudio.seek() as number;
        const duration = currentAudio.duration();
        const newTime = Math.min(duration, currentTime + offset);
        safeSeek(newTime);
        debouncedSyncPosition();
      }
    );

    navigator.mediaSession.setActionHandler(
      'previoustrack',
      () => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        const currentTime = currentAudio.seek() as number;
        const newTime = Math.max(0, currentTime - 10);
        safeSeek(newTime);
        debouncedSyncPosition();
      }
    );

    navigator.mediaSession.setActionHandler(
      'nexttrack',
      () => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        const currentTime = currentAudio.seek() as number;
        const duration = currentAudio.duration();
        const newTime = Math.min(duration, currentTime + 10);
        safeSeek(newTime);
        debouncedSyncPosition();
      }
    );

    navigator.mediaSession.setActionHandler(
      'seekto',
      (details) => {
        if (details.seekTime !== undefined) {
          safeSeek(details.seekTime);
          debouncedSyncPosition();
        }
      }
    );

    return () => {
      if (positionUpdateTimer) clearTimeout(positionUpdateTimer);
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [audio, activeBook, activeChapter, activeAudioFilesetId, translations, safePlay, safePause, safeSeek]);

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
