import { useState, useEffect } from "react";
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

  // Setup Media Session API for hardware controls (headphones, lock screen, etc.)
  useEffect(() => {
    if ('mediaSession' in navigator && audio) {
      const translationName = translations.find(
        t => t.filesets.some(f => f.id === activeAudioFilesetId)
      )?.name || 'Unknown Version';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${activeBook} ${activeChapter}`,
        artist: translationName,
        album: 'Bible Audio',
      });

      // Required for lock-screen action handlers to fire on Android
      navigator.mediaSession.playbackState =
        isPlaying ? 'playing' : 'paused';

      // Helper: push current position/duration to the OS so that
      // lock-screen seeking and the seekforward/seekbackward actions
      // work correctly.
      const syncPositionState = () => {
        const duration = audio.duration();
        const position = audio.seek() as number;
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
            // setPositionState throws if values are out of range
          }
        }
      };

      syncPositionState();

      navigator.mediaSession.setActionHandler('play', () => {
        // Only update state, let useEffect handle audio playback
        setIsPlaying(true);
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        // Only update state, let useEffect handle audio pause
        setIsPlaying(false);
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        // Only update state, let useEffect handle audio pause
        setIsPlaying(false);
      });

      // Seek backward (headphones with seek buttons)
      navigator.mediaSession.setActionHandler(
        'seekbackward',
        (details) => {
          const offset = details.seekOffset ?? 10;
          const currentTime = audio.seek() as number;
          const newTime = Math.max(0, currentTime - offset);
          audio.seek(newTime);
          syncPositionState();
        }
      );

      // Seek forward (headphones with seek buttons)
      navigator.mediaSession.setActionHandler(
        'seekforward',
        (details) => {
          const offset = details.seekOffset ?? 10;
          const currentTime = audio.seek() as number;
          const duration = audio.duration();
          const newTime = Math.min(duration, currentTime + offset);
          audio.seek(newTime);
          syncPositionState();
        }
      );

      // Previous track (car stereo prev button)
      navigator.mediaSession.setActionHandler(
        'previoustrack',
        () => {
          const currentTime = audio.seek() as number;
          const newTime = Math.max(0, currentTime - 10);
          audio.seek(newTime);
          syncPositionState();
        }
      );

      // Next track (car stereo next button)
      navigator.mediaSession.setActionHandler(
        'nexttrack',
        () => {
          const currentTime = audio.seek() as number;
          const duration = audio.duration();
          const newTime = Math.min(duration, currentTime + 10);
          audio.seek(newTime);
          syncPositionState();
        }
      );

      // Seek to specific time (additional car stereo fallback)
      navigator.mediaSession.setActionHandler(
        'seekto',
        (details) => {
          if (details.seekTime !== undefined) {
            audio.seek(details.seekTime);
            syncPositionState();
          }
        }
      );
    }

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [audio, isPlaying, activeBook, activeChapter, activeAudioFilesetId, translations]);

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
      // If audio exists and we want to play, just resume it
      if (isPlaying && audio !== null) {
        audio.play();
        return;
      }

      // If we want to pause, just pause
      if (!isPlaying && audio !== null) {
        audio.pause();
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

          // KJV has a special, locally-generated URL
          if (activeAudioFilesetId === 'ENGKJV') {
            audioUrl = getKjvAudioUrl(activeBook, activeChapter);
          } else {
            // All other translations use the Bible Research API
            audioUrl = await getBibleAudioUrl(
              activeBook,
              activeChapter,
              activeAudioFilesetId
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
  }, [isPlaying, audio]);

  const handleClose = () => {
    setIsPlaying(false);
    setShowPlayer(false);
    audio?.stop();
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
