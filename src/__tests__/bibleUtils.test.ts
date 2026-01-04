import {
  getTestament,
  BOOK_NAME_TO_CODE,
  BOOK_CODE_TO_TESTAMENT,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
} from '../utils/bibleUtils';

describe('bibleUtils', () => {
  describe('getTestament', () => {
    it('should return OT for Old Testament books', () => {
      expect(getTestament('GEN')).toBe('OT');
      expect(getTestament('MAL')).toBe('OT');
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
      expect(BOOK_NAME_TO_CODE['1 samuel']).toBe('1SA');
    });

    it('should not contain mappings for non-existent books', () => {
      expect(BOOK_NAME_TO_CODE['non-existent']).toBeUndefined();
    });
  });

  describe('BOOK_CODE_TO_TESTAMENT', () => {
    it('should correctly map book codes to testaments', () => {
      expect(BOOK_CODE_TO_TESTAMENT['GEN']).toBe('OT');
      expect(BOOK_CODE_TO_TESTAMENT['MAT']).toBe('NT');
    });

    it('should not contain mappings for invalid codes', () => {
      expect(BOOK_CODE_TO_TESTAMENT['INVALID']).toBeUndefined();
    });
  });

  describe('Testament Book Sets', () => {
    it('OLD_TESTAMENT_BOOKS should contain correct books', () => {
      expect(OLD_TESTAMENT_BOOKS.has('GEN')).toBe(true);
      expect(OLD_TESTAMENT_BOOKS.has('MAL')).toBe(true);
      expect(OLD_TESTAMENT_BOOKS.has('MAT')).toBe(false);
    });

    it('NEW_TESTAMENT_BOOKS should contain correct books', () => {
      expect(NEW_TESTAMENT_BOOKS.has('MAT')).toBe(true);
      expect(NEW_TESTAMENT_BOOKS.has('REV')).toBe(true);
      expect(NEW_TESTAMENT_BOOKS.has('GEN')).toBe(false);
    });

    it('should have the correct number of books in each testament', () => {
      // There are 39 books in the Old Testament and 27 in the New Testament.
      expect(OLD_TESTAMENT_BOOKS.size).toBe(39);
      expect(NEW_TESTAMENT_BOOKS.size).toBe(27);
    });
  });
});
