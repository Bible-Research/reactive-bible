import React from 'react';
import { useRenderCount } from './performanceUtils';

/**
 * Performance testing utilities for React components.
 * Non-component helpers live in `performanceUtils.ts`.
 */

interface RenderCounterProps {
  children: (count: number) => React.ReactNode;
}

/**
 * Component wrapper that tracks render count
 * Usage: <RenderCounter>{(count) => <YourComponent />}</RenderCounter>
 */
export function RenderCounter({ children }: RenderCounterProps) {
  const count = useRenderCount();
  return <>{children(count)}</>;
}
