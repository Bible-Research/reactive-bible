import { Component, Suspense } from 'react';
import type {
  ComponentType,
  ReactNode,
} from 'react';
import { render, screen } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

// The stale-chunk recovery path must reload the page exactly
// once per URL per tab session — happy-dom's Location#reload is
// stubbed per test so navigation is observable, and
// `vi.resetModules()` simulates the reload wiping module state
// while sessionStorage (the cross-load guard) survives.
let reloadMock: ReturnType<typeof vi.fn>;
let originalUrl: string;

const stubReload = () => {
  reloadMock = vi.fn();
  Object.defineProperty(window.location, 'reload', {
    configurable: true,
    writable: true,
    value: reloadMock,
  });
};

const chromeChunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: ' +
      'https://example.com/assets/AddStandaloneNoteModal-x.js'
  );

interface BoundaryState {
  error: Error | null;
}

// Minimal boundary so rethrown import errors are observable in
// the DOM instead of crashing the test render.
class CaptureBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div data-testid="boundary-error">
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

beforeEach(() => {
  originalUrl = window.location.href;
  vi.resetModules();
  window.sessionStorage.clear();
  stubReload();
});

afterEach(() => {
  // A test that navigated must not leak its URL into the next
  // test's reload-guard key if it throws mid-way.
  window.history.pushState({}, '', originalUrl);
  // Drop the own-property stub so the prototype's real reload
  // is visible again for the next test.
  delete (window.location as Partial<Location>).reload;
  vi.restoreAllMocks();
});

