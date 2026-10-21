import { useRef, useEffect } from 'react';

/**
 * Non-component performance testing utilities that have no
 * home in `performance.tsx` — kept in a `.ts` file so
 * `react-refresh/only-export-components` does not flag them.
 * `measureRenderTime`, `createLargeVerseData` and
 * `CacheMetrics` live in `performance.tsx`.
 */

/**
 * Hook to track component render count
 * Usage: const renderCount = useRenderCount();
 */
export function useRenderCount() {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
  });

  return renderCount.current;
}

/**
 * Wait for next frame (useful for testing animations/transitions)
 */
export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
