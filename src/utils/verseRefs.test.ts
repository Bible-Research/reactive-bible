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

const ref = (bookId: string, chapter: number, verse: number): VerseRef =>
  ({ bookId, chapter, verse });

describe('verseRefs utils', () => {
  it('sameRef compares all three coordinates', () => {
    expect(sameRef(ref('JHN', 3, 16), ref('JHN', 3, 16))).toBe(true);
    expect(sameRef(ref('JHN', 3, 16), ref('JHN', 3, 17))).toBe(false);
    expect(sameRef(ref('JHN', 3, 16), ref('JHN', 4, 16))).toBe(false);
    expect(sameRef(ref('JHN', 3, 16), ref('MRK', 3, 16))).toBe(
      false
    );
  });

  it('refsInclude finds refs structurally', () => {
    const refs = [ref('JHN', 3, 16), ref('JHN', 3, 18)];
    expect(refsInclude(refs, ref('JHN', 3, 18))).toBe(true);
    expect(refsInclude(refs, ref('JHN', 3, 17))).toBe(false);
    expect(refsInclude([], ref('JHN', 3, 17))).toBe(false);
  });

  it('sortRefs orders by canon, chapter, then verse', () => {
    const sorted = sortRefs([
      ref('JHN', 3, 16),
      ref('GEN', 2, 4),
      ref('JHN', 1, 1),
      ref('JHN', 3, 15),
    ]);
    expect(sorted).toEqual([
      ref('GEN', 2, 4),
      ref('JHN', 1, 1),
      ref('JHN', 3, 15),
      ref('JHN', 3, 16),
    ]);
  });

  it('sameRefSet ignores ordering', () => {
    expect(
      sameRefSet(
        [ref('JHN', 3, 18), ref('JHN', 3, 16)],
        [ref('JHN', 3, 16), ref('JHN', 3, 18)]
      )
    ).toBe(true);
    expect(
      sameRefSet([ref('JHN', 3, 16)], [ref('JHN', 3, 16)])
    ).toBe(true);
    expect(
      sameRefSet([ref('JHN', 3, 16)], [ref('JHN', 3, 17)])
    ).toBe(false);
    expect(sameRefSet([], [])).toBe(true);
  });

  it('verseNumbersFor returns sorted numbers for one chapter', () => {
    const refs = [
      ref('JHN', 3, 18),
      ref('JHN', 4, 1),
      ref('JHN', 3, 16),
    ];
    expect(verseNumbersFor(refs, 'JHN', 3)).toEqual([16, 18]);
    expect(verseNumbersFor(refs, 'JHN', 4)).toEqual([1]);
    expect(verseNumbersFor(refs, 'MRK', 1)).toEqual([]);
  });

  it('groupRefsByChapter groups and sorts', () => {
    const groups = groupRefsByChapter([
      ref('JHN', 4, 2),
      ref('JHN', 3, 16),
      ref('JHN', 4, 1),
    ]);
    expect(groups).toEqual([
      { bookId: 'JHN', chapter: 3, verses: [16] },
      { bookId: 'JHN', chapter: 4, verses: [1, 2] },
    ]);
  });

  it('slug normalizes for DOM ids', () => {
    expect(slug('bible')).toBe('bible');
    expect(slug('Song of Solomon')).toBe('song-of-solomon');
    expect(slug('note-1__overlay')).toBe('note-1-overlay');
    expect(slug('!!!')).toBe('x');
  });

  it('verseDomId is unique per scope and coordinate', () => {
    expect(verseDomId('bible', ref('JHN', 3, 16))).toBe(
      'verse-bible-jhn-3-16'
    );
    expect(verseDomId('note-1', ref('JHN', 3, 16))).toBe(
      'verse-note-1-jhn-3-16'
    );
    expect(verseDomId('note-2', ref('JHN', 3, 16))).not.toBe(
      verseDomId('note-1', ref('JHN', 3, 16))
    );
  });
});
