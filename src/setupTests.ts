import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { server } from './mocks/server';
import { initI18n } from './i18n';

// Default `en` catalog for every test — components render real
// translated strings, so text queries keep matching.
void initI18n();

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

// Restore the MSW-intercepted fetch (captured after listen())
// each test — tests that assign `global.fetch = vi.fn()`
// directly (rather than vi.stubGlobal) would otherwise leak
// their replacement into later tests, silently bypassing MSW.
let interceptedFetch: typeof fetch;

// Establish API mocking before all tests. 'error' (not 'warn')
// fails any test whose code path hits an endpoint with no
// matching handler — proof that every production egress is
// covered by src/mocks/handlers.ts.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  interceptedFetch = globalThis.fetch;
});

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
  globalThis.fetch = interceptedFetch;

  // try/catch: a test file may factory-mock the module without
  // the export — merely accessing it then throws (vitest).
  // The registry imports run concurrently — each sequential
  // `await` here is a suspension point that widens the window
  // for a previous test's dangling async work (e.g. an
  // authStore persist write) to land AFTER localStorage.clear
  // and poison the next test's hydration.
  const [cacheManager, registry, coverage, structureSlice] =
    await Promise.all([
      import('./utils/cacheManager').catch(() => null),
      import('./utils/bookNameRegistry').catch(() => null),
      import('./utils/structureCoverage').catch(() => null),
      import('./stores/bibleStore/structureSlice').catch(
        () => null
      ),
    ]);
  // The bookNameRegistry sync view and the abbr-keyed coverage
  // oracle (audio filesets' own structures) are module state
  // outside the store — without resets they leak across tests.
  // try/catch per call: a factory-mocked module THROWS when a
  // non-exported name is merely accessed, not just undefined.
  try {
    cacheManager?.resetStorageCacheForTests?.();
  } catch {
    // mocked without the export — nothing to reset
  }
  try {
    registry?.resetActiveStructure?.();
  } catch {
    // mocked without the export — nothing to reset
  }
  try {
    coverage?.resetStructureCoverage?.();
  } catch {
    // mocked without the export — nothing to reset
  }
  try {
    // A held-open structure fetch would poison dedupe for
    // later tests in the same file.
    structureSlice?.resetStructureInflightForTests?.();
  } catch {
    // mocked without the export — nothing to reset
  }

  // structuredClone gives each test fresh nested objects —
  // sharing initialState's arrays/objects would let one test's
  // in-place mutation leak into later tests. Both initialState
  // objects are plain data (no functions), so cloning is safe.
  try {
    const bible = await import('./store');
    if (bible.initialState) {
      bible.useBibleStore?.setState?.(
        structuredClone(bible.initialState)
      );
    }
  } catch {
    // mocked without the store — nothing to reset
  }

  try {
    const auth = await import('./stores/authStore');
    if (auth.initialState) {
      auth.useAuthStore?.setState?.(
        structuredClone(auth.initialState)
      );
    }
  } catch {
    // mocked without the store — nothing to reset
  }

  // UI language resets to the `en` catalog so text queries keep
  // matching the English strings tests assert on.
  try {
    const i18n = (await import('./i18n')).default;
    if (i18n.language !== 'en') {
      await i18n.changeLanguage('en');
    }
  } catch {
    // i18n unavailable — nothing to reset
  }
});

// Clean up after the tests are finished.
afterAll(() => server.close());
