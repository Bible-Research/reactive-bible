/**
 * Translation listing (cache-first, with the bundled-KJV
 * pseudo-fileset injected) and per-translation copyright info.
 */
import type { Translation, FilesetCopyright } from '../types';
import {
  getCachedTranslations,
  cacheTranslations,
  getCachedCopyright,
  cacheCopyright,
  getCachedLanguageSearch,
  cacheLanguageSearch,
  type CachedLanguage,
} from '../utils/cacheManager';
import { publicFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import {
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isRateLimitMessage,
  throwFromErrorBody,
} from './errors';

/**
 * Keeps the locally bundled KJV reachable: the API lists an
 * ENGKJV translation but only exposes the DBT-backed
 * `ENGKJV?_ET` split filesets, so we inject the `ENGKJV`
 * pseudo-fileset (text served from assets/kjv.json, audio from
 * wordpocket.org — both keyed on `filesetId === 'ENGKJV'`).
 */
const injectBundledKjv = (
  translations: Translation[]
): Translation[] =>
  translations.map((t) => {
    const filesets = [...(t.filesets ?? [])];
    const isKjv =
      t.abbr === 'ENGKJV' ||
      filesets.some((f) => f.id.startsWith('ENGKJV'));
    if (!isKjv) return t;
    const has = (type: string) =>
      filesets.some(
        (f) => f.id === 'ENGKJV' && f.type === type
      );
    const missingText = !has('text_plain');
    const missingAudio = !has('audio');
    if (!missingText && !missingAudio) return t;
    if (missingText) {
      filesets.push({
        id: 'ENGKJV',
        type: 'text_plain',
        size: 'C',
        codec: null,
        bitrate: null,
      });
    }
    if (missingAudio) {
      filesets.push({
        id: 'ENGKJV',
        type: 'audio',
        size: 'C',
        codec: null,
        bitrate: null,
      });
    }
    return { ...t, filesets };
  });

export const getAvailableTranslations = async (
  languageIso = "eng",
  forceRefresh = false
): Promise<Translation[]> => {
  if (!forceRefresh) {
    const cached = getCachedTranslations(languageIso);
    if (cached) {
      console.log(`✅ Translations for ${languageIso} loaded from cache`);
      return injectBundledKjv(cached);
    }
  }

  try {
    const url =
      `${API_BASE_URL}/api/v1/` +
      `bible/translations/?language_iso=${languageIso}`;
    const response = await publicFetch(url);
    // A failed response must never reach cacheTranslations —
    // an error body parsed as "no results" would poison the
    // cache and stick until a force refresh.
    if (!response.ok) {
      await throwFromErrorBody(response, {
        bookNotInFileset: 'Translations not available',
        failure:
          `Failed to fetch translations ` +
          `(HTTP ${response.status})`,
      }).catch((err: unknown) => {
        // Every non-OK from this endpoint is a provider
        // failure — a codeless body must still surface as
        // the typed ProviderError, not a plain Error.
        if (
          err instanceof RateLimitError ||
          err instanceof ProviderError
        ) {
          throw err;
        }
        throw new ProviderError(
          err instanceof Error
            ? err.message
            : `Failed to fetch translations ` +
              `(HTTP ${response.status})`
        );
      });
    }
    const data = await response.json();
    // Provider failures may arrive wrapped in a 200 body —
    // surface the error/error_code contract instead of
    // caching an empty translation list.
    if (data.error || data.error_code) {
      const message = errorMessageFromBody(
        data, 'Failed to fetch translations'
      );
      throw data.error_code === 'rate_limited' ||
        isRateLimitMessage(message)
        ? new RateLimitError(message)
        : new ProviderError(message);
    }

    // Only cache real arrays — a malformed non-array body must
    // not poison the no-TTL translation cache (it also feeds
    // findOwnerIso).
    if (!Array.isArray(data.results)) {
      throw new ProviderError('Malformed translations response');
    }
    // The actual translations are in the 'results' property
    const translations: Translation[] =
      injectBundledKjv(data.results);

    cacheTranslations(languageIso, translations);
    console.log(`💾 Translations for ${languageIso} cached`);

    return translations;
  } catch (error) {
    console.error("Failed to fetch available translations:", error);
    // Surface the failure — callers catch at the UI layer; a
    // silent `[]` is indistinguishable from "no translations".
    throw error;
  }
};

/**
 * Fetch copyright info for a Bible translation.
 * @param bibleId - The Bible abbreviation (e.g. "ENGESV")
 * @returns Array of fileset copyright objects
 */
export const getCopyrightInfo = async (
  bibleId: string
): Promise<FilesetCopyright[]> => {
  const cached = getCachedCopyright(bibleId);
  if (cached) {
    return cached;
  }

  try {
    const url =
      `${API_BASE_URL}/api/v1/bible/copyright/` +
      `?bible_id=${encodeURIComponent(bibleId)}`;
    const response = await publicFetch(url);
    if (!response.ok) {
      throw new Error(
        `Copyright fetch failed: ${response.statusText}`
      );
    }
    const data = await response.json();
    const copyrights: FilesetCopyright[] =
      data.data || [];
    cacheCopyright(bibleId, copyrights);
    return copyrights;
  } catch (error) {
    console.warn(
      'Failed to fetch copyright info:', error
    );
    return [];
  }
};

/** One content-bearing language row from `/bible/languages/`. */
export type LanguageResult = CachedLanguage;

/**
 * Searches the DBT language catalog via the backend proxy:
 * `GET /api/v1/bible/languages/?search=<q>&page=<n>` returns
 * `{results: [{iso, name, autonym, bibles, filesets}], meta}`.
 * Results are cached per `search:page` in localStorage — the
 * catalog is nearly static and the language picker re-queries
 * on every debounced keystroke.
 */
export const searchLanguages = async (
  search: string,
  page = 1
): Promise<LanguageResult[]> => {
  const cacheKey = `${search.toLowerCase()}:${page}`;
  const cached = getCachedLanguageSearch(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const params = new URLSearchParams({
      search,
      page: String(page),
    });
    const url =
      `${API_BASE_URL}/api/v1/` +
      `bible/languages/?${params.toString()}`;
    const response = await publicFetch(url);
    const data = await response.json();
    const results: LanguageResult[] = data.results ?? [];
    cacheLanguageSearch(cacheKey, results);
    return results;
  } catch (error) {
    console.error('Failed to search languages:', error);
    return [];
  }
};