describe('isChunkLoadError', () => {
  it('matches the browser stale-chunk strings', async () => {
    const { isChunkLoadError } = await import('./chunkLoadError');
    const cases = [
      'Failed to fetch dynamically imported module: ' +
        'https://example.com/assets/a.js',
      'error loading dynamically imported module: ' +
        'https://example.com/assets/a.js',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
      'Loading CSS chunk 421 failed. (missing: ' +
        'https://example.com/assets/x.css)',
      'Unable to preload CSS for ' +
        'https://example.com/assets/a.css',
    ];
    for (const message of cases) {
      expect(isChunkLoadError(new Error(message))).toBe(true);
    }
  });

  it('matches ChunkLoadError by name', async () => {
    const { isChunkLoadError } = await import('./chunkLoadError');
    const err = new Error('chunk request failed');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('rejects unrelated errors and non-Error values', async () => {
    const { isChunkLoadError } = await import('./chunkLoadError');
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically ' +
      'imported module')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  it('reloads once and reports the trigger', async () => {
    const { reloadForStaleChunk } =
      await import('./chunkLoadError');
    expect(reloadForStaleChunk()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a second reload inside the same page load',
    async () => {
      const { reloadForStaleChunk } =
        await import('./chunkLoadError');
      expect(reloadForStaleChunk()).toBe(true);
      expect(reloadForStaleChunk()).toBe(false);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

  it('keeps blocking reloads after the page reloads ' +
    '(sessionStorage guard survives)', async () => {
    let mod = await import('./chunkLoadError');
    expect(mod.reloadForStaleChunk()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);

    // A real reload wipes module state; sessionStorage (and
    // the guard key it holds) lives on in the tab.
    vi.resetModules();
    mod = await import('./chunkLoadError');
    expect(mod.reloadForStaleChunk()).toBe(false);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the per-URL guard window expires',
    async () => {
      const { reloadForStaleChunk } =
        await import('./chunkLoadError');
      // Seed the guard with a timestamp older than the
      // 10-minute window — a second deploy later in the same
      // tab session must still self-heal.
      window.sessionStorage.setItem(
        'stale-chunk-reload:' +
          window.location.pathname +
          window.location.search,
        String(Date.now() - 11 * 60 * 1000)
      );
      expect(reloadForStaleChunk()).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

  it('refuses to reload while the tab is offline', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get')
      .mockReturnValue(false);
    const { reloadForStaleChunk } =
      await import('./chunkLoadError');
    // Offline, a chunk-load error is connectivity loss — let
    // it reach the error boundary instead of reloading into
    // the browser's connection-error page.
    expect(reloadForStaleChunk()).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reloads again in a new session once the guard clears',
    async () => {
      let mod = await import('./chunkLoadError');
      mod.reloadForStaleChunk();
      window.sessionStorage.clear();
      vi.resetModules();
      mod = await import('./chunkLoadError');
      expect(mod.reloadForStaleChunk()).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(2);
    });

  it('guards per URL — a different page may still reload',
    async () => {
      let mod = await import('./chunkLoadError');
      mod.reloadForStaleChunk();
      vi.resetModules();
      window.history.pushState({}, '', '/notes?tag=1');
      mod = await import('./chunkLoadError');
      expect(mod.reloadForStaleChunk()).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(2);
      // The original URL is restored by afterEach.
    });

  it('still reloads when sessionStorage is unavailable',
    async () => {
      vi.spyOn(window.sessionStorage, 'getItem')
        .mockImplementation(() => {
          throw new Error('denied');
        });
      vi.spyOn(window.sessionStorage, 'setItem')
        .mockImplementation(() => {
          throw new Error('denied');
        });
      const { reloadForStaleChunk } =
        await import('./chunkLoadError');
      expect(reloadForStaleChunk()).toBe(true);
      // The in-memory flag still bounds this page load.
      expect(reloadForStaleChunk()).toBe(false);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});

describe('lazyWithReload', () => {
  // Concrete component type for reject factories — the bare
  // `ComponentType` union itself is not assignable to the
  // `ComponentType<never>` bound inside lazyWithReload.
  type DummyModule = { default: () => JSX.Element };

  const renderLazy = (Lazy: ComponentType) =>
    render(
      <CaptureBoundary>
        <Suspense fallback={<div>chunk loading</div>}>
          <Lazy />
        </Suspense>
      </CaptureBoundary>
    );

  it('renders the module normally when the import succeeds',
    async () => {
      const { lazyWithReload } =
        await import('./lazyWithReload');
      const Lazy = lazyWithReload(() =>
        Promise.resolve({ default: () => <div>loaded</div> })
      );
      renderLazy(Lazy);
      expect(await screen.findByText('loaded'))
        .toBeInTheDocument();
      expect(reloadMock).not.toHaveBeenCalled();
    });

  it('reloads once instead of surfacing a stale-chunk error',
    async () => {
      const { lazyWithReload } =
        await import('./lazyWithReload');
      const Lazy = lazyWithReload(() =>
        Promise.reject<DummyModule>(chromeChunkError())
      );
      renderLazy(Lazy);

      // The reload is tearing the page down — the Suspense
      // fallback must stay mounted, not an error state.
      expect(await screen.findByText('chunk loading'))
        .toBeInTheDocument();
      await vi.waitFor(() =>
        expect(reloadMock).toHaveBeenCalledTimes(1)
      );
      expect(screen.queryByTestId('boundary-error')).toBeNull();
    });

  it('rethrows non-chunk import errors to the boundary',
    async () => {
      const { lazyWithReload } =
        await import('./lazyWithReload');
      const Lazy = lazyWithReload(() =>
        Promise.reject<DummyModule>(new Error('boom'))
      );
      renderLazy(Lazy);

      expect(await screen.findByTestId('boundary-error'))
        .toHaveTextContent('boom');
      expect(reloadMock).not.toHaveBeenCalled();
    });

  it('rethrows the chunk error once the reload guard fired',
    async () => {
      const { reloadForStaleChunk } =
        await import('./chunkLoadError');
      const { lazyWithReload } =
        await import('./lazyWithReload');
      // Burn the one allowed reload — a second stale-chunk
      // failure must fall through to the normal error path.
      reloadForStaleChunk();
      expect(reloadMock).toHaveBeenCalledTimes(1);

      const err = chromeChunkError();
      const Lazy = lazyWithReload(() =>
        Promise.reject<DummyModule>(err)
      );
      renderLazy(Lazy);

      expect(await screen.findByTestId('boundary-error'))
        .toHaveTextContent(err.message);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

  it('surfaces the chunk error to the boundary when offline',
    async () => {
      vi.spyOn(window.navigator, 'onLine', 'get')
        .mockReturnValue(false);
      const { lazyWithReload } =
        await import('./lazyWithReload');
      const err = chromeChunkError();
      const Lazy = lazyWithReload(() =>
        Promise.reject<DummyModule>(err)
      );
      renderLazy(Lazy);

      expect(await screen.findByTestId('boundary-error'))
        .toHaveTextContent(err.message);
      expect(reloadMock).not.toHaveBeenCalled();
    });
});
