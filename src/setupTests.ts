import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { server } from './mocks/server';

// Mock localStorage for tests. Includes `length`/`key()` so code
// paths that enumerate keys behave like the real Storage object.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Mock Vercel Analytics and Speed Insights to prevent
// external script loading errors in test environment
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

vi.mock('@vercel/speed-insights/react', () => ({
  SpeedInsights: () => null,
}));

// Establish API mocking before all tests. 'error' (not 'warn')
// fails any test whose code path hits an endpoint with no
// matching handler — proof that every production egress is
// covered by src/mocks/handlers.ts.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => {
  server.resetHandlers();
});

// Reset all shared state before each test: localStorage, the
// cacheManager module-level read-through cache, and both
// persisted zustand stores back to their initial state.
//
// The imports MUST be lazy: a static import here would populate
// this file's module cache during setup — before the test file's
// `vi.mock` factories register — and bind `./store`/`./api`/
// `./utils/cacheManager` to real implementations, silently
// defeating per-file mocks. Dynamic import inside the hook
// resolves the same module instance the test file sees (mocked
// deps included). Files that mock `../store` wholesale are
// guarded by the `?.`/`initialState` checks.
beforeEach(async () => {
  localStorage.clear();

  // try/catch: a test file may factory-mock the module without
  // the export — merely accessing it then throws (vitest).
  try {
    const cacheManager = await import('./utils/cacheManager');
    cacheManager.resetStorageCacheForTests?.();
  } catch {
    // mocked without the export — nothing to reset
  }

  try {
    const bible = await import('./store');
    if (bible.initialState) {
      bible.useBibleStore?.setState?.(bible.initialState);
    }
  } catch {
    // mocked without the store — nothing to reset
  }

  try {
    const auth = await import('./stores/authStore');
    if (auth.initialState) {
      auth.useAuthStore?.setState?.(auth.initialState);
    }
  } catch {
    // mocked without the store — nothing to reset
  }
});

// Clean up after the tests are finished.
afterAll(() => server.close());
