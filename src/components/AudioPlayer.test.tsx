import { render, screen, fireEvent } from 
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AudioPlayer from './AudioPlayer';
import { useBibleStore } from '../store';
import { Howl } from 'howler';

// Mock Howler
const mockAudio = {
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn().mockReturnValue(30),
  duration: vi.fn().mockReturnValue(100),
  loop: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
} as unknown as Howl;

const initialStoreState = useBibleStore.getState();

describe('AudioPlayer Component', () => {
  const mockOnPlayPause = vi.fn();
  const mockOnLoopToggle = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      activeBook: 'Genesis',
      activeChapter: 1,
    });
  });

  it('should render player with book and chapter', () => {
    render(
      <AudioPlayer
        audio={mockAudio}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Genesis 1')).toBeInTheDocument();
  });

  it('should display play button when not playing', () => {
    render(
      <AudioPlayer
        audio={mockAudio}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    const playButton = screen.getByTitle('Play');
    expect(playButton).toBeInTheDocument();
  });

  it('should call onPlayPause when play button clicked', 
    () => {
    render(
      <AudioPlayer
        audio={mockAudio}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    const playButton = screen.getByTitle('Play');
    fireEvent.click(playButton);
    expect(mockOnPlayPause).toHaveBeenCalled();
  });

  it('should call onClose when close button clicked', 
    () => {
    render(
      <AudioPlayer
        audio={mockAudio}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByTitle('Close player');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should call onLoopToggle when loop button clicked', 
    () => {
    render(
      <AudioPlayer
        audio={mockAudio}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    const loopButton = screen.getByTitle('Loop disabled');
    fireEvent.click(loopButton);
    expect(mockOnLoopToggle).toHaveBeenCalled();
  });

  it('should return null when audio is null', () => {
    const { container } = render(
      <AudioPlayer
        audio={null}
        isPlaying={false}
        isLooping={false}
        onPlayPause={mockOnPlayPause}
        onLoopToggle={mockOnLoopToggle}
        onClose={mockOnClose}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
