/**
 * Verse search endpoint (grouped-by-book variant; supports
 * AbortSignal for debounced query cancellation).
 */
import type {
  GroupedSearchResponse,
  SearchVerseGroup,
} from '../types';
import { publicFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import {
  ProviderError,
  RateLimitError,
  isRateLimitMessage,
} from './errors';

/**
 * Maps a search response body to a typed error, mirroring the
 * verse/audio paths: a 200-wrapped `{error, error_code}` or a
 * non-OK response must not collapse into silent empty results.
 * Returns null when the body carries no error.
 */
const searchBodyError = (
  body: unknown,
  response: Response
): Error | null => {
  const data = (
    body && typeof body === 'object' ? body : {}
  ) as {
    error?: unknown;
    error_code?: unknown;
    message?: unknown;
    detail?: unknown;
  };
  const rawMsg =
    typeof data.error === 'string' && data.error
      ? data.error
      : typeof data.detail === 'string' && data.detail
        ? data.detail
        : typeof data.message === 'string' && data.message
          ? data.message
          : '';
  const errorCode = data.error_code;

  if (!response.ok) {
    const message =
      rawMsg || `Search failed: ${response.statusText}`;
    if (
      response.status === 429 ||
      errorCode === 'rate_limited' ||
      isRateLimitMessage(message)
    ) {
      return new RateLimitError(message);
    }
    if (errorCode) {
      return new ProviderError(message);
    }
    return new Error(message);
  }

  if (typeof data.error === 'string' && data.error) {
    return errorCode === 'rate_limited' ||
      isRateLimitMessage(data.error)
      ? new RateLimitError(data.error)
      : new ProviderError(data.error);
  }
  return null;
};

export const searchBibleGrouped = async (
  query: string,
  filesetId: string,
  signal?: AbortSignal,
): Promise<GroupedSearchResponse> => {
  const params = new URLSearchParams({
    query,
    fileset_id: filesetId,
    group_by: 'book',
  });
  const url =
    `${API_BASE_URL}/api/v1/bible/search/?` +
    params.toString();
  const response = await publicFetch(url, { signal });
  const json = await response.json().catch(() => null);
  const error = searchBodyError(json, response);
  if (error) throw error;
  const data = (json ?? {}) as {
    data?: {
      groups?: SearchVerseGroup[];
      meta?: GroupedSearchResponse['meta'];
    };
  };
  return {
    groups: data.data?.groups ?? [],
    meta: data.data?.meta ?? { total: 0, truncated: false },
  };
};
