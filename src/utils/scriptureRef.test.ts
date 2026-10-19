import { describe, it, expect } from 'vitest';
import {
  parseScriptureRef,
  isSameScriptureRef,
} from './scriptureRef';

describe('parseScriptureRef', () => {
  it('parses a USFM single-verse ref', () => {
    const result = parseScriptureRef('@JHN.3.16');
    expect(result).toEqual({
      ok: true,
      ref: { book: 'John', chapter: 3, verses: [16] },
    });
  });

  it('parses a verse range and colon separators', () => {
    const result = parseScriptureRef('@JHN.3:16-18');
    expect(result).toEqual({
      ok: true,
      ref: { book: 'John', chapter: 3, verses: [16, 17, 18] },
    });
  });

  it('resolves book names case-insensitively', () => {
    const result = parseScriptureRef('@john.3.16');
    expect(result.ok && result.ref.book).toBe('John');
  });

  it('lets + escape spaces in book names', () => {
    const result = parseScriptureRef('@1+Corinthians.3.5');
    expect(result).toEqual({
      ok: true,
      ref: {
        book: '1 Corinthians',
        chapter: 3,
        verses: [5],
      },
    });
  });

  it('works without the @ prefix', () => {
    const result = parseScriptureRef('JHN.3.16');
    expect(result.ok && result.ref.verses).toEqual([16]);
  });

  it('rejects an out-of-range chapter', () => {
    const result = parseScriptureRef('@JHN.99.99');
    expect(result).toEqual({
      ok: false,
      error: 'No chapter 99 in John',
    });
  });

  it('rejects an out-of-range verse', () => {
    const result = parseScriptureRef('@JHN.3.999');
    expect(result).toEqual({
      ok: false,
      error: 'No verse 999 in John 3',
    });
  });

  it('rejects a reversed range instead of empty verses', () => {
    const result = parseScriptureRef('@JHN.3.18-16');
    expect(result).toEqual({
      ok: false,
      error: 'Invalid verse range 18-16',
    });
  });

  it('rejects an out-of-range range end', () => {
    const result = parseScriptureRef('@JHN.3.16-99');
    expect(result).toEqual({
      ok: false,
      error: 'No verse 99 in John 3',
    });
  });

  it('rejects unknown books and malformed input', () => {
    expect(parseScriptureRef('@ZZZ.1.1')).toEqual({
      ok: false,
      error: 'Unknown book: ZZZ',
    });
    expect(parseScriptureRef('@JHN')).toEqual({
      ok: false,
      error: 'Invalid scripture format',
    });
    expect(parseScriptureRef('nonsense')).toEqual({
      ok: false,
      error: 'Invalid scripture format',
    });
  });
});

describe('isSameScriptureRef', () => {
  const ref = { book: 'John', chapter: 3, verses: [16] };

  it('is true for equal refs', () => {
    expect(
      isSameScriptureRef(ref, { ...ref, verses: [16] })
    ).toBe(true);
  });

  it('is false for nulls and different refs', () => {
    expect(isSameScriptureRef(null, ref)).toBe(false);
    expect(isSameScriptureRef(ref, null)).toBe(false);
    expect(isSameScriptureRef(null, null)).toBe(false);
    expect(
      isSameScriptureRef(ref, { ...ref, chapter: 4 })
    ).toBe(false);
    expect(
      isSameScriptureRef(ref, { ...ref, verses: [16, 17] })
    ).toBe(false);
    expect(
      isSameScriptureRef(ref, { ...ref, book: 'Mark' })
    ).toBe(false);
  });
});
