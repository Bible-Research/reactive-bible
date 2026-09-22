import { describe, it, expect } from 'vitest';
import {
  sameRef,
  refsInclude,
  sortRefs,
  sameRefSet,
  verseNumbersFor,
  groupRefsByChapter,
  slug,
  verseDomId,
} from './verseRefs';
import type { VerseRef } from '../types';

const ref = (book: string, chapter: number, verse: number): VerseRef =>
  ({ book, chapter, verse });

describe('verseRefs utils', () => {
  it('sameRef compares all three coordinates', () => {
    expect(sameRef(ref('John', 3, 16), ref('John', 3, 16))).toBe(true);
    expect(sameRef(ref('John', 3, 16), ref('John', 3, 17))).toBe(false);
    expect(sameRef(ref('John', 3, 16), ref('John', 4, 16))).toBe(false);
    expect(sameRef(ref('John', 3, 16), ref('Mark', 3, 16))).toBe(
      false
    );
  });

  it('refsInclude finds refs structurally', () => {
    const refs = [ref('John', 3, 16), ref('John', 3, 18)];
    expect(refsInclude(refs, ref('John', 3, 18))).toBe(true);
    expect(refsInclude(refs, ref('John', 3, 17))).toBe(false);
    expect(refsInclude([], ref('John', 3, 17))).toBe(false);
  });

  it('sortRefs orders by canon, chapter, then verse', () => {
    const sorted = sortRefs([
      ref('John', 3, 16),
      ref('Genesis', 2, 4),
      ref('John', 1, 1),
      ref('John', 3, 15),
    ]);
    expect(sorted).toEqual([
      ref('Genesis', 2, 4),
      ref('John', 1, 1),
      ref('John', 3, 15),
      ref('John', 3, 16),
    ]);
  });

  it('sameRefSet ignores ordering', () => {
    expect(
      sameRefSet(
        [ref('John', 3, 18), ref('John', 3, 16)],
        [ref('John', 3, 16), ref('John', 3, 18)]
      )
    ).toBe(true);
    expect(
      sameRefSet([ref('John', 3, 16)], [ref('John', 3, 16)])
    ).toBe(true);
    expect(
      sameRefSet([ref('John', 3, 16)], [ref('John', 3, 17)])
    ).toBe(false);
    expect(sameRefSet([], [])).toBe(true);
  });

  it('verseNumbersFor returns sorted numbers for one chapter', () => {
    const refs = [
      ref('John', 3, 18),
      ref('John', 4, 1),
      ref('John', 3, 16),
    ];
    expect(verseNumbersFor(refs, 'John', 3)).toEqual([16, 18]);
    expect(verseNumbersFor(refs, 'John', 4)).toEqual([1]);
    expect(verseNumbersFor(refs, 'Mark', 1)).toEqual([]);
  });

  it('groupRefsByChapter groups and sorts', () => {
    const groups = groupRefsByChapter([
      ref('John', 4, 2),
      ref('John', 3, 16),
      ref('John', 4, 1),
    ]);
    expect(groups).toEqual([
      { book: 'John', chapter: 3, verses: [16] },
      { book: 'John', chapter: 4, verses: [1, 2] },
    ]);
  });

  it('slug normalizes for DOM ids', () => {
    expect(slug('bible')).toBe('bible');
    expect(slug('Song of Solomon')).toBe('song-of-solomon');
    expect(slug('note-1__overlay')).toBe('note-1-overlay');
    expect(slug('!!!')).toBe('x');
  });

  it('verseDomId is unique per scope and coordinate', () => {
    expect(verseDomId('bible', ref('John', 3, 16))).toBe(
      'verse-bible-john-3-16'
    );
    expect(verseDomId('note-1', ref('John', 3, 16))).toBe(
      'verse-note-1-john-3-16'
    );
    expect(verseDomId('note-2', ref('John', 3, 16))).not.toBe(
      verseDomId('note-1', ref('John', 3, 16))
    );
  });
});
