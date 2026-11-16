/**
 * Verse search endpoint (grouped-by-book variant; supports
 * AbortSignal for debounced query cancellation).
 *
 * SWORD scans that exceed the backend's per-request time
 * budget return `meta.next_cursor`; this client follows the
 * cursor chain transparently, merging per-window groups into
 * a single canonical response.
 */
import type {
  GroupedSearchResponse,
  SearchScanProgress,
  SearchVerseGroup,
} from '../types';
import { API_BASE_URL } from '../config';
import { publicFetch } from '../utils/apiClient';
import {
  ProviderError,
  RateLimitError,
  SearchDisabledError,
  errorMessageFromBody,
  isRateLimitMessage,
  throwFromErrorBody,
} from './errors';

/** Throw the typed error matching a failure response body. */
const throwSearchError = (json: {
  error?: unknown;
  error_code?: unknown;
  detail?: unknown;
  message?: unknown;
}): never => {
  const message = errorMessageFromBody(
    json,
    'Search failed'
  );
  if (json.error_code === 'search_disabled') {
    throw new SearchDisabledError(message);
  }
  throw json.error_code === 'rate_limited' ||
    isRateLimitMessage(message)
    ? new RateLimitError(message)
    : new ProviderError(message);
};

/**
 * Append one window's groups into the accumulated map keyed
 * by `book_id`. A book split across windows gets its verses
 * concatenated and re-sorted by (chapter, verse_start);
 * groups keep first-seen order, which is canonical since the
 * backend scans books in canonical order.
 */
const mergeWindowGroups = (
  merged: Map<string, SearchVerseGroup>,
  groups: SearchVerseGroup[]
): void => {
  for (const group of groups) {
    const existing = merged.get(group.book_id);
    if (!existing) {
      merged.set(group.book_id, {
        ...group,
        verses: [...group.verses],
      });
      continue;
    }
    existing.verses.push(...group.verses);
    existing.verses.sort(
      (a, b) =>
        a.chapter - b.chapter ||
        a.verse_start - b.verse_start
    );
    existing.count = existing.verses.length;
  }
};

interface SearchWindowMeta {
  total?: number;
  truncated?: boolean;
  next_cursor?: string;
  progress?: SearchScanProgress;
}

interface SearchWindowData {
  groups?: SearchVerseGroup[];
  meta?: SearchWindowMeta;
}

/** Sum of verse counts across merged groups. */
const mergedTotal = (
  merged: Map<string, SearchVerseGroup>
): number => {
  let count = 0;
  for (const group of merged.values()) {
    count += group.verses.length;
  }
  return count;
};

export const searchBibleGrouped = async (
  query: string,
  filesetId: string,
  signal?: AbortSignal,
  onProgress?: (progress: SearchScanProgress) => void
): Promise<GroupedSearchResponse> => {
  const merged = new Map<string, SearchVerseGroup>();
  let total = 0;
  let truncated = false;
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      query,
      fileset_id: filesetId,
      group_by: 'book',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }
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
    // surface the error/error_code/message contract instead
    // of reporting an empty result set.
    if (json.error || json.error_code) {
      throwSearchError(json);
    }
    const data = (json.data ?? {}) as SearchWindowData;
    const groups = data.groups;
    if (
      typeof json.message === 'string' &&
      (!Array.isArray(groups) || groups.length === 0)
    ) {
      throw isRateLimitMessage(json.message)
        ? new RateLimitError(json.message)
        : new ProviderError(json.message);
    }
    mergeWindowGroups(merged, groups ?? []);
    const meta = data.meta ?? {};
    // `meta.total` is the backend's running total; fall back
    // to our own verse count for non-cursor providers.
    total =
      typeof meta.total === 'number'
        ? meta.total
        : mergedTotal(merged);
    truncated = Boolean(meta.truncated);
    cursor =
      typeof meta.next_cursor === 'string'
        ? meta.next_cursor
        : undefined;
    if (meta.progress) {
      onProgress?.(meta.progress);
    }
  } while (cursor);

  return {
    groups: [...merged.values()],
    meta: { total, truncated },
  };
};
