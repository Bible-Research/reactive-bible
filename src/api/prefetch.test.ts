import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import {
  getVersesFromApi,
  prefetchAdjacentChapters,
} from './verses';
import {
  getBibleAudioUrl,
  prefetchAudioUrl,
} from './audio';
import { BookNotInFilesetError } from './errors';
import {
  resetActiveStructure,
  setActiveStructure,
} from '../utils/bookNameRegistry';
import { getCachedAudioUrl } from '../utils/cacheManager';
import type { BibleStructure } from '../types';

const API_URL = `${API_BASE_URL}/api/v1`;

/**
 * Partial-coverage structure shaped like the reported Latvian
 * filesets: Genesis covers only chapters 1-2 and Esther is
 * absent entirely, so GEN 2's "next" neighbor (GEN 3) and any
 * Esther chapter are known coverage misses the prefetch paths
 * must skip instead of firing guaranteed 404s.
 */
const partialStructure: BibleStructure = {
  books: [
    {
      book_id: 'GEN',
      name: 'Genesis',
      name_short: 'Genesis',
      testament: 'OT',
      chapters: [1, 2],
    },
    {
      book_id: 'JHN',
      name: 'John',
      name_short: 'John',
      testament: 'NT',
      chapters: [1, 2, 3],
    },
  ],
};

const countBibleRequests = () => {
  let calls = 0;
  server.use(
    http.get(`${API_URL}/bible`, () => {
      calls += 1;
      return HttpResponse.json({ verses: [] });
    })
  );
  return () => calls;
};

const notFoundBody = () =>
  HttpResponse.json(
    {
      error: 'Book is not available in this fileset',
      error_code: 'book_not_in_fileset',
    },
    { status: 404 }
  );

beforeEach(() => {
  resetActiveStructure();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prefetchAdjacentChapters coverage gating', () => {
  it('skips a chapter the loaded structure does not cover',
    async () => {
      setActiveStructure(partialStructure);
      const calls = countBibleRequests();

      await prefetchAdjacentChapters('GEN', 2, 'SOMEFS');
      // The prefetches are fire-and-forget — let them settle.
      await vi.waitFor(() => expect(calls()).toBe(1));

      // GEN 1 (covered) prefetched; GEN 3 (uncovered) skipped —
      // the guaranteed 404 never reaches the wire.
      expect(calls()).toBe(1);
    });

  it('still fetches when no structure has loaded yet', async () => {
    // Registry at version 0 = coverage unknown — the request
    // fires and the expected coverage miss stays quiet.
    server.use(
      http.get(`${API_URL}/bible`, () => notFoundBody())
    );

    await prefetchAdjacentChapters('EST', 1, 'LVSGLU8');
    await vi.waitFor(() =>
      expect(console.debug).toHaveBeenCalled()
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps warning on a non-coverage prefetch failure',
    async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            { error: 'provider down', error_code: 'upstream' },
            { status: 500 }
          )
        )
      );

      await prefetchAdjacentChapters('EST', 1, 'LVSGLU8');
      await vi.waitFor(() =>
        expect(console.warn).toHaveBeenCalled()
      );
    });
});

describe('prefetchAudioUrl coverage gating', () => {
  it('skips a chapter the loaded structure does not cover',
    async () => {
      setActiveStructure(partialStructure);
      const calls = countBibleRequests();

      await prefetchAudioUrl('EST', 2, 'LATLVRP1DA-opus16');

      expect(calls()).toBe(0);
      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

  it('keeps prefetching bundled KJV audio regardless of ' +
    'the loaded structure', async () => {
      setActiveStructure(partialStructure);
      const calls = countBibleRequests();

      await prefetchAudioUrl('EST', 1, 'ENGKJV');

      // Wordpocket URLs are built locally — covered by
      // definition, cached, and never hit the API.
      expect(calls()).toBe(0);
      expect(getCachedAudioUrl('EST', 1, 'ENGKJV'))
        .toBeTruthy();
    });

  it('stays quiet on an expected coverage miss when ' +
    'coverage is unknown', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => notFoundBody())
      );

      await prefetchAudioUrl('EST', 2, 'LATLVRP1DA');

      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

  it('keeps warning on a non-coverage prefetch failure',
    async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            { error: 'provider down', error_code: 'upstream' },
            { status: 500 }
          )
        )
      );

      await prefetchAudioUrl('EST', 2, 'LATLVRP1DA');

      expect(console.warn).toHaveBeenCalled();
    });
});

describe('coverage-miss logging dedupe', () => {
  it('getVersesFromApi throws BookNotInFilesetError ' +
    'without logging — the caller surfaces it', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => notFoundBody())
      );

      await expect(
        getVersesFromApi('EST', 1, 'LVSGLU8')
      ).rejects.toBeInstanceOf(BookNotInFilesetError);
      expect(console.error).not.toHaveBeenCalled();
    });

  it('getVersesFromApi still logs non-coverage failures',
    async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            { error: 'provider down', error_code: 'upstream' },
            { status: 500 }
          )
        )
      );

      await expect(
        getVersesFromApi('EST', 1, 'LVSGLU8')
      ).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });

  it('getBibleAudioUrl throws BookNotInFilesetError ' +
    'without logging — the alternates walk owns it', async () => {
      server.use(
        http.get(`${API_URL}/bible`, () => notFoundBody())
      );

      await expect(
        getBibleAudioUrl('EST', 2, 'LATLVRP1DA')
      ).rejects.toBeInstanceOf(BookNotInFilesetError);
      expect(console.error).not.toHaveBeenCalled();
    });

  it('getBibleAudioUrl still logs non-coverage failures',
    async () => {
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json(
            { error: 'provider down', error_code: 'upstream' },
            { status: 500 }
          )
        )
      );

      await expect(
        getBibleAudioUrl('EST', 2, 'LATLVRP1DA')
      ).rejects.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
});
