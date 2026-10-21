import { render, screen, fireEvent, act } from
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Howl, HowlOptions } from 'howler';
import AudioPlayer from './AudioPlayer';
import { useBibleStore } from '../store';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

// `duration` is not a real Howl option — FakeHowl accepts it so
// tests can control duration() without a decode step.
const makeAudio = (): FakeHowl =>
  new FakeHowl({
    src: ['http://audio.test/x.mp3'],
    html5: true,
    duration: 100,
  } as HowlOptions);

describe('AudioPlayer Component', () => {
  const mockOnPlayPause = vi.fn();
  const mockOnLoopToggle = vi.fn();
  const mockOnClose = vi.fn();

  const renderPlayer = (
    audio: FakeHowl | null = makeAudio(),
    isPlaying = false,
  ) =>
    render(
      <AudioPlayer
        audio={audio as unknown as Howl}
        isPlaying={isPlaying}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    FakeHowl.reset();
    useBibleStore.setState({
      activeBookId: 'GEN',
      activeChapter: 1,
    });
  });

  it('should render player with book and chapter', () => {
    renderPlayer();
    expect(screen.getByText('GEN 1')).toBeInTheDocument();
  });

  it('should display play button when not playing', () => {
    renderPlayer();
    const playButton = screen.getByTitle('Play');
    expect(playButton).toBeInTheDocument();
  });

  it('should call onPlayPause when play button clicked',
    () => {
      renderPlayer();
      const playButton = screen.getByTitle('Play');
      fireEvent.click(playButton);
      expect(mockOnPlayPause).toHaveBeenCalled();
    });

  it('should call onClose when close button clicked',
    () => {
      renderPlayer();
      const closeButton = screen.getByTitle('Close player');
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

  it('should call onLoopToggle when loop button clicked',
    () => {
      renderPlayer();
      const loopButton = screen.getByTitle('Loop disabled');
      fireEvent.click(loopButton);
      expect(mockOnLoopToggle).toHaveBeenCalled();
    });

  it('seeks ±5s via the skip buttons once loaded', () => {
    const audio = makeAudio();
    renderPlayer(audio, true);
    act(() => {
      audio.emit('load');
      audio.seek(30);
    });

    fireEvent.click(screen.getByTitle('Skip backward 5s'));
    expect(audio._pos).toBe(25);

    fireEvent.click(screen.getByTitle('Skip forward 5s'));
    expect(audio._pos).toBe(30);
  });

  it('clamps skip seeks to the loaded range', () => {
    const audio = makeAudio();
    renderPlayer(audio, true);
    act(() => {
      audio.emit('load');
      audio.seek(98);
    });

    fireEvent.click(screen.getByTitle('Skip forward 5s'));
    expect(audio._pos).toBe(100);

    fireEvent.click(screen.getByTitle('Skip backward 5s'));
    expect(audio._pos).toBe(95);
  });

  it('ignores seek input while the sound is still loading', () => {
    const audio = makeAudio();
    renderPlayer(audio, true);
    act(() => {
      audio.seek(30);
    });
    // No emit('load') — seekTo must not push a position into a
    // sound whose seek() does not report one yet.
    fireEvent.click(screen.getByTitle('Skip backward 5s'));
    expect(audio._pos).toBe(30);
  });

  it('should return null when audio is null', () => {
    const { container } = renderPlayer(null);
    expect(container.firstChild).toBeNull();
  });
});
