/**
 * Verse search endpoint (grouped-by-book variant; supports
 * AbortSignal for debounced query cancellation).
 */
import type { GroupedSearchResponse } from '../types';
import { API_BASE_URL } from '../config';

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
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Search failed: ${response.statusText}`
    );
  }
  const json = await response.json();
  return {
    groups: json.data?.groups ?? [],
    meta: json.data?.meta ?? { total: 0, truncated: false },
  };
};
