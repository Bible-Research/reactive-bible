import { Note, Tag } from '../../types';

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
