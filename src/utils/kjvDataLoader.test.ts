import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

// loadKjvData's two boundaries are mocked at the module level:
// kjv.json (vi.doMock — not hoisted vi.mock — so each test
// picks its own behavior after vi.resetModules; a throwing
// factory makes the dynamic import reject the way a 404'd
// hashed chunk does after a deploy) and chunkLoadError's
// helpers, whose mocked return values decide whether the
// guarded-reload branch fires. The real helpers' behavior —
// message classification, the reload guard — is covered by
// lazyWithReload.test.tsx.
const mockKjvImport = (error?: Error) => {
  vi.doMock('../assets/kjv.json', () => {
    if (error) {
      throw error;
    }
    return { default: [] };
  });
};

const mockChunkHelpers = (
  isChunkError: boolean,
  reloadTriggered: boolean
) => {
  vi.doMock('./chunkLoadError', () => ({
    isChunkLoadError: vi.fn(() => isChunkError),
    reloadForStaleChunk: vi.fn(() => reloadTriggered),
  }));
};

const importLoader = () => import('./kjvDataLoader');

const mockedReloadForStaleChunk = async () =>
  (await import('./chunkLoadError')).reloadForStaleChunk;

beforeEach(() => {
  vi.resetModules();
  // The loader logs handled failures before rethrowing — keep
  // the test output clean.
  vi.spyOn(console, 'error').mockImplementation(
    () => undefined
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('../assets/kjv.json');
  vi.doUnmock('./chunkLoadError');
});

describe('loadKjvData', () => {
  it('returns the imported data on success', async () => {
    mockKjvImport();
    const { loadKjvData } = await importLoader();
    await expect(loadKjvData()).resolves.toEqual([]);
  });

  it('holds the promise pending when the reload fires',
    async () => {
      mockKjvImport(new Error('import failed'));
      mockChunkHelpers(true, true);
      const { loadKjvData } = await importLoader();

      const promise = loadKjvData();
      let settled = false;
      void promise.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );

      await vi.waitFor(async () =>
        expect(
          await mockedReloadForStaleChunk()
        ).toHaveBeenCalledTimes(1)
      );
      // Flush microtasks — the returned promise must stay
      // pending while the reload tears the page down.
      await Promise.resolve();
      expect(settled).toBe(false);
    });

  it('rethrows as a KJV error once the reload guard fired',
    async () => {
      mockKjvImport(new Error('import failed'));
      mockChunkHelpers(true, false);
      const { loadKjvData } = await importLoader();
      await expect(loadKjvData()).rejects.toThrow(
        'Failed to load KJV Bible data'
      );
      expect(await mockedReloadForStaleChunk())
        .toHaveBeenCalledTimes(1);
    });

  it('skips the reload entirely for non-chunk failures',
    async () => {
      mockKjvImport(new Error('boom'));
      mockChunkHelpers(false, false);
      const { loadKjvData } = await importLoader();
      await expect(loadKjvData()).rejects.toThrow(
        'Failed to load KJV Bible data'
      );
      expect(await mockedReloadForStaleChunk())
        .not.toHaveBeenCalled();
    });
});
