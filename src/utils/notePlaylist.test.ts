import { describe, it, expect } from 'vitest';
import { buildNotePlaylistItems } from './notePlaylist';
import type { Note, Verse } from '../types';

const verse = (
  book: string,
  chapter: number,
  v: number
): Verse => ({ book, chapter, verse: v, text: '' });

const note = (
  id: string,
  verses: Verse[] = []
): Note => ({
  id,
  note_text: '',
  public: true,
  is_owner: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '',
  tag: null,
  verses,
  tag_position: null,
});

describe('buildNotePlaylistItems', () => {
  it('returns [] for no notes or only verse-less notes', () => {
    expect(buildNotePlaylistItems([])).toEqual([]);
    expect(buildNotePlaylistItems([note('a')])).toEqual([]);
  });

  it('maps a single-verse note to a single-verse item', () => {
    const items = buildNotePlaylistItems([
      note('n1', [verse('John', 3, 16)]),
    ]);
    expect(items).toEqual([
      {
        itemId: 'n1',
        bookId: 'JHN',
        chapter: 3,
        startVerse: 16,
        endVerse: 16,
        label: 'Note 1/1 – John 3:16',
        verseNumbers: [16],
      },
    ]);
  });

  it('skips verse-less notes but keeps the label numbering ' +
    'over the playable subset', () => {
    const items = buildNotePlaylistItems([
      note('skip'),
      note('n1', [verse('John', 3, 16)]),
      note('n2', [verse('John', 3, 17)]),
    ]);
    expect(items.map((i) => i.itemId)).toEqual(['n1', 'n2']);
    expect(items[0].label).toBe('Note 1/2 – John 3:16');
    expect(items[1].label).toBe('Note 2/2 – John 3:17');
  });

  it('collapses a multi-verse same-chapter block into a ' +
    'ranged item', () => {
    const items = buildNotePlaylistItems([
      note('n1', [
        verse('John', 3, 18),
        verse('John', 3, 16),
        verse('John', 3, 17),
      ]),
    ]);
    expect(items[0]).toMatchObject({
      chapter: 3,
      startVerse: 16,
      endVerse: 18,
      label: 'Note 1/1 – John 3:16-18',
      verseNumbers: [18, 16, 17],
    });
  });

  it('ignores verses outside the first verse\'s chapter ' +
    'when computing the range', () => {
    const items = buildNotePlaylistItems([
      note('n1', [
        verse('John', 3, 16),
        verse('John', 4, 1),
        verse('Mark', 1, 1),
      ]),
    ]);
    expect(items[0]).toMatchObject({
      bookId: 'JHN',
      chapter: 3,
      startVerse: 16,
      endVerse: 16,
      verseNumbers: [16],
    });
  });

  it('falls back to the raw book name when no USFM code ' +
    'is known', () => {
    const items = buildNotePlaylistItems([
      note('n1', [verse('Notabook', 1, 1)]),
    ]);
    expect(items[0].bookId).toBe('Notabook');
  });
});
