import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import * as api from '../api';
import * as cacheManager from '../utils/cacheManager';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';

const COPYRIGHT_URL = `${API_BASE_URL}/api/v1/bible/copyright/`;

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
    const result = await api.getCopyrightInfo(
      'ENGESV'
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('ENGESV');
    expect(result[0].type).toBe('text_plain');
    expect(cacheManager.cacheCopyright).toHaveBeenCalledWith(
      'ENGESV',
      result
    );
  });

  it('returns empty array on fetch failure', async () => {
    server.use(
      http.get(
        COPYRIGHT_URL,
        () => new HttpResponse(null, { status: 500 })
      )
    );

    const result = await api.getCopyrightInfo(
      'ENGESV'
    );

    expect(result).toEqual([]);
  });
});
