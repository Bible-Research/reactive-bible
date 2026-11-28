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
import {
  registerStructureCoverage,
  resetStructureCoverage,
} from '../utils/structureCoverage';
import { getCachedAudioUrl } from '../utils/cacheManager';
import type { BibleStructure, Translation } from '../types';

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

/**
 * Full-canon active structure for the audio-oracle tests: the
 * READ version covers Job, so the old "read structure stands in
 * for audio coverage" approximation passes — only the audio
 * fileset's own structure can prove the prefetch doomed.
 */
const otCoveringStructure: BibleStructure = {
  books: [
    {
      book_id: 'JOB',
      name: 'Job',
      name_short: 'Job',
      testament: 'OT',
      chapters: [13, 14, 15, 25, 26],
    },
  ],
};

/**
 * The reported Latvian audio translation: LAVLVR's filesets
 * cover Psalms + NT only (LATLVRN1DA is NT-only, LATLVRP1DA a
 * partial OT recording that lacks Job entirely).
 */
const LAVLVR: Translation = {
  abbr: 'LAVLVR',
  name: 'Latvian Audio',
  language: 'Latvian',
  language_iso: 'lvs',
  filesets: [
    { id: 'LATLVRP1DA', type: 'audio', size: 'OTP',
      codec: 'mp3', bitrate: '64' },
    { id: 'LATLVRP1DA-opus16', type: 'audio', size: 'OTP',
      codec: 'opus', bitrate: '16' },
    { id: 'LATLVRN1DA', type: 'audio', size: 'NT',
      codec: 'mp3', bitrate: '64' },
    { id: 'LATLVRN1DA-opus16', type: 'audio', size: 'NT',
      codec: 'opus', bitrate: '16' },
  ],
};

/** LAVLVR's own structure: Psalms + the New Testament, no Job. */
const lavlvrStructure: BibleStructure = {
  books: [
    {
      book_id: 'PSA',
      name: 'Psalms',
      name_short: 'Psa',
      testament: 'OT',
      chapters: [1, 2, 3],
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
  resetStructureCoverage();
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
  it('skips a chapter the AUDIO fileset\u2019s structure does ' +
    'not cover even when the read version covers it',
    async () => {
      // The reported residual: text prefetch for Job succeeds
      // under the read version (LVSGLU8), so the old
      // active-structure gate passed and the NT-only LAVLVR
      // audio still fired a guaranteed 404.
      setActiveStructure(otCoveringStructure);
      registerStructureCoverage('LAVLVR', lavlvrStructure);
      const calls = countBibleRequests();

      await prefetchAudioUrl(
        'JOB', 14, 'LATLVRP1DA-opus16', [LAVLVR],
      );

      expect(calls()).toBe(0);
      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

  it('prefetches a chapter the audio structure does cover',
    async () => {
      registerStructureCoverage('LAVLVR', lavlvrStructure);
      server.use(
        http.get(`${API_URL}/bible`, () =>
          HttpResponse.json({
            audio_url: 'https://cdn.test/jhn2.mp3',
          })
        )
      );

      await prefetchAudioUrl(
        'JHN', 2, 'LATLVRN1DA', [LAVLVR],
      );

      expect(
        getCachedAudioUrl('JHN', 2, 'LATLVRN1DA')
      ).toBeTruthy();
    });

  it('still fires when the audio fileset\u2019s coverage is ' +
    'unknown (owner unresolved)', async () => {
      // No translations: the fileset's owning bible cannot be
      // resolved, so covered-when-unknown applies — only a
      // KNOWN absent coverage may skip the request.
      setActiveStructure(otCoveringStructure);
      let calls = 0;
      server.use(
        http.get(`${API_URL}/bible`, () => {
          calls += 1;
          return notFoundBody();
        })
      );

      await prefetchAudioUrl(
        'JOB', 14, 'LATLVRP1DA-opus16', [],
      );

      expect(calls).toBe(1);
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
