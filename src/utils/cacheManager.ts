import {
  Note,
  VerseTimestamp,
  FilesetCopyright,
  SectionHeading,
} from '../types';
import { Translation } from '../store';

// Cache Manager for Bible Verses and Audio URLs
// Verse cache: LRU with 500-verse limit (copyright compliance)
// Audio cache: Unlimited with expiration handling
// Translation cache: Simple key-value store by language
//
// Performance: Uses in-memory Map cache for localStorage reads
// (Vercel best practice: js-cache-storage)

const VERSE_CACHE_KEY = 'bible_verse_cache';
const VERSE_CACHE_METADATA_KEY = 'bible_verse_cache_metadata';
const AUDIO_CACHE_KEY = 'bible_audio_cache';
const NOTES_CACHE_KEY = 'bible_notes_cache';
const TRANSLATION_CACHE_KEY = 'bible_translation_cache';
const MAX_VERSES = 500;
const CACHE_VERSION = 2;

// ============================================
// IN-MEMORY CACHE FOR LOCALSTORAGE READS
// ============================================
// Vercel best practice: Cache localStorage reads in memory
// to avoid expensive synchronous I/O operations

const storageCache = new Map<string, string | null>();

// Invalidate cache on external changes (other tabs)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key) {
      storageCache.delete(e.key);
    }
  });

  // Clear cache when tab becomes visible (in case storage changed)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      storageCache.clear();
    }
  });
}

/**
 * Get item from localStorage with in-memory caching
 * @param key - localStorage key
 * @returns cached value or null
 */
function getCachedLocalStorage(key: string): string | null {
  if (!storageCache.has(key)) {
    try {
      storageCache.set(key, localStorage.getItem(key));
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  }
  return storageCache.get(key) ?? null;
}

/**
 * Set item in localStorage and update cache
 * @param key - localStorage key
 * @param value - value to store
 */
function setCachedLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    storageCache.set(key, value); // Keep cache in sync
  } catch (error) {
    console.error('Error writing to localStorage:', error);
  }
}

/**
 * Remove item from localStorage and cache
 * @param key - localStorage key
 */
function removeCachedLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
    storageCache.delete(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
}

interface VerseData {
  verse: number;
  text: string;
  timestamp: number;
  accessCount: number;
}

interface VerseCache {
  [key: string]: VerseData;
}

interface VerseCacheMetadata {
  version: number;
  totalVerses: number;
  lruQueue: string[]; // Chapter keys in LRU order (oldest first)
}

interface AudioData {
  audioUrl: string;
  expiresAt: number;
  duration: number;
  fileSize: number;
}

interface AudioCache {
  [key: string]: AudioData;
}

interface TranslationCache {
  [languageIso: string]: Translation[];
}

interface NotesData {
  notes: Note[];
  timestamp: number;
}

interface NotesCache {
  [tagId: string]: NotesData;
}

// ============================================
// VERSE CACHE (500 verse limit with LRU)
// ============================================

