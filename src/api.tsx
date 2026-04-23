import bibleJson from "./assets/kjv.json";
import { Translation } from "./store";
import { VerseTimestamp } from './types';

import {
  getCachedVerses,
  cacheVerses,
  getCachedAudioUrl,
  cacheAudioUrl,
  getCachedTranslations,
  cacheTranslations,
  getCachedTimestamps,
  cacheTimestamps,
} from './utils/cacheManager';
import { authenticatedFetch, publicFetch } from './utils/apiClient';
import { API_BASE_URL } from './config';

export const data = bibleJson as KjvBook[];

export interface KjvBook {
  chapter: number;
  verse: number;
  text: string;
  translation_id: string;
  book_id: string;
  book_name: string;
}

export const getBooks = (): { book_name: string; book_id: string }[] => {
  const set = new Set<string>();
  data.map((book: KjvBook) => {
    const obj = {
      book_name: book.book_name,
      book_id: book.book_id,
    };
    set.add(JSON.stringify(obj, Object.keys(obj).sort()));
  });
  return [...set].map((item) => {
    if (typeof item === "string") return JSON.parse(item);
    else if (typeof item === "object") return item;
  }) as {
    book_name: string;
    book_id: string;
  }[];
};

export const getChapters = (thebook: string): number[] => {
  return [
    ...new Set<number>(
      data
        .filter((book: KjvBook) => book.book_name === thebook)
        .map((book: KjvBook) => book.chapter)
    ),
  ];
};

export const getVerses = (thebook: string, thechapter: number): number[] => {
  return data
    .filter(
      (book: KjvBook) => book.book_name === thebook && book.chapter === thechapter
    )
    .map((book: KjvBook) => book.verse);
};

export const getVersesInChapter = async (
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]> => {
  if (filesetId === 'ENGKJV') {
    return getVersesInKjvChapter(thebook, thechapter);
  }
  return await getVersesFromApi(thebook, thechapter, filesetId);
};

export const getVersesInKjvChapter = (
  thebook: string,
  thechapter: number
): { verse: number; text: string }[] => {
  return data
    .filter(
      (book: KjvBook) => book.book_name === thebook && book.chapter === thechapter
    )
    .map((book: KjvBook) => ({ verse: book.verse, text: book.text }));
};

export const getVersesFromApi = async (
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]> => {
  const cached = getCachedVerses(thebook, thechapter, filesetId);
  if (cached) {
    return cached;
  }
  try {
    const passage = `${thebook} ${thechapter}`;
    const url = `https://bible-research-489314.ey.r.appspot.com/api/v1/bible?passage=${encodeURIComponent(passage)}&fileset_id=${filesetId}`;
    const response = await fetch(url);
    const data = await response.json();
    const verses = data.verses.map((v: { verse: number; text: string }) => ({ verse: v.verse, text: v.text }));
    cacheVerses(thebook, thechapter, filesetId, verses);
    return verses;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getPassage = (): { book_name: string; book_id: string; chapter: number }[] => {
  const set = new Set<string>();
  data.map((book: KjvBook) => {
    const obj = {
      book_name: book.book_name,
      book_id: book.book_id,
      chapter: book.chapter,
    };
    set.add(JSON.stringify(obj, Object.keys(obj).sort()));
  });
  return [...set].map((item) => {
    if (typeof item === "string") return JSON.parse(item);
    else if (typeof item === "object") return item;
  }) as { book_name: string; book_id: string; chapter: number }[];
};

export const addTagNote = async (
  tagId: string,
  tagNoteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[]
) => {
  const body = JSON.stringify({ 
    tag: tagId, 
    note_text: tagNoteText, 
    verse_references: verseReferences 
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/`,
      {
        method: 'POST',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
};

export const editNote = async (
  noteId: string, 
  tagId: string, 
  noteText: string
) => {
  const body = JSON.stringify({ tag: tagId, note_text: noteText });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`,
      {
        method: 'PATCH',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating note:', error);
    throw error;
  }
};

export const deleteNote = async (noteId: string) => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to delete note');
    }
    // 204 No Content response
    return response.status === 204 ? '' : await response.text();
  } catch(err: any | Error) {
    console.error('Error deleting note:', err);
    throw new Error('Failed to delete your note, please try again');
  }
}

export const getTags = async (): Promise<Tag[]> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch tags');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
};

export const getTag = async (tagId: string): Promise<Tag> => {
  try {
    const response = await publicFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching tag:', error);
    throw error;
  }
};

