import React, { ReactElement } from 'react';
import { render, RenderOptions, waitFor, act } from '@testing-library/react';
import { useAuthStore } from '../stores/authStore';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { useBibleStore, initialState } from '../store';

// Re-export mock data for convenience
export * from './mocks/data';

// Re-export factories for easy access
export * from './helpers/factories';

// Re-export performance helpers
export * from './helpers/performance';

// --- Store Helpers ---

/**
 * Creates a mock store state with optional overrides.
 * Use this to set up specific test scenarios.
 */
export function createMockStore(overrides: Partial<typeof initialState> = {}) {
  const mockFunctions = {
    setActiveBook: vi.fn(),
    setActiveBookOnly: vi.fn(),
    setActiveBookShort: vi.fn(),
    setActiveChapter: vi.fn(),
    setActiveVerses: vi.fn(),
    setBibleVersion: vi.fn(),
    setShowAudioPlayer: vi.fn(),
    setTranslations: vi.fn(),
    setActiveTextFilesetId: vi.fn(),
    setActiveAudioFilesetId: vi.fn(),
    fetchNotes: vi.fn().mockResolvedValue(undefined),
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
export function resetStore(overrides: Partial<typeof initialState> = {}) {
  const mockStore = createMockStore(overrides);
  useBibleStore.setState(mockStore);
  return mockStore;
}

// --- DOM Mocks ---

/**
 * Mocks common DOM APIs that aren't available in happy-dom/jsdom.
 * Call this in your test setup file or beforeEach().
 */
export function mockDomApis() {
  // Mock scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  // Mock document.getElementById for scroll behavior
  const originalGetElementById = document.getElementById.bind(document);
  vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
    const element = originalGetElementById(id);
    if (element) return element;
    // Return a mock element for verse scrolling
    if (id.startsWith('verse-')) {
      return {
        scrollIntoView: vi.fn(),
      } as unknown as HTMLElement;
    }
    return null;
  });

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
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

/**
 * Creates a mock localStorage implementation.
 */
export function createMockLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
}

// --- Render Helpers ---

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  storeOverrides?: Partial<typeof initialState>;
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
  const { storeOverrides, ...renderOptions } = options;

  // Reset store with any overrides
  const mockStore = resetStore(storeOverrides);

  // Mock DOM APIs
  mockDomApis();

  // Wrap in MemoryRouter for routing context
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  const result = render(ui, { wrapper: Wrapper, ...renderOptions });

  return {
    ...result,
    mockStore,
  };
}

// --- Async Helpers ---

/**
 * Waits for all pending state updates to complete.
 * Use this to avoid act() warnings when components have async effects.
 */
export async function waitForLoadingToFinish() {
  await waitFor(
    () => {
      // Check for common loading indicators
      const loadingElements = document.querySelectorAll(
        '[aria-label="loading"], [data-loading="true"]'
      );
      if (loadingElements.length > 0) {
        throw new Error('Still loading');
      }
    },
    { timeout: 3000 }
  );
}

/**
 * Flushes all pending promises and timers.
 * Useful for ensuring all async operations complete.
 */
export async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wraps an async operation to suppress act() warnings.
 * Use when you need to wait for state updates in tests.
 */
export async function actAsync(callback: () => Promise<void>) {
  const { act } = await import('@testing-library/react');
  await act(async () => {
    await callback();
    await flushPromises();
  });
}

// --- Fetch Mocks ---

/**
 * Creates a mock fetch function that returns the specified response.
 */
export function createMockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
    statusText: ok ? 'OK' : 'Error',
  });
}

/**
 * Creates a mock fetch that fails with the specified error.
 */
export function createMockFetchError(errorMessage: string) {
  return vi.fn().mockRejectedValue(new Error(errorMessage));
}

// --- Cleanup Helpers ---

/**
 * Cleans up all mocks and resets the store.
 * Call this in afterEach() for thorough cleanup.
 */
export function cleanupTestEnvironment() {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  useBibleStore.setState(initialState);
}
