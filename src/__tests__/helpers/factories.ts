import { Note, Tag } from '../../types';
import { Translation } from '../../store';

/**
 * Mock data factories for testing
 * These factories create realistic test data with sensible defaults
 * and allow overriding specific fields as needed.
 */

/**
 * Create a mock Tag
 */
export const createMockTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: '1',
  name: 'Faith',
  parent_tag: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

/**
 * Create a mock Verse
 */
export const createMockVerse = (
  overrides: Partial<{
    verse: number;
    text: string;
    book: string;
    chapter: number;
  }> = {}
) => ({
  verse: 1,
  text: 'In the beginning...',
  book: 'Genesis',
  chapter: 1,
  ...overrides,
});

/**
 * Create a mock Note
 */
export const createMockNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  note_text: 'Test note',
  tag: createMockTag(),
  public: false,
  is_owner: true,
  tag_position: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  verses: [],
  ...overrides,
});

/**
 * Create multiple mock notes
 */
export const createMockNotes = (count: number): Note[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockNote({
      id: `n${i + 1}`,
      note_text: `Test note ${i + 1}`,
    })
  );
};

/**
 * Create a mock Translation. Defaults mirror the real API shape
 * for ENGKJV after the bundled-KJV injection in
 * `getAvailableTranslations` (`_ET` splits + `ENGKJV`
 * text/audio pseudo-filesets).
 */
export const createMockTranslation = (
  overrides: Partial<Translation> = {}
): Translation => ({
  abbr: 'ENGKJV',
  name: 'King James Version',
  language: 'English',
  language_iso: 'eng',
  filesets: [
    { id: 'ENGKJVO_ET', type: 'text_plain', size: 'OT',
      codec: null, bitrate: null },
    { id: 'ENGKJVN_ET', type: 'text_plain', size: 'NT',
      codec: null, bitrate: null },
    { id: 'ENGKJV', type: 'text_plain', size: 'C',
      codec: null, bitrate: null },
    { id: 'ENGKJV', type: 'audio', size: 'C',
      codec: null, bitrate: null },
  ],
  ...overrides,
});

/**
 * Create multiple mock translations
 */
export const createMockTranslations = (): Translation[] => [
  createMockTranslation(),
  createMockTranslation({
    abbr: 'ENGNIV',
    name: 'New International Version',
    filesets: [
      { id: 'ENGNIVO_ET', type: 'text_plain', size: 'OT',
        codec: null, bitrate: null },
      { id: 'ENGNIVN_ET', type: 'text_plain', size: 'NT',
        codec: null, bitrate: null },
    ],
  }),
  createMockTranslation({
    abbr: 'ENGESV',
    name: 'English Standard Version',
    filesets: [
      { id: 'ENGESVO_ET', type: 'text_plain', size: 'OT',
        codec: null, bitrate: null },
      { id: 'ENGESVN_ET', type: 'text_plain', size: 'NT',
        codec: null, bitrate: null },
      { id: 'ENGESV_API', type: 'text_plain', size: 'C',
        codec: null, bitrate: null },
      { id: 'ENGESV_API', type: 'audio', size: 'C',
        codec: null, bitrate: null },
    ],
  }),
];

/**
 * Create a mock Note with verses
 */
export const createMockNoteWithVerses = (
  verseCount = 1,
  overrides: Partial<Note> = {}
): Note => {
  const verses = Array.from({ length: verseCount }, (_, i) =>
    createMockVerse({
      verse: i + 1,
      text: `Verse ${i + 1} text`,
    })
  );

  return createMockNote({
    verses,
    ...overrides,
  });
};

/**
 * Create a mock Tag with hierarchy
 */
export const createMockTagWithParent = (
  parentName = 'Theology'
): Tag => {
  const parent = createMockTag({
    id: 'parent-1',
    name: parentName,
  });

  return createMockTag({
    id: '2',
    name: 'Grace',
    parent_tag: parent.id,
  });
};

/**
 * Common test data sets
 */
export const mockData = {
  // Single verse note
  singleVerseNote: createMockNoteWithVerses(1, {
    id: 'single-verse',
    note_text: 'Single verse note',
  }),

  // Multi-verse note
  multiVerseNote: createMockNoteWithVerses(3, {
    id: 'multi-verse',
    note_text: 'Multi-verse note',
  }),

  // Empty note (no verses)
  emptyNote: createMockNote({
    id: 'empty',
    note_text: 'Note without verses',
    verses: [],
  }),

  // Common tags
  tags: {
    faith: createMockTag({ id: '1', name: 'Faith' }),
    hope: createMockTag({ id: '2', name: 'Hope' }),
    love: createMockTag({ id: '3', name: 'Love' }),
  },

  // Common verses
  verses: {
    genesis1_1: createMockVerse({
      book: 'Genesis',
      chapter: 1,
      verse: 1,
      text: 'In the beginning God created the heaven and the earth.',
    }),
    john3_16: createMockVerse({
      book: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world...',
    }),
    john11_35: createMockVerse({
      book: 'John',
      chapter: 11,
      verse: 35,
      text: 'Jesus wept.',
    }),
  },
};
