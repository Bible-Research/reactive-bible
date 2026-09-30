import { describe, it, expect } from 'vitest';
import {
  getTestament,
  BOOK_NAME_TO_CODE,
  BOOK_CODE_TO_TESTAMENT,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
  adjustTimestampsForENGESV,
  findTestamentFallback,
  toUsfmCode,
  toBookName,
  parseBibleRef,
  buildBiblePath,
  type Fileset,
} from './bibleUtils';

describe('Bible Utils', () => {
  describe('getTestament', () => {
    it('should return OT for Old Testament books', () => {
      expect(getTestament('GEN')).toBe('OT');
      expect(getTestament('PSA')).toBe('OT');
    });

    it('should return NT for New Testament books', () => {
      expect(getTestament('MAT')).toBe('NT');
      expect(getTestament('REV')).toBe('NT');
    });

    it('should be case-insensitive', () => {
      expect(getTestament('gen')).toBe('OT');
      expect(getTestament('mat')).toBe('NT');
    });

    it('should return null for invalid book codes', () => {
      expect(getTestament('INVALID')).toBeNull();
      expect(getTestament('')).toBeNull();
    });
  });

  describe('BOOK_NAME_TO_CODE', () => {
    it('should correctly map book names to codes', () => {
      expect(BOOK_NAME_TO_CODE['genesis']).toBe('GEN');
      expect(BOOK_NAME_TO_CODE['revelation']).toBe('REV');
    });
  });

  describe('toUsfmCode', () => {
    it('resolves display names to codes', () => {
      expect(toUsfmCode('John')).toBe('JHN');
      expect(toUsfmCode('1 Corinthians')).toBe('1CO');
      expect(toUsfmCode('1 John')).toBe('1JN');
      expect(toUsfmCode('1 Chronicles')).toBe('1CH');
      expect(toUsfmCode('Song of Solomon')).toBe('SNG');
    });

    it('is case-insensitive for names', () => {
      expect(toUsfmCode('john')).toBe('JHN');
      expect(toUsfmCode('1 corinthians')).toBe('1CO');
    });

    it('accepts codes in any case', () => {
      expect(toUsfmCode('JHN')).toBe('JHN');
      expect(toUsfmCode('jhn')).toBe('JHN');
      expect(toUsfmCode('1co')).toBe('1CO');
    });

    it('returns null for unknown books', () => {
      expect(toUsfmCode('NotABook')).toBeNull();
      expect(toUsfmCode('')).toBeNull();
    });
  });

  describe('toBookName', () => {
    it('resolves codes to display names', () => {
      expect(toBookName('JHN')).toBe('John');
      expect(toBookName('1CO')).toBe('1 Corinthians');
      expect(toBookName('SNG')).toBe('Song Of Solomon');
    });

    it('is case-insensitive', () => {
      expect(toBookName('jhn')).toBe('John');
    });

    it('returns null for unknown codes', () => {
      expect(toBookName('XXX')).toBeNull();
      expect(toBookName('John')).toBeNull();
    });
  });

  describe('parseBibleRef', () => {
    it('parses book-only refs to chapter 1', () => {
      expect(parseBibleRef('JHN')).toEqual({
        bookId: 'JHN',
        chapter: 1,
        verses: [],
        canonical: 'JHN.1',
        needsRedirect: true,
      });
    });

    it('parses book.chapter refs', () => {
      expect(parseBibleRef('JHN.3')).toEqual({
        bookId: 'JHN',
        chapter: 3,
        verses: [],
        canonical: 'JHN.3',
        needsRedirect: false,
      });
    });

    it('parses single-verse refs', () => {
      expect(parseBibleRef('JHN.3.16')).toEqual({
        bookId: 'JHN',
        chapter: 3,
        verses: [16],
        canonical: 'JHN.3.16',
        needsRedirect: false,
      });
    });

    it('parses range and comma verse refs', () => {
      const parsed = parseBibleRef('JHN.3.16-18,20');
      expect(parsed?.verses).toEqual([16, 17, 18, 20]);
      expect(parsed?.canonical).toBe('JHN.3.16-18,20');
      expect(parsed?.needsRedirect).toBe(false);
    });

    it('parses book names and flags redirect', () => {
      const parsed = parseBibleRef('John.3');
      expect(parsed?.bookId).toBe('JHN');
      expect(parsed?.canonical).toBe('JHN.3');
      expect(parsed?.needsRedirect).toBe(true);
    });

    it('flags lowercase codes for redirect', () => {
      const parsed = parseBibleRef('jhn.3');
      expect(parsed?.bookId).toBe('JHN');
      expect(parsed?.needsRedirect).toBe(true);
    });

    it('expands dense verse lists in canonical form', () => {
      const parsed = parseBibleRef('JHN.3.16,17');
      expect(parsed?.canonical).toBe('JHN.3.16-17');
      expect(parsed?.needsRedirect).toBe(true);
    });

    it('returns null for invalid refs', () => {
      expect(parseBibleRef('FOO.1')).toBeNull();
      expect(parseBibleRef('JHN.abc')).toBeNull();
      expect(parseBibleRef('JHN.3.x')).toBeNull();
      expect(parseBibleRef('JHN.3.16.2')).toBeNull();
      expect(parseBibleRef('')).toBeNull();
    });

    it('returns null for non-positive chapters', () => {
      expect(parseBibleRef('JHN.0')).toBeNull();
    });
  });

  describe('buildBiblePath', () => {
    it('builds chapter paths from codes', () => {
      expect(buildBiblePath('JHN', 3)).toBe('/bible/JHN.3');
      expect(buildBiblePath('1CO', 1)).toBe('/bible/1CO.1');
    });

    it('builds chapter paths from names', () => {
      expect(buildBiblePath('John', 3)).toBe('/bible/JHN.3');
    });

    it('appends encoded verses', () => {
      expect(buildBiblePath('JHN', 3, [16])).toBe('/bible/JHN.3.16');
      expect(
        buildBiblePath('JHN', 3, [16, 17, 18, 20])
      ).toBe('/bible/JHN.3.16-18,20');
    });

    it('sorts verses into ranges', () => {
      expect(buildBiblePath('JHN', 3, [18, 17, 16])).toBe(
        '/bible/JHN.3.16-18'
      );
    });

    it('falls back to /bible for unknown books', () => {
      expect(buildBiblePath('NotABook', 3)).toBe('/bible');
    });
  });

  describe('BOOK_CODE_TO_TESTAMENT', () => {
    it('should correctly map book codes to testaments', () => {
      expect(BOOK_CODE_TO_TESTAMENT['GEN']).toBe('OT');
      expect(BOOK_CODE_TO_TESTAMENT['REV']).toBe('NT');
    });
  });

  describe('Testament Book Sets', () => {
    it('should contain the correct books in the Old Testament set', () => {
      expect(OLD_TESTAMENT_BOOKS.has('GEN')).toBe(true);
      expect(OLD_TESTAMENT_BOOKS.has('MAL')).toBe(true);
      expect(OLD_TESTAMENT_BOOKS.has('MAT')).toBe(false);
    });

    it('should contain the correct books in the New Testament set', () => {
      expect(NEW_TESTAMENT_BOOKS.has('MAT')).toBe(true);
      expect(NEW_TESTAMENT_BOOKS.has('REV')).toBe(true);
      expect(NEW_TESTAMENT_BOOKS.has('GEN')).toBe(false);
    });
  });

  describe('adjustTimestampsForENGESV', () => {
    it('adjusts timestamps by subtracting verse 0-1 offset', () => {
      const input = [
        { verse_start: 0, timestamp: 0 },
        { verse_start: 1, timestamp: 2.44 },
        { verse_start: 2, timestamp: 5.0 },
        { verse_start: 3, timestamp: 8.5 },
      ];
      const result = adjustTimestampsForENGESV(input, 'ENGESV_API');
      expect(result).toEqual([
        { verse_start: 0, timestamp: 0 },
        { verse_start: 1, timestamp: 0 },
        { verse_start: 2, timestamp: 2.56 },
        { verse_start: 3, timestamp: 6.06 },
      ]);
    });

    it('returns original timestamps for non-ENGESV_API filesets', () => {
      const input = [
        { verse_start: 0, timestamp: 0 },
        { verse_start: 1, timestamp: 2.44 },
      ];
      const result = adjustTimestampsForENGESV(input, 'ENGESHN1DA');
      expect(result).toBe(input);
    });

    it('returns original timestamps when audioFilesetId is null', () => {
      const input = [
        { verse_start: 0, timestamp: 0 },
        { verse_start: 1, timestamp: 2.44 },
      ];
      const result = adjustTimestampsForENGESV(input, null);
      expect(result).toBe(input);
    });

    it('returns original timestamps when empty array', () => {
      const result = adjustTimestampsForENGESV([], 'ENGESV_API');
      expect(result).toEqual([]);
    });

    it('returns original timestamps when verse 0 is missing', () => {
      const input = [
        { verse_start: 1, timestamp: 2.44 },
        { verse_start: 2, timestamp: 5.0 },
      ];
      const result = adjustTimestampsForENGESV(input, 'ENGESV_API');
      expect(result).toBe(input);
    });

    it('returns original timestamps when verse 1 is missing', () => {
      const input = [
        { verse_start: 0, timestamp: 0 },
        { verse_start: 2, timestamp: 5.0 },
      ];
      const result = adjustTimestampsForENGESV(input, 'ENGESV_API');
      expect(result).toBe(input);
    });

    it('ensures timestamps never go below 0', () => {
      const input = [
        { verse_start: 0, timestamp: 5.0 },
        { verse_start: 1, timestamp: 10.0 },
        { verse_start: 2, timestamp: 3.0 },
      ];
      const result = adjustTimestampsForENGESV(input, 'ENGESV_API');
      expect(result[2].timestamp).toBe(0);
    });
  });

  describe('findTestamentFallback', () => {
    const mockFilesets: Fileset[] = [
      {
        id: 'ENGESHO1DA',
        type: 'audio',
        size: 'OT',
        codec: null,
        bitrate: null,
      },
      {
        id: 'ENGESHN1DA',
        type: 'audio',
        size: 'NT',
        codec: null,
        bitrate: null,
      },
      {
        id: 'ENGESHO1DA-opus16',
        type: 'audio',
        size: 'OT',
        codec: 'opus',
        bitrate: '16',
      },
      {
        id: 'ENGESHN1DA-opus16',
        type: 'audio',
        size: 'NT',
        codec: 'opus',
        bitrate: '16',
      },
      {
        id: 'LATBSLN2DA',
        type: 'audio',
        size: 'NT',
        codec: null,
        bitrate: null,
      },
      {
        id: 'LATBSLP2DA',
        type: 'audio',
        size: 'P',
        codec: null,
        bitrate: null,
      },
    ];

    it('finds OT fallback for NT fileset', () => {
      const result = findTestamentFallback(
        'ENGESHN1DA',
        'OT',
        mockFilesets
      );
      expect(result).toBe('ENGESHO1DA');
    });

    it('finds NT fallback for OT fileset', () => {
      const result = findTestamentFallback(
        'ENGESHO1DA',
        'NT',
        mockFilesets
      );
      expect(result).toBe('ENGESHN1DA');
    });

    it('preserves codec suffix when finding fallback', () => {
      const result = findTestamentFallback(
        'ENGESHN1DA-opus16',
        'OT',
        mockFilesets
      );
      expect(result).toBe('ENGESHO1DA-opus16');
    });

    it('returns null when no matching fallback exists', () => {
      const result = findTestamentFallback(
        'LATBSLN2DA',
        'OT',
        mockFilesets
      );
      expect(result).toBeNull();
    });

    it('returns null for partial coverage filesets', () => {
      const result = findTestamentFallback(
        'LATBSLP2DA',
        'OT',
        mockFilesets
      );
      expect(result).toBeNull();
    });

    it('handles case-insensitive matching', () => {
      const result = findTestamentFallback(
        'engeshn1da',
        'OT',
        mockFilesets
      );
      expect(result).toBe('engesho1da');
    });

    it('returns null when fileset has no testament indicator', () => {
      const result = findTestamentFallback(
        'ENGKJV',
        'OT',
        mockFilesets
      );
      expect(result).toBeNull();
    });

    it('returns null when available filesets is empty', () => {
      const result = findTestamentFallback(
        'ENGESHN1DA',
        'OT',
        []
      );
      expect(result).toBeNull();
    });
  });
});
