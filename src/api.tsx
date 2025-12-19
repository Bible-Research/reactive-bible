import bibleJson from "./assets/kjv.json";
import {
  getCachedVerses,
  cacheVerses,
  getCachedAudioUrl,
  cacheAudioUrl,
} from './utils/cacheManager';
/**
 * Interface for the locally stored KJV Bible data.
 * Note: ESV Bible data is not stored locally but fetched from an external API when needed.
 */
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
  bibleVersion: string
): Promise<{ verse: number; text: string }[]> => {
  if (bibleVersion === 'KJV') {
    return getVersesInKjvChapter(thebook, thechapter);
  } else if (bibleVersion === 'ESV') {
    return await getVersesInEsvChapter(thebook, thechapter);
  } else {
    throw new Error(`Unsupported Bible version: ${bibleVersion}`);
  }
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

export const getVersesInEsvChapter = async (
  thebook: string,
  thechapter: number
): Promise<{ verse: number; text: string }[]> => {
  // Check cache first
  const cached = getCachedVerses(thebook, thechapter, 'ESV');
  if (cached) {
    console.log('✅ ESV verses loaded from cache');
    return cached;
  }

  // Fetch from API
  try {
    const passage = `${thebook} ${thechapter}`;
    const url = `https://bible-research.vercel.app/api/v1/bible?passage=${passage}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    const verses = data.verses.map(
      (verse: { verse: number; text: string }) => ({
        verse: verse.verse,
        text: verse.text,
      })
    );

    // Cache the verses
    cacheVerses(thebook, thechapter, 'ESV', verses);
    console.log('💾 ESV verses cached');

    return verses;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getPassage = (): {
  book_name: string;
  book_id: string;
  chapter: number;
}[] => {
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
  }) as {
    book_name: string;
    book_id: string;
    chapter: number;
  }[];
};

export const addTagNote = async (
  tagId: string,
  tagNoteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[]
) => {
  const body = JSON.stringify({
    tag: tagId,
    note_text: tagNoteText,
    verse_references: verseReferences,
  })

  try {
    const response = await fetch('https://bible-research.vercel.app/api/v1/notes/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
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
  translation: string
): Promise<string> => {
  // Check cache first
  const cached = getCachedAudioUrl(book, chapter, translation);
  if (cached) {
    console.log('✅ Audio URL loaded from cache');
    return cached;
  }

  // Fetch from API
  try {
    const passage = `${book} ${chapter}`;
    const url = `https://bible-research.vercel.app/api/v1/bible?passage=${passage}&response_format=audio`;

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
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: NoteVerse[];
}

export const getNotes = async (): Promise<Note[]> => {
  const response = await fetch(
    'https://bible-research.vercel.app/api/v1/notes/'
  );
  if (!response.ok) throw new Error('Failed to fetch notes');
  return await response.json();
};
