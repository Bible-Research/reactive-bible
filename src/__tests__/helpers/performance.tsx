/**
 * Performance testing utilities
 */

/**
 * Measure component render time
 */
export function measureRenderTime(
  renderFn: () => void,
  iterations = 100
): number {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    renderFn();
  }

  const end = performance.now();
  return (end - start) / iterations;
}

/**
 * Create large mock data for performance testing
 */
export function createLargeVerseData(count: number) {
  return {
    verses: Array.from({ length: count }, (_, i) => ({
      verse: i + 1,
      text: `This is verse ${i + 1} with some sample text content that
           represents a typical Bible verse length.`,
    })),
    headings: [] as { before_verse: number; text: string }[],
  };
}

/**
 * Measure cache hit rate
 */
export class CacheMetrics {
  private hits = 0;
  private misses = 0;

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      total: this.hits + this.misses,
    };
  }
}
