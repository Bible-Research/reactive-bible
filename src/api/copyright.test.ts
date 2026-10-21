import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import * as api from './index';
import * as cacheManager from '../utils/cacheManager';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';

describe('getCopyrightInfo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(
      cacheManager, 'getCachedCopyright'
    ).mockReturnValue(null);
    vi.spyOn(cacheManager, 'cacheCopyright');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached data without fetch', async () => {
    const cached = [
      {
        id: 'ENGESV',
        type: 'text_plain',
        size: 'C',
        copyright: '© 2001 Crossway',
        copyright_date: '2001',
        copyright_description: 'ESV Bible',
      },
    ];
    (
      cacheManager.getCachedCopyright as unknown as ReturnType<
        typeof vi.spyOn
      >
    ).mockReturnValue(cached);

    const result = await api.getCopyrightInfo(
      'ENGESV'
    );

    expect(result).toEqual(cached);
    expect(cacheManager.cacheCopyright).not.toHaveBeenCalled();
  });

  it('fetches and caches data on cache miss', async () => {
    // Literal expected payload — mirrors the MSW
    // /bible/copyright/ fixture — so the cache write is pinned
    // to the server contract, not to whatever was returned.
    const expected = [
      {
        id: 'ENGESV',
        type: 'text_plain',
        size: 'C',
        copyright: '© 2001 Test Copyright',
        copyright_date: '2001',
        copyright_description: 'The Holy Bible, Test Version',
      },
    ];

    const result = await api.getCopyrightInfo(
      'ENGESV'
    );

    expect(result).toEqual(expected);
    expect(cacheManager.cacheCopyright).toHaveBeenCalledWith(
      'ENGESV',
      expected
    );
  });

  it('returns empty array on fetch failure', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/api/v1/bible/copyright/`,
        () => new HttpResponse(null, { status: 500 })
      )
    );

    const result = await api.getCopyrightInfo(
      'ENGESV'
    );

    expect(result).toEqual([]);
  });
});
