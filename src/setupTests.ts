import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { server } from './mocks/server';

// happy-dom provides a real localStorage (with length/key()) —
// no stub is needed. The old bespoke stub lacked enumeration
// support, a latent drift source.
//
// IMPORTANT: do not statically import app modules (store,
// authStore, cacheManager) here — setup files run before the
// test file's vi.mock() registrations, so an eager import would
// permanently bind the REAL module into the file's module
// registry and vi.mock('../api') would silently stop
// intercepting the store's calls. The resets below use lazy
// dynamic imports instead, which resolve through each test
// file's own (mock-aware) registry.

// Mock Vercel Analytics and Speed Insights to prevent
// external script loading errors in test environment
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('@vercel/speed-insights/react', () => ({
  SpeedInsights: () => null,
}));

// Restore the MSW-intercepted fetch (captured after listen())
// each test — tests that do `global.fetch = vi.fn()` would
// otherwise leak their replacement into later tests, silently
// bypassing MSW.
let interceptedFetch: typeof fetch;

// Establish API mocking before all tests. 'error' makes any
// unstubbed request — including writes to the real production
// API — fail loudly instead of passing through.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  interceptedFetch = globalThis.fetch;
});

interface StoreLike {
  getInitialState?: () => unknown;
  setState?: unknown;
}

const resetStoreToInitial = (store: StoreLike) => {
  // When a test file vi.mock's the store module the binding
  // here resolves to the mock — skip rather than crash.
  if (typeof store.getInitialState !== 'function') return;
  const setState = store.setState as
    | ((state: unknown, replace?: boolean) => void)
    | undefined;
  setState?.(store.getInitialState(), true);
};

// Per-test isolation: stores, storage snapshot cache, and
// localStorage all reset before every test.
beforeEach(async () => {
  localStorage.clear();
  globalThis.fetch = interceptedFetch;
  const [storeMod, authMod, cacheMod] = await Promise.all([
    import('./store'),
    import('./stores/authStore'),
    import('./utils/cacheManager'),
  ]);
  // try/catch guard: a test file that vi.mock's the module
  // (e.g. '../utils/cacheManager') swaps this binding for the
  // automock proxy, which THROWS on missing-export access —
  // even `?.()` can't help there.
  try {
    cacheMod.resetStorageCacheForTests?.();
  } catch {
    /* module is mocked in this file */
  }
  try {
    resetStoreToInitial(storeMod.useBibleStore);
  } catch {
    /* module is mocked in this file */
  }
  try {
    resetStoreToInitial(authMod.useAuthStore);
  } catch {
    /* module is mocked in this file */
  }
});

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Clean up after the tests are finished.
afterAll(() => server.close());
