import { describe, it, expect } from 'vitest';
import {
  getTestament,
  BOOK_NAME_TO_CODE,
  BOOK_CODE_TO_TESTAMENT,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
  adjustTimestampsForENGESV,
  findTestamentFallback,
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
