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
  audio: Howl | null;
  isPlaying: boolean;
  isLooping: boolean;
  onPlayPause: () => void;
  onLoopToggle: () => void;
  onClose: () => void;
}

const AudioPlayer = ({
  audio,
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

  // Update current time
  useEffect(() => {
    if (!audio || !isPlaying) return;

    const interval = setInterval(() => {
      if (!seeking) {
        const seek = audio.seek() as number;
        setCurrentTime(seek);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [audio, isPlaying, seeking]);

  // Get duration when audio loads
  useEffect(() => {
    if (!audio) return;

    const updateDuration = () => {
      const dur = audio.duration();
      if (dur && dur > 0) {
        setDuration(dur);
      }
    };

    // Try to get duration immediately
    updateDuration();

    // Also listen for load event
    audio.on('load', updateDuration);

    return () => {
      audio.off('load', updateDuration);
    };
  }, [audio]);

  // Handle looping
  useEffect(() => {
    if (!audio) return;
    audio.loop(isLooping);
  }, [audio, isLooping]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number) => {
    if (!audio) return;
    audio.seek(value);
    setCurrentTime(value);
  };

  const handleSkipBackward = () => {
    if (!audio) return;
    const newTime = Math.max(0, currentTime - 5);
    audio.seek(newTime);
    setCurrentTime(newTime);
  };

  const handleSkipForward = () => {
    if (!audio) return;
    const newTime = Math.min(duration, currentTime + 5);
    audio.seek(newTime);
    setCurrentTime(newTime);
  };

  if (!audio) return null;

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
