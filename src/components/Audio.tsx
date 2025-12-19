import { useState, useEffect } from "react";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import { getKjvAudioUrl, getBibleAudioUrl, getPassage } from "../api";
import { ActionIcon, rem, Loader } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";

const Audio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<Howl | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  const bibleVersion = useBibleStore((state) => state.bibleVersion);
  const setActiveBookOnly = useBibleStore((state) => state.setActiveBookOnly);
  const setActiveBookShort = useBibleStore(
    (state) => state.setActiveBookShort
  );
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const getPassageResult = getPassage();

  // Function to navigate to next chapter
  const goToNextChapter = () => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_name === activeBook && book.chapter === activeChapter
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
      if (isPlaying) {
        // Stop any currently playing audio
        if (audio !== null) {
          audio.stop();
          audio.unload();
        }

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
      } else {
        // Stop audio
        audio?.stop();
        setLoading(false);
      }
    };

    loadAndPlayAudio();

    // Cleanup on unmount or when dependencies change
    return () => {
      audio?.unload();
    };
  }, [activeBook, activeChapter, bibleVersion, isPlaying]);

  return (
    <ActionIcon
      variant="transparent"
      onClick={() => setIsPlaying((value) => !value)}
      disabled={loading}
      title={error || (isPlaying ? "Stop audio" : "Play audio")}
    >
      {loading ? (
        <Loader size={rem(20)} />
      ) : isPlaying ? (
        <IconPlayerStop size={rem(20)} />
      ) : (
        <IconPlayerPlay size={rem(20)} />
      )}
    </ActionIcon>
  );
};

export default Audio;
