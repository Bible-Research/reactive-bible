import { describe, it, expect } from 'vitest';
import {
  getTestament,
  BOOK_NAME_TO_CODE,
  BOOK_CODE_TO_TESTAMENT,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
  adjustTimestampsForENGESV,
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
});
