import { useState, useEffect } from 'react';
import {
  Box,
  Group,
  ActionIcon,
  Slider,
  Text,
  Paper,
  CloseButton,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
} from '@tabler/icons-react';
import { Howl } from 'howler';
import { useBibleStore } from '../store';

interface AudioPlayerProps {
  howler?: Howl | null;
  html5Audio?: HTMLAudioElement | null;
  isPlaying: boolean;
  isLooping: boolean;
  onPlayPause: () => void;
  onLoopToggle: () => void;
  onClose: () => void;
}

const AudioPlayer = ({
  howler,
  html5Audio,
  isPlaying,
  isLooping,
  onPlayPause,
  onLoopToggle,
  onClose,
}: AudioPlayerProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);

  const player = {
    seek: (time?: number) => {
      if (howler) return howler.seek(time);
      if (html5Audio) {
        if (time !== undefined) html5Audio.currentTime = time;
        return html5Audio.currentTime;
      }
      return 0;
    },
    duration: () => {
      if (howler) return howler.duration();
      if (html5Audio) return html5Audio.duration;
      return 0;
    },
    loop: (shouldLoop: boolean) => {
      if (howler) howler.loop(shouldLoop);
      if (html5Audio) html5Audio.loop = shouldLoop;
    },
  };

  // Update current time
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!seeking) {
        const seek = player.seek() as number;
        setCurrentTime(seek);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [howler, html5Audio, isPlaying, seeking]);

  // Get duration when audio loads
  useEffect(() => {
    const updateDuration = () => {
      const dur = player.duration();
      if (dur && dur > 0 && isFinite(dur)) {
        setDuration(dur);
      }
    };

    updateDuration();

    if (howler) howler.on('load', updateDuration);
    if (html5Audio) html5Audio.addEventListener('loadedmetadata', updateDuration);

    return () => {
      if (howler) howler.off('load', updateDuration);
      if (html5Audio) html5Audio.removeEventListener('loadedmetadata', updateDuration);
    };
  }, [howler, html5Audio]);

  // Handle looping
  useEffect(() => {
    player.loop(isLooping);
  }, [howler, html5Audio, isLooping]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number) => {
    player.seek(value);
    setCurrentTime(value);
  };

  const handleSkipBackward = () => {
    const newTime = Math.max(0, currentTime - 5);
    player.seek(newTime);
    setCurrentTime(newTime);
  };

  const handleSkipForward = () => {
    const newTime = Math.min(duration, currentTime + 5);
    player.seek(newTime);
    setCurrentTime(newTime);
  };

  if (!howler && !html5Audio) return null;

  return (
    <Paper
      shadow="lg"
      p="md"
      sx={(theme) => ({
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor:
          theme.colorScheme === 'dark'
            ? theme.colors.dark[7]
            : theme.colors.gray[0],
        borderTop: `1px solid ${
          theme.colorScheme === 'dark'
            ? theme.colors.dark[5]
            : theme.colors.gray[3]
        }`,
      })}
    >
      <Group position="apart" mb="xs">
        <Text weight={500} size="sm">
          {activeBook} {activeChapter}
        </Text>
        <CloseButton onClick={onClose} title="Close player" />
      </Group>

      <Group spacing="xs" mb="xs">
        <ActionIcon
          size="lg"
          variant="filled"
          onClick={handleSkipBackward}
          title="Skip backward 5s"
        >
          <IconPlayerSkipBack size={20} />
        </ActionIcon>

        <ActionIcon
          size="xl"
          variant="filled"
          color="blue"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <IconPlayerPause size={24} />
          ) : (
            <IconPlayerPlay size={24} />
          )}
        </ActionIcon>

        <ActionIcon
          size="lg"
          variant="filled"
          onClick={handleSkipForward}
          title="Skip forward 5s"
        >
          <IconPlayerSkipForward size={20} />
        </ActionIcon>

        <ActionIcon
          size="lg"
          variant={isLooping ? 'filled' : 'outline'}
          color={isLooping ? 'blue' : 'gray'}
          onClick={onLoopToggle}
          title={isLooping ? 'Loop enabled' : 'Loop disabled'}
        >
          <IconRepeat size={20} />
        </ActionIcon>

        <Box sx={{ flex: 1, mx: 'md' }}>
          <Slider
            value={currentTime}
            min={0}
            max={duration || 100}
            onChange={(value) => {
              setSeeking(true);
              setCurrentTime(value);
            }}
            onChangeEnd={(value) => {
              handleSeek(value);
              setSeeking(false);
            }}
            label={null}
            size="sm"
          />
        </Box>

        <Text size="xs" color="dimmed" sx={{ minWidth: 80, textAlign: 'right' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>
      </Group>
    </Paper>
  );
};

export default AudioPlayer;
