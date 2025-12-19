// Cache Manager for Bible Verses and Audio URLs
// Verse cache: LRU with 500-verse limit (copyright compliance)
// Audio cache: Unlimited with expiration handling

const VERSE_CACHE_KEY = 'bible_verse_cache';
const VERSE_CACHE_METADATA_KEY = 'bible_verse_cache_metadata';
const AUDIO_CACHE_KEY = 'bible_audio_cache';
const MAX_VERSES = 500;

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
  totalVerses: number;
  lruQueue: string[]; // Keys in LRU order (oldest first)
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

// ============================================
// VERSE CACHE (500 verse limit with LRU)
// ============================================

export const getVerseCache = (): VerseCache => {
  try {
    const cache = localStorage.getItem(VERSE_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading verse cache:', error);
    return {};
  }
};

export const getVerseCacheMetadata = (): VerseCacheMetadata => {
  try {
    const metadata = localStorage.getItem(VERSE_CACHE_METADATA_KEY);
    return metadata
      ? JSON.parse(metadata)
      : { totalVerses: 0, lruQueue: [] };
  } catch (error) {
    console.error('Error reading verse cache metadata:', error);
    return { totalVerses: 0, lruQueue: [] };
  }
};

export const setVerseCache = (
  cache: VerseCache,
  metadata: VerseCacheMetadata
) => {
  try {
    localStorage.setItem(VERSE_CACHE_KEY, JSON.stringify(cache));
    localStorage.setItem(
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
  const cacheKey = `${bibleVersion}:${book}:${chapter}`;

  // Check if all verses for this chapter are cached
  const cachedVerses: { verse: number; text: string }[] = [];
  let foundAny = false;

  Object.keys(cache).forEach((key) => {
    if (key.startsWith(cacheKey + ':')) {
      foundAny = true;
      const verseData = cache[key];
      cachedVerses.push({
        verse: verseData.verse,
        text: verseData.text,
      });

      // Update LRU: move to end of queue
      const lruIndex = metadata.lruQueue.indexOf(key);
      if (lruIndex > -1) {
        metadata.lruQueue.splice(lruIndex, 1);
      }
      metadata.lruQueue.push(key);

      // Update access count
      verseData.accessCount++;
      verseData.timestamp = Date.now();
    }
  });

  if (foundAny) {
    // Update cache with new access times
    setVerseCache(cache, metadata);
    return cachedVerses.sort((a, b) => a.verse - b.verse);
  }

  return null;
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

  // Calculate how many verses we need to add
  const versesToAdd = verses.length;
  const currentTotal = metadata.totalVerses;
  const newTotal = currentTotal + versesToAdd;

  // If exceeds limit, remove oldest verses (LRU)
  if (newTotal > MAX_VERSES) {
    const versesToRemove = newTotal - MAX_VERSES;
    const keysToRemove = metadata.lruQueue.splice(0, versesToRemove);

    keysToRemove.forEach((key) => {
      delete cache[key];
    });

    metadata.totalVerses -= versesToRemove;
  }

  // Add new verses
  verses.forEach((verse) => {
    const cacheKey = `${bibleVersion}:${book}:${chapter}:${verse.verse}`;
    cache[cacheKey] = {
      verse: verse.verse,
      text: verse.text,
      timestamp: now,
      accessCount: 1,
    };
    metadata.lruQueue.push(cacheKey);
    metadata.totalVerses++;
  });

  setVerseCache(cache, metadata);
};

export const clearVerseCache = () => {
  localStorage.removeItem(VERSE_CACHE_KEY);
  localStorage.removeItem(VERSE_CACHE_METADATA_KEY);
};

// ============================================
// AUDIO CACHE (Unlimited, with expiration)
// ============================================

export const getAudioCache = (): AudioCache => {
  try {
    const cache = localStorage.getItem(AUDIO_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading audio cache:', error);
    return {};
  }
};

export const setAudioCache = (cache: AudioCache) => {
  try {
    localStorage.setItem(AUDIO_CACHE_KEY, JSON.stringify(cache));
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
  duration: number = 0,
  fileSize: number = 0
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
  localStorage.removeItem(AUDIO_CACHE_KEY);
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