export const getVerseCache = (): VerseCache => {
  try {
    const cache = getCachedLocalStorage(VERSE_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading verse cache:', error);
    return {};
  }
};

export const getVerseCacheMetadata = (): VerseCacheMetadata => {
  try {
    const metadata = getCachedLocalStorage(VERSE_CACHE_METADATA_KEY);
    if (!metadata) {
      return { version: CACHE_VERSION, totalVerses: 0, lruQueue: [] };
    }
    const parsed: VerseCacheMetadata = JSON.parse(metadata);
    if (parsed.version !== CACHE_VERSION) {
      clearVerseCache();
      return { version: CACHE_VERSION, totalVerses: 0, lruQueue: [] };
    }
    return parsed;
  } catch (error) {
    console.error('Error reading verse cache metadata:', error);
    return { version: CACHE_VERSION, totalVerses: 0, lruQueue: [] };
  }
};

export const setVerseCache = (
  cache: VerseCache,
  metadata: VerseCacheMetadata
) => {
  try {
    setCachedLocalStorage(VERSE_CACHE_KEY, JSON.stringify(cache));
    setCachedLocalStorage(
      VERSE_CACHE_METADATA_KEY,
      JSON.stringify(metadata)
    );
  } catch (error) {
    console.error('Error writing verse cache:', error);
  }
};

export const getCachedVerses = (
  book: string,
  chapter: number,
  bibleVersion: string
): { verse: number; text: string }[] | null => {
  const cache = getVerseCache();
  const metadata = getVerseCacheMetadata();
  const chapterKey = `${bibleVersion}:${book}:${chapter}`;

  // Chapter-level LRU: chapter must be present in queue
  const lruIndex = metadata.lruQueue.indexOf(chapterKey);
  if (lruIndex === -1) return null;

  // Move chapter to end of queue (most recently used)
  metadata.lruQueue.splice(lruIndex, 1);
  metadata.lruQueue.push(chapterKey);

  // Collect all verses for this chapter
  const cachedVerses: { verse: number; text: string }[] = [];
  Object.keys(cache).forEach((key) => {
    if (key.startsWith(chapterKey + ':')) {
      const verseData = cache[key];
      cachedVerses.push({
        verse: verseData.verse,
        text: verseData.text,
      });
      verseData.accessCount++;
      verseData.timestamp = Date.now();
    }
  });

  if (cachedVerses.length === 0) return null;

  setVerseCache(cache, metadata);
  return cachedVerses.sort((a, b) => a.verse - b.verse);
};

export const cacheVerses = (
  book: string,
  chapter: number,
  bibleVersion: string,
  verses: { verse: number; text: string }[]
) => {
  const cache = getVerseCache();
  const metadata = getVerseCacheMetadata();
  const now = Date.now();
  const chapterKey = `${bibleVersion}:${book}:${chapter}`;

  // Remove existing entry for this chapter (supports re-caching)
  const lruIndex = metadata.lruQueue.indexOf(chapterKey);
  if (lruIndex > -1) {
    metadata.lruQueue.splice(lruIndex, 1);
    Object.keys(cache).forEach((k) => {
      if (k.startsWith(chapterKey + ':')) {
        metadata.totalVerses--;
        delete cache[k];
      }
    });
  }

  // Store all verses for this chapter
  verses.forEach((verse) => {
    const verseKey = `${chapterKey}:${verse.verse}`;
    cache[verseKey] = {
      verse: verse.verse,
      text: verse.text,
      timestamp: now,
      accessCount: 1,
    };
  });

  // Add chapter to end of LRU queue (most recently used)
  metadata.lruQueue.push(chapterKey);
  metadata.totalVerses += verses.length;

  // Evict oldest chapters until within verse limit
  while (
    metadata.totalVerses > MAX_VERSES &&
    metadata.lruQueue.length > 1
  ) {
    const oldestChapterKey = metadata.lruQueue.shift()!;
    Object.keys(cache).forEach((k) => {
      if (k.startsWith(oldestChapterKey + ':')) {
        metadata.totalVerses--;
        delete cache[k];
      }
    });
  }

  setVerseCache(cache, metadata);
};

export const clearVerseCache = () => {
  removeCachedLocalStorage(VERSE_CACHE_KEY);
  removeCachedLocalStorage(VERSE_CACHE_METADATA_KEY);
};

// ============================================
// NOTES CACHE (by tag ID)
// ============================================

export const getNotesCache = (): NotesCache => {
  try {
    const cache = getCachedLocalStorage(NOTES_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading notes cache:', error);
    return {};
  }
};

export const setNotesCache = (cache: NotesCache) => {
  try {
    setCachedLocalStorage(NOTES_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing notes cache:', error);
  }
};

export const getCachedNotes = (tagId: string): Note[] | null => {
  const cache = getNotesCache();
  const notesData = cache[tagId];

  if (!notesData) return null;

  // Notes don't expire, return cached data
  return notesData.notes;
};

export const cacheNotes = (tagId: string, notes: Note[]) => {
  const cache = getNotesCache();
  cache[tagId] = {
    notes,
    timestamp: Date.now(),
  };
  setNotesCache(cache);
};

export const clearNotesCache = (tagId?: string) => {
  if (tagId) {
    // Clear specific tag's notes
    const cache = getNotesCache();
    delete cache[tagId];
    setNotesCache(cache);
  } else {
    // Clear all notes
    removeCachedLocalStorage(NOTES_CACHE_KEY);
  }
};

// ============================================
// TRANSLATION CACHE
// ============================================

export const getCachedTranslations = (
  languageIso: string
): Translation[] | null => {
  try {
    const cacheStr = getCachedLocalStorage(TRANSLATION_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: TranslationCache = JSON.parse(cacheStr);
    return cache[languageIso] || null;
  } catch (error) {
    console.error('Error reading translation cache:', error);
    return null;
  }
};

export const cacheTranslations = (
  languageIso: string,
  translations: Translation[]
) => {
  try {
    const cacheStr = getCachedLocalStorage(TRANSLATION_CACHE_KEY);
    const cache: TranslationCache = cacheStr ? JSON.parse(cacheStr) : {};
    cache[languageIso] = translations;
    setCachedLocalStorage(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing translation cache:', error);
  }
};

// ============================================
// AUDIO CACHE (Unlimited, with expiration)
// ============================================

export const getAudioCache = (): AudioCache => {
  try {
    const cache = getCachedLocalStorage(AUDIO_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading audio cache:', error);
    return {};
  }
};

export const setAudioCache = (cache: AudioCache) => {
  try {
    setCachedLocalStorage(AUDIO_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing audio cache:', error);
  }
};

export const getCachedAudioUrl = (
  book: string,
  chapter: number,
  bibleVersion: string
): string | null => {
  const cache = getAudioCache();
  const cacheKey = `${bibleVersion}:${book}:${chapter}`;
  const audioData = cache[cacheKey];

  if (!audioData) return null;

  // Check if URL has expired
  if (Date.now() > audioData.expiresAt) {
    delete cache[cacheKey];
    setAudioCache(cache);
    return null;
  }

  return audioData.audioUrl;
};

export const cacheAudioUrl = (
  book: string,
  chapter: number,
  bibleVersion: string,
  audioUrl: string,
  duration = 0,
  fileSize = 0
) => {
  const cache = getAudioCache();
  const cacheKey = `${bibleVersion}:${book}:${chapter}`;

  // Parse expiration from URL (CloudFront URLs have Expires param)
  let expiresAt = Date.now() + 24 * 60 * 60 * 1000; // Default: 24h

  try {
    const url = new URL(audioUrl);
    const expiresParam = url.searchParams.get('Expires');
    if (expiresParam) {
      expiresAt = parseInt(expiresParam) * 1000; // Convert to ms
    }
  } catch (error) {
    console.error('Error parsing audio URL expiration:', error);
  }

  cache[cacheKey] = {
    audioUrl,
    expiresAt,
    duration,
    fileSize,
  };

  setAudioCache(cache);
};

export const clearAudioCache = () => {
  removeCachedLocalStorage(AUDIO_CACHE_KEY);
};

export const clearExpiredAudioUrls = () => {
  const cache = getAudioCache();
  const now = Date.now();
  let hasChanges = false;

  Object.keys(cache).forEach((key) => {
    if (cache[key].expiresAt < now) {
      delete cache[key];
      hasChanges = true;
    }
  });

  if (hasChanges) {
    setAudioCache(cache);
  }
};

// ============================================
// CACHE STATS (for debugging/monitoring)
// ============================================

export const getCacheStats = () => {
  const verseMeta = getVerseCacheMetadata();
  const audioCache = getAudioCache();

  return {
    verses: {
      total: verseMeta.totalVerses,
      limit: MAX_VERSES,
      usage: `${verseMeta.totalVerses}/${MAX_VERSES}`,
      percentage: (verseMeta.totalVerses / MAX_VERSES) * 100,
    },
    audio: {
      total: Object.keys(audioCache).length,
      expired: Object.values(audioCache).filter(
        (a) => a.expiresAt < Date.now()
      ).length,
    },
  };
};

// ============================================
// TIMESTAMP CACHE (No expiration — immutable)
// ============================================

const TIMESTAMP_CACHE_KEY = 'bible_timestamp_cache';

interface TimestampCache {
  [key: string]: VerseTimestamp[];
}

export const getCachedTimestamps = (
  filesetId: string,
  book: string,
  chapter: number
): VerseTimestamp[] | null => {
  try {
    const cacheStr = getCachedLocalStorage(TIMESTAMP_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: TimestampCache = JSON.parse(cacheStr);
    const cacheKey = `${filesetId}:${book}:${chapter}`;
    return cache[cacheKey] || null;
  } catch (error) {
    console.error('Error reading timestamp cache:', error);
    return null;
  }
};

export const cacheTimestamps = (
  filesetId: string,
  book: string,
  chapter: number,
  timestamps: VerseTimestamp[]
) => {
  try {
    const cacheStr = getCachedLocalStorage(TIMESTAMP_CACHE_KEY);
    const cache: TimestampCache = cacheStr ? JSON.parse(cacheStr) : {};
    const cacheKey = `${filesetId}:${book}:${chapter}`;
    cache[cacheKey] = timestamps;
    setCachedLocalStorage(TIMESTAMP_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error writing timestamp cache:', error);
  }
};

export const clearTimestampCache = () => {
  removeCachedLocalStorage(TIMESTAMP_CACHE_KEY);
};

// ============================================
// COPYRIGHT CACHE (24h TTL)
// ============================================

const COPYRIGHT_CACHE_KEY = 'bible_copyright_cache';
const COPYRIGHT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CopyrightCacheEntry {
  data: FilesetCopyright[];
  cachedAt: number;
}

interface CopyrightCache {
  [bibleId: string]: CopyrightCacheEntry;
}

export const getCachedCopyright = (
  bibleId: string
): FilesetCopyright[] | null => {
  try {
    const cacheStr = getCachedLocalStorage(
      COPYRIGHT_CACHE_KEY
    );
    if (!cacheStr) return null;

    const cache: CopyrightCache = JSON.parse(cacheStr);
    const entry = cache[bibleId];
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > COPYRIGHT_CACHE_TTL) {
      delete cache[bibleId];
      setCachedLocalStorage(
        COPYRIGHT_CACHE_KEY,
        JSON.stringify(cache)
      );
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error(
      'Error reading copyright cache:', error
    );
    return null;
  }
};

export const cacheCopyright = (
  bibleId: string,
  data: FilesetCopyright[]
) => {
  try {
    const cacheStr = getCachedLocalStorage(
      COPYRIGHT_CACHE_KEY
    );
    const cache: CopyrightCache = cacheStr
      ? JSON.parse(cacheStr)
      : {};
    cache[bibleId] = {
      data,
      cachedAt: Date.now(),
    };
    setCachedLocalStorage(
      COPYRIGHT_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch (error) {
    console.error(
      'Error writing copyright cache:', error
    );
  }
};

export const clearCopyrightCache = () => {
  removeCachedLocalStorage(COPYRIGHT_CACHE_KEY);
};

// ============================================
// HEADINGS CACHE (no LRU — small data)
// ============================================

const HEADINGS_CACHE_KEY = 'bible_headings_cache';

interface HeadingsCache {
  [chapterKey: string]: SectionHeading[];
}

export const getCachedHeadings = (
  book: string,
  chapter: number,
  bibleVersion: string
): SectionHeading[] | null => {
  try {
    const cacheStr = getCachedLocalStorage(
      HEADINGS_CACHE_KEY
    );
    if (!cacheStr) return null;
    const cache: HeadingsCache = JSON.parse(cacheStr);
    const key = `${bibleVersion}:${book}:${chapter}`;
    return key in cache ? cache[key] : null;
  } catch (error) {
    console.error('Error reading headings cache:', error);
    return null;
  }
};

export const cacheHeadings = (
  book: string,
  chapter: number,
  bibleVersion: string,
  headings: SectionHeading[]
) => {
  try {
    const cacheStr = getCachedLocalStorage(
      HEADINGS_CACHE_KEY
    );
    const cache: HeadingsCache = cacheStr
      ? JSON.parse(cacheStr)
      : {};
    const key = `${bibleVersion}:${book}:${chapter}`;
    cache[key] = headings;
    setCachedLocalStorage(
      HEADINGS_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch (error) {
    console.error('Error writing headings cache:', error);
  }
};

export const clearHeadingsCache = () => {
  removeCachedLocalStorage(HEADINGS_CACHE_KEY);
};