export const createTag = async (
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const body = JSON.stringify({
    name,
    parent_tag: parentTagId || null,
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/`,
      {
        method: 'POST',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to create tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error;
  }
};

export const updateTag = async (
  tagId: string,
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const body = JSON.stringify({
    name,
    parent_tag: parentTagId || null,
  });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`,
      {
        method: 'PATCH',
        body: body,
      }
    );
    if (!response.ok) {
      throw new Error('Failed to update tag');
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating tag:', error);
    throw error;
  }
};

export const deleteTag = async (tagId: string): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/v1/tags/${tagId}/`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      throw new Error('Failed to delete tag');
    }
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }
};

// ============================================
// TRANSLATION FUNCTIONS
// ============================================

export const getAvailableTranslations = async (
  languageIso = "eng"
): Promise<Translation[]> => {
  const cached = getCachedTranslations(languageIso);
  if (cached) {
    console.log(`✅ Translations for ${languageIso} loaded from cache`);
    return cached;
  }

  try {
    const url = `https://bible-research-489314.ey.r.appspot.com/api/v1/bible/translations/?language_iso=${languageIso}`;
    const response = await fetch(url);
    const data = await response.json();

    // The actual translations are in the 'results' property
    const translations: Translation[] = data.results;

    cacheTranslations(languageIso, translations);
    console.log(`💾 Translations for ${languageIso} cached`);

    return translations;
  } catch (error) {
    console.error("Failed to fetch available translations:", error);
    return []; // Return empty array on error
  }
};

// ============================================
// AUDIO FUNCTIONS
// ============================================

export interface AudioResponse {
  book: string;
  book_name: string;
  chapter: number;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
  format: string;
}

/**
 * Get audio URL for any Bible translation from Bible Research API
 * @param book - Book name (e.g., "Genesis", "2 Chronicles")
 * @param chapter - Chapter number
 * @param translation - Translation code (e.g., "ESV", "NIV", "NASB")
 * @returns Audio URL string
 */
