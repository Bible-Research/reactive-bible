/**
 * Verse search endpoint (grouped-by-book variant; supports
 * AbortSignal for debounced query cancellation).
 */
import type { GroupedSearchResponse } from '../types';
import { API_BASE_URL } from '../config';
import { publicFetch } from '../utils/apiClient';
import {
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isRateLimitMessage,
  throwFromErrorBody,
} from './errors';

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
    throw new ProviderError(json.message);
  }
  return {
    groups: groups ?? [],
    meta: json.data?.meta ?? { total: 0, truncated: false },
  };
};
