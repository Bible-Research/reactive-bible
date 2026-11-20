import { describe, it, expect, vi } from 'vitest';
import { fetchBibleStructure } from './bibleStructure';
import {
  ClientInputError,
  errorDetailsOf,
} from './errors';
import { mockStructure } from '../mocks/handlers';

describe('fetchBibleStructure', () => {
  it('returns the parsed structure for a valid id',
    async () => {
      // MSW serves the bundled-shape structure for every
      // /bible/structure/ request.
      const result = await fetchBibleStructure('ENGESV_API');
      expect(result).toEqual(mockStructure);
    },
  );

  it.each(['ESV:text:1', 'ESV:1', 'x'.repeat(41), ''])(
    'rejects the unroutable id %j locally — never ' +
      'reaching the network',
    async (filesetId) => {
      // The backend's FILESET_ID_RE (^[A-Za-z0-9_-]{1,40}$)
      // rejects ':'-bearing/overlong/empty ids with a 400
      // `invalid_parameter` — the client fails fast with
      // the same typed error instead of paying the
      // guaranteed-failure roundtrip.
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const promise = fetchBibleStructure(filesetId);
      await expect(promise).rejects.toBeInstanceOf(
        ClientInputError
      );
      await expect(promise).rejects.toMatchObject({
        errorCode: 'invalid_parameter',
        status: 400,
      });
      await promise.catch((err: unknown) => {
        expect(errorDetailsOf(err).endpoint).toBe(
          '/api/v1/bible/structure/'
        );
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
