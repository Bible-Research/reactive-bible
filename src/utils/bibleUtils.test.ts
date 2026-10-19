import { describe, it, expect } from 'vitest';
import {
  getTestament,
  BOOK_NAME_TO_CODE,
  BOOK_CODE_TO_TESTAMENT,
  OLD_TESTAMENT_BOOKS,
  NEW_TESTAMENT_BOOKS,
  adjustTimestampsForENGESV,
  filesetCoversTestament,
  sizeToCoverage,
  toUsfmCode,
  toBookName,
  parseBibleRef,
  buildBiblePath,
  encodeVerses,
  decodeVerses,
  resolveTimestampsFilesetId,
  preferTimestampedAudioFileset,
  getChapterCount,
  getMaxVerse,
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

    it('returns null for out-of-range chapters', () => {
      // John has 21 chapters, Malachi 4, Revelation 22.
      expect(parseBibleRef('JHN.22')).toBeNull();
      expect(parseBibleRef('JHN.999')).toBeNull();
      expect(parseBibleRef('MAL.5')).toBeNull();
      expect(parseBibleRef('REV.23')).toBeNull();
    });

    it('returns null when every verse is out of range', () => {
      // John 3 has 36 verses.
      expect(parseBibleRef('JHN.3.999')).toBeNull();
      expect(parseBibleRef('JHN.3.40-99')).toBeNull();
    });

    it('clamps verses beyond the chapter maximum', () => {
      const parsed = parseBibleRef('JHN.3.36-40');
      expect(parsed?.verses).toEqual([36]);
      expect(parsed?.canonical).toBe('JHN.3.36');
      expect(parsed?.needsRedirect).toBe(true);
    });

    it('dedupes repeated verse numbers', () => {
      const parsed = parseBibleRef('JHN.3.16,16');
      expect(parsed?.verses).toEqual([16]);
      expect(parsed?.canonical).toBe('JHN.3.16');
      expect(parsed?.needsRedirect).toBe(true);
    });
  });

  describe('decodeVerses', () => {
    it('decodes ranges and comma lists', () => {
      expect(decodeVerses('16-18')).toEqual([16, 17, 18]);
      expect(decodeVerses('16,18')).toEqual([16, 18]);
      expect(decodeVerses('16-18,20')).toEqual([16, 17, 18, 20]);
    });

    it('dedupes overlapping parts', () => {
      expect(decodeVerses('16,16')).toEqual([16]);
      expect(decodeVerses('16-18,17')).toEqual([16, 17, 18]);
    });

    it('drops non-positive verse numbers', () => {
      expect(decodeVerses('0')).toEqual([]);
      expect(decodeVerses('0,16')).toEqual([16]);
    });

    it('clamps against maxVerse when provided', () => {
      expect(decodeVerses('36-40', 36)).toEqual([36]);
      expect(decodeVerses('37-40', 36)).toEqual([]);
    });

    it('clamps the range end before iterating', () => {
      // A hostile range end must not loop billions of dead
      // numbers — the end is clamped to maxVerse up front.
      expect(decodeVerses('1-2147483647', 36)).toEqual(
        Array.from({ length: 36 }, (_, i) => i + 1)
      );
    });
  });

  describe('chapter/verse bounds', () => {
    it('reports chapter counts per book', () => {
      expect(getChapterCount('JHN')).toBe(21);
      expect(getChapterCount('MAL')).toBe(4);
      expect(getChapterCount('XXX')).toBe(0);
    });

    it('reports verse counts per chapter', () => {
      expect(getMaxVerse('JHN', 3)).toBe(36);
      expect(getMaxVerse('JHN', 99)).toBe(0);
      expect(getMaxVerse('XXX', 1)).toBe(0);
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

  describe('resolveTimestampsFilesetId', () => {
    it('maps ENGESV_API audio to the testament ESV fileset', () => {
      expect(
        resolveTimestampsFilesetId('ENGESV_API', 'ENGESV_API', 'GEN'),
      ).toBe('ENGESVO1DA');
      expect(
        resolveTimestampsFilesetId('ENGESV_API', 'ENGESV_API', 'JHN'),
      ).toBe('ENGESVN1DA');
    });

    it('ignores ENGESV_API as the text fileset', () => {
      // Timestamps are only valid for the recording they were
      // generated from — an ESV text selection must not borrow
      // ESV timestamp rows for a different audio recording
      // (ENGESVO1DA rows misalign with ENGESHO1DA audio).
      expect(
        resolveTimestampsFilesetId(
          'ENGESHO1DA-opus16',
          'ENGESV_API',
          'GEN',
        ),
      ).toBe('ENGESHO1DA');
      expect(
        resolveTimestampsFilesetId(null, 'ENGESV_API', 'GEN'),
      ).toBeNull();
    });

    it('strips the codec suffix for other audio filesets', () => {
      expect(
        resolveTimestampsFilesetId(
          'ENGESHN1DA-opus16',
          'ENGESH',
          'JHN',
        ),
      ).toBe('ENGESHN1DA');
    });
  });

  describe('preferTimestampedAudioFileset', () => {
    it('maps ENGESHO1DA to ENGESVO1DA preserving the suffix', () => {
      expect(preferTimestampedAudioFileset('ENGESHO1DA')).toBe(
        'ENGESVO1DA',
      );
      expect(
        preferTimestampedAudioFileset('ENGESHO1DA-opus16'),
      ).toBe('ENGESVO1DA-opus16');
    });

    it('passes unmapped ids through unchanged', () => {
      expect(preferTimestampedAudioFileset('ENGESHN1DA')).toBe(
        'ENGESHN1DA',
      );
      expect(
        preferTimestampedAudioFileset('ENGESHN1DA-opus16'),
      ).toBe('ENGESHN1DA-opus16');
      expect(preferTimestampedAudioFileset('ENGKJV')).toBe('ENGKJV');
      expect(preferTimestampedAudioFileset('ENGESV_API')).toBe(
        'ENGESV_API',
      );
      expect(preferTimestampedAudioFileset('')).toBe('');
    });
  });

  describe('sizeToCoverage', () => {
    it('parses C as complete coverage of both testaments', () => {
      expect(sizeToCoverage('C')).toEqual({
        testaments: ['OT', 'NT'],
        partial: { OT: false, NT: false },
      });
    });

    it('parses NT and OT as single-testament coverage', () => {
      expect(sizeToCoverage('NT').testaments).toEqual(['NT']);
      expect(sizeToCoverage('OT').testaments).toEqual(['OT']);
      expect(sizeToCoverage('NT').partial.NT).toBe(false);
    });

    it('parses partial codes NTP, OTP and NTPOTP', () => {
      expect(sizeToCoverage('NTP')).toEqual({
        testaments: ['NT'],
        partial: { OT: false, NT: true },
      });
      expect(sizeToCoverage('OTP')).toEqual({
        testaments: ['OT'],
        partial: { OT: true, NT: false },
      });
      expect(sizeToCoverage('NTPOTP')).toEqual({
        testaments: ['OT', 'NT'],
        partial: { OT: true, NT: true },
      });
    });

    it('parses numbered NT1-style codes', () => {
      expect(sizeToCoverage('NT1').testaments).toEqual(['NT']);
      expect(sizeToCoverage('OT1').testaments).toEqual(['OT']);
    });

    it('treats any C in the size as complete both-testament ' +
      'coverage', () => {
      // Backend parity: `fileset_groups.py` checks for `C` as a
      // substring, not `size === 'C'`.
      expect(sizeToCoverage('CNT').testaments).toEqual([
        'OT',
        'NT',
      ]);
      expect(sizeToCoverage('CP').partial).toEqual({
        OT: true,
        NT: true,
      });
    });

    it('is permissive for empty or unknown sizes', () => {
      expect(sizeToCoverage(null).testaments).toEqual(['OT', 'NT']);
      expect(sizeToCoverage('').testaments).toEqual(['OT', 'NT']);
      expect(sizeToCoverage('X').testaments).toEqual(['OT', 'NT']);
    });
  });

  describe('encodeVerses', () => {
    it('encodes runs as ranges and gaps as commas', () => {
      expect(encodeVerses([16, 17, 18])).toBe('16-18');
      expect(encodeVerses([16, 18])).toBe('16,18');
      expect(encodeVerses([1, 2, 3, 7, 9, 10])).toBe(
        '1-3,7,9-10'
      );
    });

    it('encodes a single verse and the empty list', () => {
      expect(encodeVerses([16])).toBe('16');
      expect(encodeVerses([])).toBe('');
    });

    it('sorts input before encoding', () => {
      expect(encodeVerses([18, 16, 17])).toBe('16-18');
    });

    it('does not dedupe repeated verses', () => {
      // Duplicates are preserved as separate terms — callers
      // are expected to pass a clean selection.
      expect(encodeVerses([16, 16])).toBe('16,16');
    });
  });

  describe('decodeVerses', () => {
    it('decodes ranges and comma lists', () => {
      expect(decodeVerses('16-18')).toEqual([16, 17, 18]);
      expect(decodeVerses('16,18')).toEqual([16, 18]);
      expect(decodeVerses('1-3,7')).toEqual([1, 2, 3, 7]);
    });

    it('returns [] for empty and unparseable input', () => {
      expect(decodeVerses('')).toEqual([]);
      expect(decodeVerses('abc')).toEqual([]);
    });

    it('drops open ranges and reversed ranges', () => {
      expect(decodeVerses('16-')).toEqual([]);
      expect(decodeVerses('-3')).toEqual([]);
      expect(decodeVerses('18-16')).toEqual([]);
    });

    it('dedupes duplicates produced by repeated terms', () => {
      // '16,16' used to emit [16, 16] — a repeated verse is a
      // malformed ref, not two verses.
      expect(decodeVerses('16,16')).toEqual([16]);
    });
  });

  describe('filesetCoversTestament', () => {
    it('covers both testaments for C', () => {
      expect(filesetCoversTestament('C', 'OT')).toBe(true);
      expect(filesetCoversTestament('C', 'NT')).toBe(true);
    });

    it('matches single-testament codes', () => {
      expect(filesetCoversTestament('NT', 'NT')).toBe(true);
      expect(filesetCoversTestament('NT', 'OT')).toBe(false);
      expect(filesetCoversTestament('OT', 'OT')).toBe(true);
      expect(filesetCoversTestament('OT', 'NT')).toBe(false);
    });

    it('handles combined partial codes', () => {
      expect(filesetCoversTestament('NTPOTP', 'OT')).toBe(true);
      expect(filesetCoversTestament('NTPOTP', 'NT')).toBe(true);
      expect(filesetCoversTestament('OTP', 'NT')).toBe(false);
      expect(filesetCoversTestament('NTP', 'OT')).toBe(false);
    });

    it('returns true for null/ambiguous input', () => {
      expect(filesetCoversTestament(null, 'OT')).toBe(true);
      expect(filesetCoversTestament('NT', null)).toBe(true);
    });
  });
});
