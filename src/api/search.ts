/**
 * Verse search endpoint (grouped-by-book variant; supports
 * AbortSignal for debounced query cancellation).
 */
import type {
  GroupedSearchResponse,
  SearchResponse,
  SearchVerse,
} from '../types';
import { API_BASE_URL } from '../config';
import { publicFetch } from '../utils/apiClient';
import {
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isRateLimitMessage,
  throwFromErrorBody,
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

export const searchBible = async (
  query: string,
  filesetId: string,
  page = 1,
  limit = 50,
  signal?: AbortSignal,
): Promise<SearchResponse> => {
  const params = new URLSearchParams({
    query,
    fileset_id: filesetId,
    page: String(page),
    limit: String(limit),
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
      verses?: SearchVerse[];
      meta?: SearchResponse['meta'];
    };
  };
  return {
    verses: data.data?.verses ?? [],
    meta: data.data?.meta ?? {},
  };
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
  if (!response.ok) {
    await throwFromErrorBody(response, {
      bookNotInFileset:
        'Search is not available for this fileset',
      failure: `Search failed (HTTP ${response.status})`,
    });
  }
  const json = await response.json();
  // Provider failures may arrive wrapped in a 200 body —
  // surface the error/error_code/message contract instead of
  // reporting an empty result set.
  if (json.error || json.error_code) {
    const message =
      errorMessageFromBody(json, 'Search failed');
    throw json.error_code === 'rate_limited' ||
      isRateLimitMessage(message)
      ? new RateLimitError(message)
      : new ProviderError(message);
  }
  const groups = json.data?.groups;
  if (
    typeof json.message === 'string' &&
    (!Array.isArray(groups) || groups.length === 0)
  ) {
    throw isRateLimitMessage(json.message)
      ? new RateLimitError(json.message)
      : new ProviderError(json.message);
  }
  return {
    groups: groups ?? [],
    meta: json.data?.meta ?? { total: 0, truncated: false },
  };
};
