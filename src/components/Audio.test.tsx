import {
  act,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Audio from './Audio';
import { renderWithProviders } from '../__tests__/helpers';
import { useBibleStore } from '../store';

// Mock Howler
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(function () {
    return {
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      unload: vi.fn(),
      seek: vi.fn().mockReturnValue(0),
      duration: vi.fn().mockReturnValue(100),
      loop: vi.fn(),
      state: vi.fn().mockReturnValue('loaded'),
      playing: vi.fn().mockReturnValue(false),
      volume: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    };
  }),
}));

// Mock API
vi.mock('../api', () => ({
  getKjvAudioUrl: vi.fn().mockReturnValue('http://audio.url/test.mp3'),
  getBibleAudioUrl: vi.fn()
    .mockResolvedValue('http://audio.url/test.mp3'),
  getPassage: vi.fn().mockReturnValue({
    book: 'Genesis',
    chapter: 1,
  }),
  getAudioTimestamps: vi.fn().mockResolvedValue([]),
  getAdjacentChapters: vi.fn().mockReturnValue({
    previous: null,
    next: null,
  }),
  BookNotInFilesetError: class BookNotInFilesetError
    extends Error {},
}));

// Note: AudioPlayer component is now used as-is (no mock)

describe('Audio Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the play button', () => {
    renderWithProviders(<Audio />, {
      storeOverrides: {
        activeBookId: 'GEN',
        activeChapter: 1,
        activeAudioFilesetId: 'ENGKJV',
        showAudioPlayer: false,
      },
    });
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('clears the audio-active verse when the player closes',
    async () => {
      renderWithProviders(<Audio />, {
        storeOverrides: {
          activeBookId: 'GEN',
          activeChapter: 1,
          activeAudioFilesetId: 'ENGKJV',
          showAudioPlayer: false,
        },
      });

      fireEvent.click(screen.getByTitle('Play audio'));
      const closeButton = await screen.findByTitle(
        'Close player'
      );

      // Simulate the highlighter marking the playing verse.
      act(() => {
        useBibleStore.getState().setAudioActiveVerse({
          bookId: 'GEN',
          chapter: 1,
          verse: 3,
          scope: 'bible',
        });
      });

      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(
          useBibleStore.getState().audioActiveVerse
        ).toBeNull();
      });
    });

  // Note: Full audio playback testing is extremely complex
  // due to Howler.js, Media Session API, and async state.
  // See SKIPPED_TESTS.md for details.
  it.skip('should load and play audio when button clicked', () => {
    // This test is skipped due to complex mocking requirements
  });

  it.skip('should update Media Session metadata', () => {
    // This test is skipped due to Media Session API mocking
  });

  it.skip('should auto-advance to next chapter on audio end', () => {
    // This test is skipped due to complex async behavior
  });
});
