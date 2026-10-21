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
} from '../utils/cacheManager';
import { publicFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { ProviderError } from './errors';

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
    if (!response.ok) {
      throw new ProviderError(
        `Failed to fetch translations (HTTP ${response.status})`
      );
    }
    const data = await response.json();

    // Only cache real arrays — an error body must not poison the
    // no-TTL translation cache (it also feeds findOwnerIso).
    if (!Array.isArray(data.results)) {
      throw new ProviderError(
        'Malformed translations response'
      );
    }
    const translations: Translation[] =
      injectBundledKjv(data.results);

    cacheTranslations(languageIso, translations);
    console.log(`💾 Translations for ${languageIso} cached`);

    return translations;
  } catch (error) {
    console.error("Failed to fetch available translations:", error);
    // Provider failures must surface — returning [] would be a
    // silent empty list and would get cached.
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
