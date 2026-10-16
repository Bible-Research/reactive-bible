import { describe, it, expect } from 'vitest';
import { noteHeading } from './noteHeading';
import { Note } from '../types';
import {
  createMockNote,
  createMockVerse,
  createMockTag,
} from '../__tests__/helpers';

const noteWithVerses = (
  verses: Partial<{
    book: string;
    chapter: number;
    verse: number;
    text: string;
  }>[]
): Note =>
  createMockNote({
    verses: verses.map((v) => createMockVerse(v)),
  });

describe('noteHeading', () => {
  it('formats a single verse', () => {
    const note = noteWithVerses([
      { book: 'John', chapter: 3, verse: 16 },
    ]);
    expect(noteHeading(note)).toBe('John 3:16');
  });

  it('formats a same-chapter range', () => {
    const note = noteWithVerses([
      { book: 'John', chapter: 3, verse: 16 },
      { book: 'John', chapter: 3, verse: 17 },
      { book: 'John', chapter: 3, verse: 18 },
    ]);
    expect(noteHeading(note)).toBe('John 3:16-18');
  });

  it('formats a multi-chapter range with both chapters', () => {
    const note = noteWithVerses([
      { book: 'Genesis', chapter: 1, verse: 31 },
      { book: 'Genesis', chapter: 2, verse: 1 },
    ]);
    // Used to render "Genesis 1:31-1" — a nonsense range.
    expect(noteHeading(note)).toBe('Genesis 1:31-2:1');
  });

  it('formats a cross-book range with both endpoints', () => {
    const note = noteWithVerses([
      { book: 'Genesis', chapter: 50, verse: 26 },
      { book: 'Exodus', chapter: 1, verse: 1 },
    ]);
    expect(noteHeading(note)).toBe(
      'Genesis 50:26 - Exodus 1:1'
    );
  });

  it('falls back to the tag name for a verse-less note', () => {
    const note = createMockNote({
      verses: [],
      tag: createMockTag({ name: 'Faith' }),
    });
    // Used to render " 1:1".
    expect(noteHeading(note)).toBe('Faith');
  });

  it('returns an empty string for a verse-less untagged note', () => {
    const note = createMockNote({ verses: [], tag: null });
    expect(noteHeading(note)).toBe('');
  });
});
