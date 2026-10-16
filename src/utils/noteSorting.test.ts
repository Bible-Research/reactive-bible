import { describe, it, expect } from 'vitest';
import {
  SORT_ORDERS,
  SortOrder,
  getApiOrdering,
  sortNotes,
} from './noteSorting';
import type { Note, Verse } from '../types';

const verse = (
  book: string,
  chapter: number,
  v: number
): Verse => ({ book, chapter, verse: v, text: '' });

const note = (
  id: string,
  overrides: Partial<Note> = {}
): Note => ({
  id,
  note_text: '',
  public: true,
  is_owner: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '',
  tag: null,
  verses: [],
  tag_position: null,
  ...overrides,
});

const ids = (notes: Note[]) => notes.map((n) => n.id);

describe('getApiOrdering', () => {
  it('maps every sort order to its API ordering param', () => {
    const expected: Record<SortOrder, string> = {
      custom_asc: 'custom',
      custom_desc: '-custom',
      created_desc: '-created',
      created_asc: 'created',
      verse_asc: 'verse',
      verse_desc: '-verse',
    };
    for (const order of SORT_ORDERS) {
      expect(getApiOrdering(order)).toBe(expected[order]);
    }
  });
});

describe('sortNotes', () => {
  it('does not mutate the input array', () => {
    const notes = [
      note('a', { created_at: '2024-01-02T00:00:00Z' }),
      note('b', { created_at: '2024-01-01T00:00:00Z' }),
    ];
    const sorted = sortNotes(notes, 'created_asc');
    expect(ids(notes)).toEqual(['a', 'b']);
    expect(ids(sorted)).toEqual(['b', 'a']);
  });

  it('sorts by tag_position ascending for custom_asc', () => {
    const notes = [
      note('c', { tag_position: 3 }),
      note('a', { tag_position: 1 }),
      note('b', { tag_position: 2 }),
    ];
    expect(ids(sortNotes(notes, 'custom_asc')))
      .toEqual(['a', 'b', 'c']);
  });

  it('sorts by tag_position descending for custom_desc', () => {
    const notes = [
      note('a', { tag_position: 1 }),
      note('c', { tag_position: 3 }),
      note('b', { tag_position: 2 }),
    ];
    expect(ids(sortNotes(notes, 'custom_desc')))
      .toEqual(['c', 'b', 'a']);
  });

  it('treats a missing tag_position as 0 and breaks custom ' +
    'ties by recency', () => {
    const notes = [
      note('older', {
        tag_position: null,
        created_at: '2024-01-01T00:00:00Z',
      }),
      note('newer', {
        tag_position: null,
        created_at: '2024-01-03T00:00:00Z',
      }),
      note('positioned', { tag_position: 1 }),
    ];
    // null position == 0: both unpositioned notes sort before
    // position 1, newest first ascending.
    expect(ids(sortNotes(notes, 'custom_asc')))
      .toEqual(['newer', 'older', 'positioned']);
    // Descending keeps the position order flipped and the
    // recency tiebreak reversed.
    expect(ids(sortNotes(notes, 'custom_desc')))
      .toEqual(['positioned', 'older', 'newer']);
  });

  it('sorts by created_at both directions', () => {
    const notes = [
      note('mid', { created_at: '2024-01-02T00:00:00Z' }),
      note('new', { created_at: '2024-01-03T00:00:00Z' }),
      note('old', { created_at: '2024-01-01T00:00:00Z' }),
    ];
    expect(ids(sortNotes(notes, 'created_desc')))
      .toEqual(['new', 'mid', 'old']);
    expect(ids(sortNotes(notes, 'created_asc')))
      .toEqual(['old', 'mid', 'new']);
  });

  it('sorts by first verse in canonical book order', () => {
    const notes = [
      note('john', { verses: [verse('John', 3, 16)] }),
      note('gen', { verses: [verse('Genesis', 1, 1)] }),
      note('exod', { verses: [verse('Exodus', 20, 3)] }),
    ];
    expect(ids(sortNotes(notes, 'verse_asc')))
      .toEqual(['gen', 'exod', 'john']);
    expect(ids(sortNotes(notes, 'verse_desc')))
      .toEqual(['john', 'exod', 'gen']);
  });

  it('orders by chapter then verse within a book', () => {
    const notes = [
      note('c3v17', { verses: [verse('John', 3, 17)] }),
      note('c1v5', { verses: [verse('John', 1, 5)] }),
      note('c3v16', { verses: [verse('John', 3, 16)] }),
    ];
    expect(ids(sortNotes(notes, 'verse_asc')))
      .toEqual(['c1v5', 'c3v16', 'c3v17']);
  });

  it('keeps verse-less notes last in both verse directions', () => {
    const notes = [
      note('empty', { verses: [] }),
      note('john', { verses: [verse('John', 3, 16)] }),
      note('gen', { verses: [verse('Genesis', 1, 1)] }),
    ];
    expect(ids(sortNotes(notes, 'verse_asc')))
      .toEqual(['gen', 'john', 'empty']);
    expect(ids(sortNotes(notes, 'verse_desc')))
      .toEqual(['john', 'gen', 'empty']);
  });
});