export const getBibleAudioUrl = async (
  book: string,
  chapter: number,
  filesetId: string
): Promise<string> => {
  const translation = filesetId;
  const cached = getCachedAudioUrl(book, chapter, translation);
  if (cached) {
    console.log('✅ Audio URL loaded from cache');
    return cached;
  }

  try {
    const passage = `${book} ${chapter}`;
    const url = `https://bible-research-489314.ey.r.appspot.com/api/v1/bible?passage=${encodeURIComponent(passage)}&fileset_id=${filesetId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio for ${translation}: ${response.statusText}`
      );
    }

    const data: any = await response.json();

    // Check if API returned an error
    if (data.error) {
      const errorMsg = typeof data.error === 'string' 
        ? data.error 
        : data.error.message || 'Unknown error';
      throw new Error(
        `Audio not available for ${translation} ${book} ${chapter}: ${errorMsg}`
      );
    }
    // Validate audio_url exists and is a string
    if (!data.audio_url || typeof data.audio_url !== 'string') {
      throw new Error(
        `No audio URL in API response for ${translation} ${book} ${chapter}`
      );
    }
    
    // Cache the audio URL
    cacheAudioUrl(
      book,
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
 * @param book - Book name
 * @param chapter - Chapter number
 * @returns Audio URL string
 */
export const getKjvAudioUrl = (book: string, chapter: number): string => {
  const books = getBooks();
  const index = books.findIndex((b) => b.book_name === book);

  if (index === -1) {
    throw new Error(`Book not found: ${book}`);
  }

  return `https://wordpocket.org/bibles/app/audio/1/${
    index + 1
  }/${chapter}.mp3`;
};

/**
 * Get adjacent chapter info (previous/next)
 * @param book - Current book name
 * @param chapter - Current chapter number
 * @returns Object with previous and next chapter info
 */
export const getAdjacentChapters = (
  book: string,
  chapter: number
): {
  previous: { book: string; chapter: number } | null;
  next: { book: string; chapter: number } | null;
} => {
  const passages = getPassage();
  const currentIndex = passages.findIndex(
    (p) => p.book_name === book && p.chapter === chapter
  );

  if (currentIndex === -1) {
    return { previous: null, next: null };
  }

  const previous =
    currentIndex > 0
      ? {
          book: passages[currentIndex - 1].book_name,
          chapter: passages[currentIndex - 1].chapter,
        }
      : null;

  const next =
    currentIndex < passages.length - 1
      ? {
          book: passages[currentIndex + 1].book_name,
          chapter: passages[currentIndex + 1].chapter,
        }
      : null;

  return { previous, next };
};

/**
 * Prefetch audio URL for a chapter (background caching)
 * Silently fetches and caches audio URL without blocking UI
 * @param book - Book name
 * @param chapter - Chapter number
 * @param bibleVersion - Bible version ("KJV", "ESV", etc.)
 */
export const prefetchAudioUrl = async (
  book: string,
  chapter: number,
  filesetId: string | null
): Promise<void> => {
  if (!filesetId) return; // Cannot prefetch without a filesetId
  try {
    // Check if already cached
    const cached = getCachedAudioUrl(book, chapter, filesetId);
    if (cached) {
      console.log(
        `🎵 Audio URL already cached for ${book} ${chapter}`
      );
      return;
    }

    // KJV URLs are instant (no API call needed)
    if (filesetId === 'ENGKJV') {
      const url = getKjvAudioUrl(book, chapter);
      // Cache it for consistency
      cacheAudioUrl(book, chapter, 'ENGKJV', url, 0, 0);
      console.log(`🎵 Prefetched KJV audio for ${book} ${chapter}`);
      return;
    }

    // For other versions, fetch from API
    await getBibleAudioUrl(book, chapter, filesetId);
    console.log(
      `🎵 Prefetched ${filesetId} audio for ${book} ${chapter}`
    );
  } catch (error) {
    // Silent fail - prefetch errors shouldn't block the UI
    console.warn(
      `Failed to prefetch audio for ${book} ${chapter}:`,
      error
    );
  }
};



/**
 * Prefetch verses and audio for adjacent chapters
 * (previous and next)
 * @param book - Current book name
 * @param chapter - Current chapter number
 * @param filesetId - The fileset ID for the translation to prefetch
 */
export const prefetchAdjacentChapters = async (
  book: string,
  chapter: number,
  filesetId: string
): Promise<void> => {
  const { previous, next } = getAdjacentChapters(book, chapter);

  const prefetch = async (
    b: string,
    c: number,
    id: string,
    label: string
  ) => {
    try {
      // We don't need the result, just to trigger the fetch and cache
      await getVersesInChapter(b, c, id);
      console.log(`📚 Prefetched ${label} chapter: ${b} ${c}`);
    } catch (error) {
      // Silent fail
      console.warn(`Failed to prefetch ${label} chapter ${b} ${c}:`, error);
    }
  };

  if (previous) {
    prefetch(previous.book, previous.chapter, filesetId, 'previous');
  }
  if (next) {
    prefetch(next.book, next.chapter, filesetId, 'next');
  }
};

// ============================================
// AUDIO TIMESTAMP FUNCTIONS
// ============================================

export const getAudioTimestamps = async (
  book: string,
  chapter: number,
  filesetId: string
): Promise<VerseTimestamp[]> => {
  const cached = getCachedTimestamps(filesetId, book, chapter);
  if (cached) {
    return cached;
  }

  try {
    const url =
      `${API_BASE_URL}/api/v1/bible/timestamps/` +
      `?fileset_id=${encodeURIComponent(filesetId)}` +
      `&book=${encodeURIComponent(book)}` +
      `&chapter=${chapter}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Timestamps fetch failed: ${response.statusText}`
      );
    }
    const data = await response.json();
    const timestamps: VerseTimestamp[] = (data.data || []).map(
      (item: { verse_start: string | number; timestamp: number }) => ({
        verse_start: Number(item.verse_start),
        timestamp: item.timestamp,
      })
    );
    cacheTimestamps(filesetId, book, chapter, timestamps);
    return timestamps;
  } catch (error) {
    console.warn('Failed to fetch audio timestamps:', error);
    return []; // Graceful degradation: no highlighting
  }
};

export interface NoteVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Tag {
  id: string;
  name: string;
  parent_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: NoteVerse[];
}

export const getNotes = async (tagId?: string): Promise<Note[]> => {
  const url = tagId
    ? `${API_BASE_URL}/api/v1/notes/?tag_id=${tagId}`
    : `${API_BASE_URL}/api/v1/notes/`;
  try {
    const response = await publicFetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }
};

export const getNote = async (noteId: string): Promise<Note> => {
  try {
    const response = await publicFetch(
      `${API_BASE_URL}/api/v1/notes/${noteId}/`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch note');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching note:', error);
    throw error;
  }
};