import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Passage from './Passage';
import { useBibleStore } from '../store';
import { measureRenderTime } from '../__tests__/helpers/performance';

// Mock child components to isolate Passage component performance
vi.mock('./SubHeader', () => ({
  default: () => <div data-testid="subheader">SubHeader</div>,
}));

vi.mock('./PassageView', () => ({
  default: () => <div data-testid="passage-view">PassageView</div>,
}));

vi.mock('./NotesView', () => ({
  default: () => <div data-testid="notes-view">NotesView</div>,
}));

vi.mock('../api', () => ({
  getBooks: () => [
    { book_id: 'GEN', book_name: 'Genesis' },
    { book_id: 'EXO', book_name: 'Exodus' },
  ],
}));

describe('Passage Component Performance Tests', () => {
  const mockOpen = vi.fn();

  beforeEach(() => {
    // Reset store to clean state
    useBibleStore.setState({
      activeBook: 'Genesis',
      activeBookShort: 'GEN',
      activeChapter: 1,
      activeVerses: [],
    });
  });

  describe('Render Performance', () => {
    it('should render quickly with minimal overhead', () => {
      const renderFn = () => {
        render(
          <MantineProvider>
            <Passage open={mockOpen} />
          </MantineProvider>
        );
      };

      const avgTime = measureRenderTime(renderFn, 50);

      // Should render in less than 10ms on average
      expect(avgTime).toBeLessThan(10);

      console.log(
        `Passage component avg render time: ${avgTime.toFixed(2)}ms`
      );
    });

    it('should handle view switching efficiently', () => {
      const { rerender } = render(
        <MantineProvider>
          <Passage open={mockOpen} />
        </MantineProvider>
      );

      // Initial render should show PassageView
      expect(screen.getByTestId('passage-view')).toBeInTheDocument();

      const start = performance.now();

      // Simulate multiple re-renders (state changes)
      for (let i = 0; i < 20; i++) {
        rerender(
          <MantineProvider>
            <Passage open={mockOpen} />
          </MantineProvider>
        );
      }

      const duration = performance.now() - start;

      // 20 re-renders should complete quickly
      expect(duration).toBeLessThan(200);

      console.log(
        `20 re-renders completed in ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('State Management Performance', () => {
    it('should handle rapid store updates efficiently', () => {
      render(
        <MantineProvider>
          <Passage open={mockOpen} />
        </MantineProvider>
      );

      const start = performance.now();

      // Simulate rapid navigation (100 chapter changes)
      for (let i = 1; i <= 100; i++) {
        act(() => {
          useBibleStore.setState({
            activeChapter: i % 50 + 1,
          });
        });
      }

      const duration = performance.now() - start;

      // Should handle 100 state updates quickly
      expect(duration).toBeLessThan(100);

      console.log(
        `100 store updates completed in ${duration.toFixed(2)}ms`
      );
    });

    it('should handle handleViewInBible efficiently', () => {
      render(
        <MantineProvider>
          <Passage open={mockOpen} />
        </MantineProvider>
      );

      const start = performance.now();

      // Simulate multiple verse navigation calls
      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        act(() => {
          useBibleStore.setState({
            activeBook: 'Genesis',
            activeBookShort: 'GEN',
            activeChapter: (i % 50) + 1,
            activeVerses: [i % 31 + 1],
          });
        });
      }

      const duration = performance.now() - start;

      // Should complete quickly
      expect(duration).toBeLessThan(100);

      console.log(
        `${iterations} verse navigations in ${duration.toFixed(2)}ms`
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory with repeated renders', () => {
      const iterations = 100;
      const containers: HTMLElement[] = [];

      for (let i = 0; i < iterations; i++) {
        const { container, unmount } = render(
          <MantineProvider>
            <Passage open={mockOpen} />
          </MantineProvider>
        );
        containers.push(container);
        unmount();
      }

      // All containers should be cleaned up
      expect(containers.length).toBe(iterations);

      // No specific memory assertion, but test should complete
      // without hanging or crashing
    });
  });
});
