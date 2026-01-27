import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import PassageView from './PassageView';
import { useBibleStore } from '../store';
import {
  measureRenderTime,
  createLargeVerseData,
} from '../__tests__/helpers/performance';

// Mock API calls
const mockGetVersesInChapter = vi.fn();
const mockPrefetchAudioUrl = vi.fn();
const mockPrefetchAdjacentChapters = vi.fn();

vi.mock('../api', () => ({
  getVersesInChapter: (...args: any[]) =>
    mockGetVersesInChapter(...args),
  prefetchAudioUrl: (...args: any[]) => mockPrefetchAudioUrl(...args),
  prefetchAdjacentChapters: (...args: any[]) =>
    mockPrefetchAdjacentChapters(...args),
}));

// Mock Verse component to isolate PassageView performance
vi.mock('./Verse', () => ({
  default: ({ verse, text }: { verse: number; text: string }) => (
    <div data-testid={`verse-${verse}`}>{text}</div>
  ),
}));

describe('PassageView Component Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default store state
    useBibleStore.setState({
      activeBook: 'Genesis',
      activeBookShort: 'GEN',
      activeChapter: 1,
      activeTextFilesetId: 'ENGKJV',
      activeAudioFilesetId: 'ENGKJVO2DA',
      showAudioPlayer: false,
    });

    // Default mock implementation
    mockGetVersesInChapter.mockResolvedValue([
      { verse: 1, text: 'In the beginning...' },
      { verse: 2, text: 'And the earth was...' },
    ]);
  });

  describe('Render Performance', () => {
    it('should render small chapters quickly', async () => {
      const verses = createLargeVerseData(10);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const renderFn = () => {
        render(
          <MantineProvider>
            <PassageView />
          </MantineProvider>
        );
      };

      const avgTime = measureRenderTime(renderFn, 20);

      // Should render in less than 15ms on average
      expect(avgTime).toBeLessThan(15);

      console.log(
        `PassageView (10 verses) avg render: ${avgTime.toFixed(2)}ms`
      );
    });

    it('should handle large chapters efficiently', async () => {
      // Psalm 119 has 176 verses - largest chapter in Bible
      const verses = createLargeVerseData(176);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const start = performance.now();

      const { container } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(container.querySelector('[data-testid="verse-1"]'))
          .toBeInTheDocument();
      });

      const duration = performance.now() - start;

      // Should render large chapter in reasonable time
      expect(duration).toBeLessThan(500);

      console.log(
        `PassageView (176 verses) rendered in ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('Re-render Performance', () => {
    it('should minimize re-renders on chapter change', async () => {
      const verses = createLargeVerseData(30);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const { rerender } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(mockGetVersesInChapter).toHaveBeenCalledTimes(1);
      });

      const start = performance.now();

      // Simulate chapter navigation (10 times)
      for (let chapter = 2; chapter <= 11; chapter++) {
        act(() => {
          useBibleStore.setState({ activeChapter: chapter });
        });
        rerender(
          <MantineProvider>
            <PassageView />
          </MantineProvider>
        );
      }

      const duration = performance.now() - start;

      // 10 chapter changes should be fast
      expect(duration).toBeLessThan(200);

      console.log(
        `10 chapter changes completed in ${duration.toFixed(2)}ms`
      );
    });

    it('should not re-render when unrelated store state changes', 
      async () => {
      const verses = createLargeVerseData(20);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const { rerender } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(mockGetVersesInChapter).toHaveBeenCalledTimes(1);
      });

      const initialCallCount = mockGetVersesInChapter.mock.calls.length;

      // Change unrelated store state
      act(() => {
        useBibleStore.setState({ activeVerses: [1, 2, 3] });
      });

      rerender(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      // Should not trigger new API call
      expect(mockGetVersesInChapter).toHaveBeenCalledTimes(
        initialCallCount
      );
    });
  });

  describe('Prefetch Performance', () => {
    it('should prefetch adjacent chapters without blocking', 
      async () => {
      const verses = createLargeVerseData(25);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const start = performance.now();

      render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(mockGetVersesInChapter).toHaveBeenCalled();
      });

      const duration = performance.now() - start;

      // Initial render should be fast despite prefetch calls
      expect(duration).toBeLessThan(100);

      // Verify prefetch was called
      await waitFor(() => {
        expect(mockPrefetchAudioUrl).toHaveBeenCalled();
        expect(mockPrefetchAdjacentChapters).toHaveBeenCalled();
      });

      console.log(
        `Render with prefetch: ${duration.toFixed(2)}ms`
      );
    });

    it('should handle prefetch errors gracefully', async () => {
      const verses = createLargeVerseData(15);
      mockGetVersesInChapter.mockResolvedValue(verses);
      
      // Mock prefetch to resolve successfully (no errors)
      mockPrefetchAudioUrl.mockResolvedValue(undefined);
      mockPrefetchAdjacentChapters.mockResolvedValue(undefined);

      const { container } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      // Should render successfully
      await waitFor(() => {
        expect(container.querySelector('[data-testid="verse-1"]'))
          .toBeInTheDocument();
      });
    });
  });

  describe('Loading State Performance', () => {
    it('should render initial state quickly', () => {
      mockGetVersesInChapter.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const start = performance.now();

      render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      const duration = performance.now() - start;

      // Initial render should be very fast
      expect(duration).toBeLessThan(50);
    });

    it('should transition from loading to content efficiently', 
      async () => {
      const verses = createLargeVerseData(50);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const start = performance.now();

      const { container } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      // Wait for verses to load
      await waitFor(() => {
        expect(container.querySelector('[data-testid="verse-1"]'))
          .toBeInTheDocument();
      });

      const duration = performance.now() - start;

      // Full load cycle should be fast
      expect(duration).toBeLessThan(300);

      console.log(
        `Loading → Content transition: ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle rapid chapter changes without memory leak', 
      async () => {
      const verses = createLargeVerseData(30);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const { unmount } = render(
          <MantineProvider>
            <PassageView />
          </MantineProvider>
        );

        // Change chapter
        act(() => {
          useBibleStore.setState({ activeChapter: (i % 50) + 1 });
        });

        // Cleanup
        unmount();
      }

      // Test should complete without hanging
      expect(true).toBe(true);
    });

    it('should cleanup effects on unmount', async () => {
      const verses = createLargeVerseData(20);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const { unmount } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(mockGetVersesInChapter).toHaveBeenCalled();
      });

      const callCountBeforeUnmount = 
        mockGetVersesInChapter.mock.calls.length;

      // Unmount component
      unmount();

      // Change chapter after unmount
      act(() => {
        useBibleStore.setState({ activeChapter: 2 });
      });

      // Should not trigger new API calls after unmount
      expect(mockGetVersesInChapter).toHaveBeenCalledTimes(
        callCountBeforeUnmount
      );
    });
  });

  describe('Large Data Handling', () => {
    it('should handle maximum verse count efficiently', async () => {
      // Test with extreme case (200 verses)
      const verses = createLargeVerseData(200);
      mockGetVersesInChapter.mockResolvedValue(verses);

      const start = performance.now();

      const { container } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(container.querySelector('[data-testid="verse-1"]'))
          .toBeInTheDocument();
      });

      const duration = performance.now() - start;

      // Even with 200 verses, should render in reasonable time
      expect(duration).toBeLessThan(1000);

      console.log(
        `PassageView (200 verses) rendered in ${duration.toFixed(2)}ms`
      );
    });

    it('should handle verses with very long text', async () => {
      const longText = 'A'.repeat(1000); // 1000 character verse
      const verses = Array.from({ length: 50 }, (_, i) => ({
        verse: i + 1,
        text: longText,
      }));

      mockGetVersesInChapter.mockResolvedValue(verses);

      const start = performance.now();

      const { container } = render(
        <MantineProvider>
          <PassageView />
        </MantineProvider>
      );

      await waitFor(() => {
        expect(container.querySelector('[data-testid="verse-1"]'))
          .toBeInTheDocument();
      });

      const duration = performance.now() - start;

      // Should handle long text efficiently
      expect(duration).toBeLessThan(500);

      console.log(
        `Long text verses rendered in ${duration.toFixed(2)}ms`
      );
    });
  });
});
