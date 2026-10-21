import { useRef, useEffect } from 'react';

/**
 * Non-component performance testing utilities. Kept in a `.ts`
 * file so `react-refresh/only-export-components` (which only
 * scans `.jsx`/`.tsx`) does not flag them next to
 * `RenderCounter` in `performance.tsx`.
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

// Shared non-component utils live in ./performance — re-export
// them so `./performanceUtils` remains a superset barrel without
// duplicating declarations (which would collide under the
// `export *` chains in helpers.tsx).
export {
  measureRenderTime,
  createLargeVerseData,
  CacheMetrics,
} from './performance';

/**
 * Wait for next frame (useful for testing animations/transitions)
 */
export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
