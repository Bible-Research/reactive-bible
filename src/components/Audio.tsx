import { useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import Hls from 'hls.js';
import { useBibleStore } from '../store';
import { getKjvAudioUrl, getBibleAudioUrl, getPassage } from '../api';
import { ActionIcon, rem, Loader } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import AudioPlayer from './AudioPlayer';

const Audio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<Howl | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);

  const {
    activeBook,
    activeChapter,
    activeAudioFilesetId,
    translations,
    showAudioPlayer,
    setShowAudioPlayer,
    setActiveBookOnly,
    setActiveBookShort,
    setActiveChapter,
  } = useBibleStore();

  const getPassageResult = getPassage();

  const goToNextChapter = useCallback(() => {
    const index = getPassageResult.findIndex(
      (book) =>
        book.book_name === activeBook && book.chapter === activeChapter
    );

    if (index === -1 || index === getPassageResult.length - 1) {
      return false;
    }

    const next = getPassageResult[index + 1];
    if (next) {
      setActiveBookOnly(next.book_name);
      setActiveBookShort(next.book_id);
      setActiveChapter(next.chapter);
      return true;
    }
    return false;
  }, [getPassageResult, activeBook, activeChapter, setActiveBookOnly, setActiveBookShort, setActiveChapter]);

  // Main audio control effect
  useEffect(() => {
    const cleanup = () => {
      audio?.unload();
      setAudio(null);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.src = '';
      }
    };

    const loadAudio = async () => {
      cleanup();
      if (!activeAudioFilesetId) {
        setIsPlaying(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const audioUrl = activeAudioFilesetId === 'ENGKJV'
          ? getKjvAudioUrl(activeBook, activeChapter)
          : await getBibleAudioUrl(activeBook, activeChapter, activeAudioFilesetId);

        if (!audioUrl) throw new Error('No audio URL received.');

        if (audioUrl.endsWith('.m3u8')) {
          if (Hls.isSupported() && audioRef.current) {
            const response = await fetch(audioUrl);
            const manifestText = await response.text();
            const lines = manifestText.split('\n');
            const streamLine = lines.find(line => line.endsWith('.m3u8?verse_start=1'));

            if (!streamLine) {
              throw new Error('Could not find stream URL in HLS manifest.');
            }

            // Construct the full URL by combining the master playlist's base path with the relative stream path
            const basePath = audioUrl.substring(0, audioUrl.lastIndexOf('/') + 1);
            const streamUrl = `${basePath}${streamLine}`;

            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(audioRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              if (isPlaying) audioRef.current?.play();
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) {
                setError('HLS stream failed.');
                setLoading(false);
              }
            });
            audioRef.current.onended = () => {
              if (!isLooping) {
                const moved = goToNextChapter();
                if (!moved) setIsPlaying(false);
              }
            };
          } else {
            throw new Error('HLS not supported.');
          }
        } else {
          const newAudio = new Howl({
            src: [audioUrl],
            html5: true,
            loop: isLooping,
            onplay: () => setLoading(false),
            onend: () => {
              if (!isLooping) {
                const moved = goToNextChapter();
                if (!moved) setIsPlaying(false);
              }
            },
            onloaderror: (_, err) => setError(`Load error: ${err}`),
          });
          setAudio(newAudio);
          newAudio.play();
        }
      } catch (e: any) {
        setError(e.message || 'Unknown audio error.');
        setLoading(false);
      }
    };

    if (isPlaying) {
      loadAudio();
    } else {
      audio?.pause();
      audioRef.current?.pause();
    }

    return cleanup;
  }, [isPlaying, activeBook, activeChapter, activeAudioFilesetId, isLooping]);

  // Media Session API
  useEffect(() => {
    if ('mediaSession' in navigator) {
      const translationName = translations.find(t => t.filesets.some(f => f.id === activeAudioFilesetId))?.name || 'Unknown';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${activeBook} ${activeChapter}`,
        artist: translationName,
      });
      // Action handlers would be set here
    }
  }, [activeBook, activeChapter, activeAudioFilesetId, translations]);

  const handlePlayPause = () => {
    setIsPlaying(v => !v);
    if (!showAudioPlayer) setShowAudioPlayer(true);
  };

  const handleClose = () => {
    setIsPlaying(false);
    setShowAudioPlayer(false);
  };

  return (
    <>
      <ActionIcon variant="transparent" onClick={handlePlayPause} disabled={loading} title={error || 'Play audio'}>
        {loading ? <Loader size={rem(20)} /> : <IconPlayerPlay style={{ width: rem(20), height: rem(20) }} />}
      </ActionIcon>

      <audio ref={audioRef} loop={isLooping} style={{ display: 'none' }} />

      {showAudioPlayer && (
        <AudioPlayer
          howler={audio}
          html5Audio={audioRef.current}
          isPlaying={isPlaying}
          isLooping={isLooping}
          onPlayPause={handlePlayPause}
          onLoopToggle={() => setIsLooping(v => !v)}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default Audio;
