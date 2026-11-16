/**
 * `GET /api/v1/bible/structure/?fileset_id=` — the provider-
 * aware book/chapter structure of a fileset with book names
 * localized to its language. Powers the PassagePicker coverage
 * view and the localized display-name layer.
 *
 * This module only performs the network call + typed error
 * mapping; resolution order (localStorage -> bundled catalog
 * -> previous -> fetch) is orchestrated by the
 * `structureByBible` store slice.
 */
import type { BibleStructure } from '../types';
import { publicFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import {
  ClientInputError,
  ProviderError,
  RateLimitError,
  throwFromErrorBody,
} from './errors';

export const fetchBibleStructure = async (
  filesetId: string,
): Promise<BibleStructure> => {
  const url =
    `${API_BASE_URL}/api/v1/bible/structure/` +
    `?fileset_id=${encodeURIComponent(filesetId)}`;
  const response = await publicFetch(url);
  if (!response.ok) {
    await throwFromErrorBody(response, {
      bookNotInFileset: 'Bible structure not found',
      failure:
        `Failed to fetch bible structure ` +
        `(HTTP ${response.status})`,
    }).catch((err: unknown) => {
      // Keep the typed-error contract intact — same mapping as
      // the translations listing.
      if (
        err instanceof RateLimitError ||
        err instanceof ClientInputError ||
        err instanceof ProviderError
      ) {
        throw err;
      }
      throw new ProviderError(
        err instanceof Error
          ? err.message
          : `Failed to fetch bible structure ` +
            `(HTTP ${response.status})`,
      );
    });
  }
  const data = await response.json();
  if (data.error || !Array.isArray(data.books)) {
    throw new ProviderError('Malformed bible structure response');
  }
  return data as BibleStructure;
};
