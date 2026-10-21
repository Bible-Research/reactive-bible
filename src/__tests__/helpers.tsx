import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import {
  useBibleStore,
  initialState,
  type BibleState,
} from '../store';
import {
  useAuthStore,
  AuthState,
  initialState as authInitialState,
} from '../stores/authStore';

// The `export *` re-exports below are test-only barrels — they
// can never be fast-refresh boundaries, but the rule can't
// verify wildcard re-exports, so each needs a scoped disable.

// Re-export mock data for convenience
// eslint-disable-next-line react-refresh/only-export-components
export * from './mocks/data';

// Re-export factories for easy access
// eslint-disable-next-line react-refresh/only-export-components
export * from './helpers/factories';

// Re-export performance helpers (performanceUtils already
// re-exports everything performance.tsx defines).
// eslint-disable-next-line react-refresh/only-export-components
export * from './helpers/performanceUtils';

// --- Store Helpers ---

/**
 * Creates a mock store state with optional overrides.
 * Internal building block for `resetStore` — tests should call
 * `resetStore` (which also applies the state) rather than this.
 */
function createMockStore(overrides: Partial<BibleState> = {}) {
  const mockFunctions = {
    setActiveBookAndChapter: vi.fn(),
    setActiveChapter: vi.fn(),
    setVerseSelection: vi.fn(),
    toggleVerseRef: vi.fn(),
    selectVerseRange: vi.fn(),
    setBibleVersion: vi.fn(),
    setShowAudioPlayer: vi.fn(),
    setTranslations: vi.fn(),
    setActiveTextFilesetId: vi.fn(),
    setActiveAudioFilesetId: vi.fn(),
    fetchNotes: vi.fn().mockResolvedValue(undefined),
    setPendingScrollVerse: vi.fn(),
    setActiveBookWithPosition:
      vi.fn().mockResolvedValue(undefined),
    syncReadingPosition: vi.fn(),
    prefetchReadingPositions:
      vi.fn().mockResolvedValue(undefined),
  };

  return {
    ...initialState,
    ...mockFunctions,
    ...overrides,
  };
}

/**
 * Resets the Zustand store to initial state with mock functions.
 * Call this in beforeEach() to ensure test isolation.
 */
export function resetStore(overrides: Partial<BibleState> = {}) {
  const mockStore = createMockStore(overrides);
  useBibleStore.setState(mockStore);
  return mockStore;
}

// --- DOM Mocks ---

/**
 * Mocks common DOM APIs that aren't available in happy-dom/jsdom.
 * Call this in your test setup file or beforeEach().
 * Idempotent — safe to call more than once per test file.
 */
export function mockDomApis() {
  // Mock scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  // Mock document.getElementById for scroll behavior.
  // Guard the spy: re-wrapping an already-spied method binds
  // `original` to the spy itself and recurses infinitely once
  // enough tests have rendered in the same environment.
  if (!vi.isMockFunction(document.getElementById)) {
    const originalGetElementById =
      document.getElementById.bind(document);
    vi.spyOn(document, 'getElementById').mockImplementation(
      (id: string) => {
        const element = originalGetElementById(id);
        if (element) return element;
        // Return a mock element for verse scrolling
        if (id.startsWith('verse-')) {
          return {
            scrollIntoView: vi.fn(),
          } as unknown as HTMLElement;
        }
        return null;
      }
    );
  }

  // Mock matchMedia for theme tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  });

  // Mock URL.createObjectURL / revokeObjectURL — happy-dom
  // doesn't support File as a Blob subclass
  global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
  global.URL.revokeObjectURL = vi.fn();
}

// --- Render Helpers ---

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  stores?: {
    bible?: Partial<BibleState>;
    auth?: Partial<AuthState>;
  };
  /** Legacy alias for stores.bible. */
  storeOverrides?: Partial<BibleState>;
  /** Legacy alias for stores.auth. */
  authStoreState?: Partial<AuthState>;
}

/**
 * Renders a component with common providers and store setup.
 * Automatically resets the store before rendering.
 * Wraps component in MemoryRouter for routing context.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: ExtendedRenderOptions = {}
) {
  const { stores, storeOverrides, authStoreState, ...renderOptions } =
    options;

  const bibleOverrides = stores?.bible ?? storeOverrides;
  const authOverrides = stores?.auth ?? authStoreState;

  // Reset stores to their initial states plus any overrides
  const bibleState = bibleOverrides
    ? { ...initialState, ...bibleOverrides }
    : initialState;
  useBibleStore.setState(bibleState);

  useAuthStore.setState(
    authOverrides
      ? { ...authInitialState, ...authOverrides }
      : authInitialState
  );

  // Mock DOM APIs
  mockDomApis();

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    // Full store state incl. real actions — tests both read
    // values and call actions like mockStore.setVerseSelection.
    mockStore: useBibleStore.getState(),
  };
}

/**
 * Flushes pending microtasks — use inside act() to let a chain
 * of awaited promises settle before asserting.
 */
export async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
