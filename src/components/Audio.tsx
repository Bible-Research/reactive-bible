import { useState, useEffect } from "react";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import { getKjvAudioUrl, getBibleAudioUrl, getPassage } from "../api";
import { ActionIcon, rem, Loader } from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import AudioPlayer from "./AudioPlayer";

const Audio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<Howl | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const bibleVersion = useBibleStore((state) => state.bibleVersion);
  const showPlayer = useBibleStore((state) => state.showAudioPlayer);
  const setShowPlayer = useBibleStore((state) => state.setShowAudioPlayer);
  const setActiveBookOnly = useBibleStore((state) => state.setActiveBookOnly);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const getPassageResult = getPassage();

  // Reset audio when chapter/book/version changes
  useEffect(() => {
    if (audio) {
      audio.unload();
      setAudio(null);
    }
  }, [activeBook, activeChapter, bibleVersion]);

  // Setup Media Session API for hardware controls (headphones, lock screen, etc.)
  useEffect(() => {
    if ('mediaSession' in navigator && audio) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${activeBook} ${activeChapter}`,
        artist: bibleVersion,
        album: 'Bible Audio',
      });

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

      // Seek backward: 10s (headphones with seek buttons)
      navigator.mediaSession.setActionHandler(
        'seekbackward', 
        () => {
          const currentTime = audio.seek() as number;
          const newTime = Math.max(0, currentTime - 10);
          audio.seek(newTime);
        }
      );

      // Seek forward: 10s (headphones with seek buttons)
      navigator.mediaSession.setActionHandler(
        'seekforward', 
        () => {
          const currentTime = audio.seek() as number;
          const duration = audio.duration();
          const newTime = Math.min(duration, currentTime + 10);
          audio.seek(newTime);
        }
      );

      // Previous track: 10s (car stereo prev button)
      navigator.mediaSession.setActionHandler(
        'previoustrack', 
        () => {
          const currentTime = audio.seek() as number;
          const newTime = Math.max(0, currentTime - 10);
          audio.seek(newTime);
        }
      );

      // Next track: 10s (car stereo next button)
      navigator.mediaSession.setActionHandler(
        'nexttrack', 
        () => {
          const currentTime = audio.seek() as number;
          const duration = audio.duration();
          const newTime = Math.min(duration, currentTime + 10);
          audio.seek(newTime);
        }
      );

      // Seek to specific time (additional car stereo fallback)
      navigator.mediaSession.setActionHandler(
        'seekto', 
        (details) => {
          if (details.seekTime !== undefined) {
            audio.seek(details.seekTime);
          }
        }
      );
    }

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler(
          'seekbackward', 
          null
        );
        navigator.mediaSession.setActionHandler(
          'seekforward', 
          null
        );
        navigator.mediaSession.setActionHandler(
          'previoustrack', 
          null
        );
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [audio, isPlaying, activeBook, activeChapter, bibleVersion]);

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
          let audioUrl: string;

          // KJV uses wordpocket.org (instant URL)
          if (bibleVersion === 'KJV') {
            audioUrl = getKjvAudioUrl(activeBook, activeChapter);
          }
          // All other translations use Bible Research API
          else {
            audioUrl = await getBibleAudioUrl(
              activeBook,
              activeChapter,
              bibleVersion
            );
          }

          // Validate audio URL
          if (!audioUrl || typeof audioUrl !== 'string') {
            throw new Error(
              `Invalid audio URL: ${audioUrl} for ${bibleVersion}`
            );
          }

          // Create and play audio
          const audioHowl = new Howl({
            src: [audioUrl],
            html5: true,
            pool: 1,
            onplay: () => {
              setIsPlaying(true);
              setLoading(false);
            },
            onpause: () => setIsPlaying(false),
            onend: () => {
              // When audio ends, try to go to next chapter
              const movedToNext = goToNextChapter();
              if (movedToNext) {
                // Keep playing on next chapter
                // isPlaying stays true, useEffect will trigger new audio
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
          audioHowl.play();
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
          
          setError(errorMsg);
          setIsPlaying(false);
          setLoading(false);
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

  const handlePlayPause = () => {
    setIsPlaying((value) => !value);
    setShowPlayer(true); // Show player when starting playback
  };

  return (
    <>
      <ActionIcon
        variant="transparent"
        onClick={handlePlayPause}
        disabled={loading}
        title={error || (isPlaying ? "Playing..." : "Play audio")}
      >
        {loading ? (
          <Loader size={rem(20)} />
        ) : (
          <IconPlayerPlay size={rem(20)} />
        )}
      </ActionIcon>

      {showPlayer && audio && (
        <AudioPlayer
          audio={audio}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying((value) => !value)}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default Audio;
