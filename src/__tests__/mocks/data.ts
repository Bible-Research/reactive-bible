import { Note, Tag, Verse } from '../../types';
import { Translation, Fileset } from '../../store';

// --- Tags ---
export const mockTags: Tag[] = [
  {
    id: '1',
    name: 'Faith',
    parent_tag: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Hope',
    parent_tag: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '3',
    name: 'Love',
    parent_tag: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// --- Verses ---
export const mockVerses: Verse[] = [
  { book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning...' },
  { book: 'Genesis', chapter: 1, verse: 2, text: 'The earth was without form...' },
  { book: 'Genesis', chapter: 1, verse: 3, text: 'And God said, Let there be light...' },
  { book: 'John', chapter: 3, verse: 16, text: 'For God so loved the world...' },
  { book: 'John', chapter: 11, verse: 35, text: 'Jesus wept.' },
];

// --- Notes ---
export const mockNotes: Note[] = [
  {
    id: 'n1',
    note_text: 'This is a test note about faith.',
    tag: mockTags[0],
    public: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    verses: [mockVerses[0]],
  },
  {
    id: 'n2',
    note_text: 'This is a multi-verse note.',
    tag: mockTags[0],
    public: false,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    verses: [mockVerses[0], mockVerses[1]],
  },
  {
    id: 'n3',
    note_text: 'A note about hope.',
    tag: mockTags[1],
    public: true,
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    verses: [mockVerses[3]],
  },
];

// --- Filesets ---
export const mockFilesets: Fileset[] = [
  { id: 'ENGKJV', type: 'text_plain', size: 'C', codec: null, bitrate: null },
  { id: 'ENGKJVO1DA', type: 'audio', size: 'OT', codec: 'mp3', bitrate: '64' },
  { id: 'ENGKJVN1DA', type: 'audio', size: 'NT', codec: 'mp3', bitrate: '64' },
];

// --- Translations ---
export const mockTranslations: Translation[] = [
  {
    abbr: 'KJV',
    name: 'King James Version',
    language: 'English',
    language_iso: 'eng',
    filesets: mockFilesets,
  },
  {
    abbr: 'ESV',
    name: 'English Standard Version',
    language: 'English',
    language_iso: 'eng',
    filesets: [
      { id: 'ENGESV', type: 'text_plain', size: 'C', codec: null, bitrate: null },
    ],
  },
  {
    abbr: 'NIV',
    name: 'New International Version',
    language: 'English',
    language_iso: 'eng',
    filesets: [
      { id: 'ENGNIV', type: 'text_plain', size: 'C', codec: null, bitrate: null },
    ],
  },
];

// --- Audio URLs ---
export const mockAudioUrls = {
  genesis1: 'https://audio.bible.is/ENGKJVO1DA/GEN/1.mp3?Expires=1735689600',
  john3: 'https://audio.bible.is/ENGKJVN1DA/JHN/3.mp3?Expires=1735689600',
};

// --- Books (simplified) ---
export const mockBooks = [
  { book_id: 'Gen', book_name: 'Genesis' },
  { book_id: 'Exod', book_name: 'Exodus' },
  { book_id: 'Lev', book_name: 'Leviticus' },
  { book_id: 'Matt', book_name: 'Matthew' },
  { book_id: 'John', book_name: 'John' },
  { book_id: 'Rev', book_name: 'Revelation' },
];

// --- API Response Mocks ---
export const mockApiResponses = {
  verses: {
    success: { verses: mockVerses.slice(0, 3) },
    empty: { verses: [] },
    error: { error: 'Failed to fetch verses' },
  },
  audio: {
    success: { audio_url: mockAudioUrls.genesis1 },
    error: { error: 'Failed to fetch audio' },
  },
  translations: {
    success: mockTranslations,
    empty: [],
  },
  notes: {
    success: mockNotes,
    empty: [],
  },
  tags: {
    success: mockTags,
    empty: [],
  },
};
