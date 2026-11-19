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
  trackError,
} from './errors';

/**
 * Throw the typed error matching a failure response body,
 * carrying the parsed `error_code` plus status/endpoint so
 * `sentryBeforeSend` maps and groups 200-wrapped errors like
 * the `!response.ok` path. `details` carries the request
 * status/url — `endpointPath` strips the query, which holds
 * the raw search text.
 */
const throwSearchError = (
  json: {
    error?: unknown;
    error_code?: unknown;
    detail?: unknown;
    message?: unknown;
  },
  details: { status: number; url: string }
): never => {
  const message = errorMessageFromBody(
    json,
    'Search failed'
  );
  const code =
    typeof json.error_code === 'string'
      ? json.error_code
      : undefined;
  const attach = <T extends Error>(err: T): T =>
    trackError(err, {
      code,
      status: details.status,
      url: details.url,
    });
  if (json.error_code === 'search_disabled') {
    throw attach(new SearchDisabledError(message));
  }
  throw attach(
    json.error_code === 'rate_limited' ||
      isRateLimitMessage(message)
      ? new RateLimitError(message)
      : new ProviderError(message)
  );
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

/**
 * One `data` payload of `GET /api/v1/bible/search/` as it
 * arrives on the wire — a single scan window. The loop
 * below follows `meta.next_cursor` and merges the windows
 * into the public `GroupedSearchResponse`, whose `meta`
 * therefore exposes only the accumulated
 * `total`/`truncated`.
 */
interface GroupedSearchWindow {
  groups?: SearchVerseGroup[];
  meta?: {
    /** This window's match count — accumulated by the loop. */
    total?: number;
    truncated?: boolean;
    /**
     * Opaque resume token marking a deadline-stopped
     * (incomplete) scan — sent back as `cursor` to fetch
     * the next window.
     */
    next_cursor?: string;
    /** Scan coverage of this window. */
    progress?: SearchScanProgress;
  };
}

export const searchBibleGrouped = async (
  query: string,
  filesetId: string,
  signal?: AbortSignal,
  onProgress?: (progress: SearchScanProgress) => void
): Promise<GroupedSearchResponse> => {
  const merged = new Map<string, SearchVerseGroup>();
  const seenCursors = new Set<string>();
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
      throwSearchError(json, {
        status: response.status,
        url,
      });
    }
    const data = (json.data ?? {}) as GroupedSearchWindow;
    const groups = data.groups;
    if (
      typeof json.message === 'string' &&
      (!Array.isArray(groups) || groups.length === 0)
    ) {
      throw trackError(
        isRateLimitMessage(json.message)
          ? new RateLimitError(json.message)
          : new ProviderError(json.message),
        { status: response.status, url }
      );
    }
    mergeWindowGroups(merged, groups ?? []);
    const meta = data.meta ?? {};
    // `meta.total` is this window's match count on resumable
    // providers — accumulate it; fall back to counting this
    // window's verses when a provider omits it.
    total +=
      typeof meta.total === 'number'
        ? meta.total
        : (groups ?? []).reduce(
            (n, g) => n + g.verses.length,
            0
          );
    truncated = Boolean(meta.truncated);
    cursor =
      typeof meta.next_cursor === 'string'
        ? meta.next_cursor
        : undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        // A repeated resume token means the server cannot
        // advance — stop with what we have rather than loop
        // until the rate limiter kicks in.
        cursor = undefined;
        truncated = true;
      } else {
        seenCursors.add(cursor);
      }
    }
    if (meta.progress) {
      onProgress?.(meta.progress);
    }
  } while (cursor);

  return {
    groups: [...merged.values()],
    meta: { total, truncated },
  };
};
