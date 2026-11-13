import { useState, useEffect } from 'react';
import {
  Box,
  Group,
  ActionIcon,
  Slider,
  Text,
  Paper,
  CloseButton,
  Portal,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
  IconFocus2,
} from '@tabler/icons-react';
import { Howl } from 'howler';
import { useBibleStore } from '../store';
import { getPlayPosition } from '../utils/audioUtils';

interface AudioPlayerProps {
  audio: Howl | null;
  isPlaying: boolean;
  isLooping: boolean;
  onPlayPause: () => void;
  onLoopToggle: () => void;
  onClose: () => void;
  subtitle?: string;
  onFocus?: () => void;
}

// Height of this fixed bottom bar is AUDIO_PLAYER_HEIGHT in
// utils/audioUtils — keep the layout within that budget.

const AudioPlayer = ({
  audio,
  isPlaying,
  isLooping,
  onPlayPause,
  onLoopToggle,
  onClose,
  subtitle,
  onFocus,
}: AudioPlayerProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore((state) => state.activeChapter);

  // Update current time
  useEffect(() => {
    if (!audio || !isPlaying) return;

    const interval = setInterval(() => {
      if (!seeking) {
        const seek = getPlayPosition(audio);
        if (seek !== null) setCurrentTime(seek);
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

  const seekTo = (value: number) => {
    // Seeking a not-yet-loaded Howl passes NaN through to the html5
    // node and wedges it — only seek a loaded sound.
    if (!audio || audio.state() !== 'loaded') return;
    if (!Number.isFinite(value)) return;
    audio.seek(value);
    setCurrentTime(value);
  };

  const handleSkipBackward = () => {
    const pos = getPlayPosition(audio) ?? currentTime;
    seekTo(Math.max(0, pos - 5));
  };

  const handleSkipForward = () => {
    const pos = getPlayPosition(audio) ?? currentTime;
    seekTo(Math.min(duration, pos + 5));
  };

  if (!audio) return null;

  return (
    <Portal>
      <Paper
      shadow="lg"
      p="sm"
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
      <Group position="apart" mb={4}>
        <Group spacing={4} sx={{ flex: 1, minWidth: 0 }}>
          {onFocus && (
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={onFocus}
              title="Go to passage"
            >
              <IconFocus2 size={16} />
            </ActionIcon>
          )}
          <Text weight={500} size="sm" lineClamp={1}>
            {subtitle ?? `${activeBookId} ${activeChapter}`}
          </Text>
        </Group>
        <CloseButton onClick={onClose} title="Close player" />
      </Group>

      <Group spacing="xs" mb={4} noWrap>
        <Text size="xs" color="dimmed" sx={{ minWidth: 34 }}>
          {formatTime(currentTime)}
        </Text>
        <Slider
          value={currentTime}
          min={0}
          max={duration || 100}
          onChange={(value) => {
            setSeeking(true);
            setCurrentTime(value);
          }}
          onChangeEnd={(value) => {
            seekTo(value);
            setSeeking(false);
          }}
          label={null}
          size="lg"
          thumbSize={20}
          sx={{ flex: 1 }}
        />
        <Text
          size="xs"
          color="dimmed"
          sx={{ minWidth: 34, textAlign: 'right' }}
        >
          {formatTime(duration)}
        </Text>
      </Group>

      <Box sx={{ position: 'relative' }}>
        <Group position="center" spacing="md">
          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleSkipBackward}
            title="Skip backward 5s"
          >
            <IconPlayerSkipBack size={22} />
          </ActionIcon>

          <ActionIcon
            size={60}
            variant="filled"
            color="blue"
            radius="xl"
            onClick={onPlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <IconPlayerPause size={30} />
            ) : (
              <IconPlayerPlay size={30} />
            )}
          </ActionIcon>

          <ActionIcon
            size="lg"
            variant="subtle"
            onClick={handleSkipForward}
            title="Skip forward 5s"
          >
            <IconPlayerSkipForward size={22} />
          </ActionIcon>
        </Group>

        <ActionIcon
          size="lg"
          variant={isLooping ? 'filled' : 'subtle'}
          color={isLooping ? 'blue' : 'gray'}
          onClick={onLoopToggle}
          title={isLooping ? 'Loop enabled' : 'Loop disabled'}
          sx={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          <IconRepeat size={20} />
        </ActionIcon>
      </Box>
      </Paper>
    </Portal>
  );
};

export default AudioPlayer;
