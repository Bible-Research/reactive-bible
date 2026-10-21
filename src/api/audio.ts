/**
 * Chapter audio: provider `audio_url` fetches (cache-first),
 * the bundled-KJV wordpocket.org URL builder, the silent
 * prefetcher, and per-verse timestamp lookups.
 */
import { toBookName } from "../utils/bibleUtils";
import type { VerseTimestamp } from '../types';
import {
  getCachedAudioUrl,
  cacheAudioUrl,
  getCachedTimestamps,
  cacheTimestamps,
} from '../utils/cacheManager';
import { publicFetch } from '../utils/apiClient';
import { reportFums } from '../utils/fums';
import { API_BASE_URL } from '../config';
import { getBooks } from './structure';
import {
  BookNotInFilesetError,
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isBookNotInFilesetBody,
  isRateLimitMessage,
  throwFromErrorBody,
} from './errors';

interface AudioApiResponse {
  error?: string | { message?: string };
  error_code?: unknown;
  audio_url?: unknown;
  duration_seconds?: number;
  file_size_bytes?: number;
  meta?: unknown;
}

/**
 * Get audio URL for any Bible translation from Bible Research API
 * @param bookId - USFM book code (e.g., "GEN", "2CH")
 * @param chapter - Chapter number
 * @param filesetId - Fileset ID selecting the provider
 *   (e.g., "ESVDA", "ENGESVN1DA")
 * @returns Audio URL string
 */
export const getBibleAudioUrl = async (
  bookId: string,
  chapter: number,
  filesetId: string
): Promise<string> => {
  const translation = filesetId;
  const cached = getCachedAudioUrl(bookId, chapter, translation);
  if (cached) {
    console.log('✅ Audio URL loaded from cache');
    return cached;
  }

  try {
    // The backend expects a book name in the passage param.
    const bookName = toBookName(bookId) ?? bookId;
    const passage = `${bookName} ${chapter}`;
    const url =
      `${API_BASE_URL}/api/v1/bible` +
      `?passage=${encodeURIComponent(passage)}` +
      `&fileset_id=${filesetId}&response_format=audio`;
    const response = await publicFetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      await throwFromErrorBody(response, {
        bookNotInFileset:
          `Audio not available for ${translation} ` +
          `${bookId} ${chapter}`,
        failure:
          `Failed to fetch audio for ${translation}: ` +
          `${response.statusText}`,
      });
    }

    const data = (await response.json()) as AudioApiResponse;

    if (isBookNotInFilesetBody(data)) {
      throw new BookNotInFilesetError(
        errorMessageFromBody(
          data,
          `Audio not available for ${translation} ` +
            `${bookId} ${chapter}`
        )
      );
    }

    // Provider failures carry `error`/`error_code` fields.
    if (data.error) {
      const errorMsg =
        errorMessageFromBody(data, 'Unknown error');
      const fullMsg =
        `Audio not available for ${translation} ${bookId} ` +
        `${chapter}: ${errorMsg}`;
      throw data.error_code === 'rate_limited' ||
        isRateLimitMessage(errorMsg)
        ? new RateLimitError(fullMsg)
        : new ProviderError(fullMsg);
    }
    // A missing audio_url means the book is outside the
    // fileset's coverage (backwards compat: older backends
    // answer 200 with empty `verses`/`message` for audio).
    if (!data.audio_url || typeof data.audio_url !== 'string') {
      throw new BookNotInFilesetError(
        `No audio URL in API response for ${translation} ` +
        `${bookId} ${chapter}`
      );
    }

    // API.Bible responses carry a FUMS token in `meta` that must
    // be reported per their license terms (silent on failure).
    reportFums(data.meta);

    // Cache the audio URL
    cacheAudioUrl(
      bookId,
      chapter,
      translation,
      data.audio_url,
      data.duration_seconds || 0,
      data.file_size_bytes || 0
    );
    console.log('💾 Audio URL cached');

    return data.audio_url;
  } catch (error) {
    console.error(`Error fetching ${translation} audio:`, error);
    throw error;
  }
};

/**
 * Get KJV audio URL from wordpocket.org
 * @param bookId - USFM book code
 * @param chapter - Chapter number
 * @returns Audio URL string
 */
export const getKjvAudioUrl = (
  bookId: string,
  chapter: number
): string => {
  const books = getBooks();
  const index = books.findIndex((b) => b.book_id === bookId);

  if (index === -1) {
    throw new Error(`Book not found: ${bookId}`);
  }

  return `https://wordpocket.org/bibles/app/audio/1/${
    index + 1
  }/${chapter}.mp3`;
};

/**
 * Prefetch audio URL for a chapter (background caching)
 * Silently fetches and caches audio URL without blocking UI
 * @param bookId - USFM book code
 * @param chapter - Chapter number
 * @param filesetId - Fileset ID ("ENGKJV", "ESVDA", etc.)
 */
export const prefetchAudioUrl = async (
  bookId: string,
  chapter: number,
  filesetId: string | null
): Promise<void> => {
  if (!filesetId) return; // Cannot prefetch without a filesetId
  try {
    // Check if already cached
    const cached = getCachedAudioUrl(bookId, chapter, filesetId);
    if (cached) {
      console.log(
        `🎵 Audio URL already cached for ${bookId} ${chapter}`
      );
      return;
    }

    // KJV URLs are instant (no API call needed)
    if (filesetId === 'ENGKJV') {
      const url = getKjvAudioUrl(bookId, chapter);
      // Cache it for consistency
      cacheAudioUrl(bookId, chapter, 'ENGKJV', url, 0, 0);
      console.log(
        `🎵 Prefetched KJV audio for ${bookId} ${chapter}`
      );
      return;
    }

    // For other versions, fetch from API
    await getBibleAudioUrl(bookId, chapter, filesetId);
    console.log(
      `🎵 Prefetched ${filesetId} audio for ${bookId} ${chapter}`
    );
  } catch (error) {
    // Silent fail - prefetch errors shouldn't block the UI
    console.warn(
      `Failed to prefetch audio for ${bookId} ${chapter}:`,
      error
    );
  }
};

export const getAudioTimestamps = async (
  bookId: string,
  chapter: number,
  filesetId: string
): Promise<VerseTimestamp[]> => {
  const cached = getCachedTimestamps(filesetId, bookId, chapter);
  if (cached) {
    return cached;
  }

  try {
    // The backend expects a book name in the book param.
    const bookName = toBookName(bookId) ?? bookId;
    const url =
      `${API_BASE_URL}/api/v1/bible/timestamps/` +
      `?fileset_id=${encodeURIComponent(filesetId)}` +
      `&book=${encodeURIComponent(bookName)}` +
      `&chapter=${chapter}`;
    const response = await publicFetch(url);
    if (!response.ok) {
      throw new Error(
        `Timestamps fetch failed: ${response.statusText}`
      );
    }
    const data = await response.json();
    const timestamps: VerseTimestamp[] = (data.data || []).map(
      (item: {
        verse_start: string | number;
        timestamp: string | number;
      }) => ({
        verse_start: Number(item.verse_start),
        timestamp: Number(item.timestamp),
      })
    );
    cacheTimestamps(filesetId, bookId, chapter, timestamps);
    return timestamps;
  } catch (error) {
    console.warn('Failed to fetch audio timestamps:', error);
    return []; // Graceful degradation: no highlighting
  }
};
