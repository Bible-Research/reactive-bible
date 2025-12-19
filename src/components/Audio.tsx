import { useState, useEffect } from "react";
import { Howl } from "howler";
import { useBibleStore } from "../store";
import { getKjvAudioUrl, getBibleAudioUrl } from "../api";
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
            onend: () => setIsPlaying(false),
            onloaderror: (id, err) => {
              console.error('Audio load error:', err);
              setError('Failed to load audio');
              setIsPlaying(false);
              setLoading(false);
            },
            onplayerror: (id, err) => {
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
          setError(err instanceof Error ? err.message : 'Unknown error');
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
