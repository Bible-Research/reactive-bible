import { describe, it, expect } from 'vitest';
import {
  BOOK_TO_BLB_ABBR,
  buildBibleHubUrl,
  buildBlbUrl,
  buildMapUrl,
  buildShareText,
  buildYouVersionUrl,
} from '../VerseActionToolbar';
import { getBooks } from '../../api';
import { toUsfmCode } from '../../utils/bibleUtils';

describe('VerseActionToolbar URL builders', () => {
  it('builds a YouVersion compare URL for a single verse',
    () => {
      expect(
        buildYouVersionUrl({
          bookId: 'JHN',
          chapter: 3,
          verses: [16],
        })
      ).toBe('https://www.bible.com/bible/compare/JHN.3.16');
    });

  it('builds a YouVersion compare URL for a verse range',
    () => {
      expect(
        buildYouVersionUrl({
          bookId: 'JHN',
          chapter: 3,
          verses: [16, 17, 18],
        })
      ).toBe('https://www.bible.com/bible/compare/JHN.3.16-18');
    });

  it('builds a BibleHub commentary URL from the book name',
    () => {
      expect(buildBibleHubUrl('JHN', 'John', 3, 16)).toBe(
        'https://biblehub.com/john/3-16.htm#commentary'
      );
      expect(
        buildBibleHubUrl('1SA', '1 Samuel', 17, 40)
      ).toBe(
        'https://biblehub.com/1_samuel/17-40.htm#commentary'
      );
    });

  it('maps Song of Solomon to BibleHub\'s "songs" path even ' +
    'when the display name arrives title-cased', () => {
      // toBookName yields "Song Of Solomon" — a name-keyed
      // override never matched, so the path was "/song_of_"
      // until the lookup moved to USFM codes.
      expect(
        buildBibleHubUrl('SNG', 'Song Of Solomon', 2, 4)
      ).toBe('https://biblehub.com/songs/2-4.htm#commentary');
    });

  it('builds a Blue Letter Bible KJV URL via the abbr map',
    () => {
      expect(buildBlbUrl('JHN', 3, 16)).toBe(
        'https://www.blueletterbible.org/kjv/jhn/3/16/'
      );
      expect(buildBlbUrl('PSA', 23, 1)).toBe(
        'https://www.blueletterbible.org/kjv/psa/23/1/'
      );
    });

  it('returns null from buildBlbUrl for unmapped books', () => {
    expect(buildBlbUrl('XXX', 1, 1)).toBeNull();
  });

  it('covers every canonical book in BOOK_TO_BLB_ABBR', () => {
    // Every book the API can return must have an abbreviation,
    // or the BLB button silently disappears. The map is keyed
    // by USFM code because display names are title-cased and
    // lost the "of"/"Of" distinction.
    const books = getBooks();
    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      const code = toUsfmCode(book.book_name);
      expect(
        code && BOOK_TO_BLB_ABBR[code],
        `missing BLB abbr for ${book.book_name}`
      ).toBeTruthy();
    }
  });

  it('builds a BibleMapper URL scoped to the chapter', () => {
    expect(buildMapUrl('John', 3)).toBe(
      'https://biblemapper.com/blog/mapfinder/?ref=John%203'
    );
  });

  it('falls back to the generic mapfinder page without ' +
    'a selection', () => {
      expect(buildMapUrl(null, null)).toBe(
        'https://biblemapper.com/blog/mapfinder/'
      );
    });
});

describe('buildShareText', () => {
  it('includes scraped verse text when present', () => {
    expect(
      buildShareText(
        'For God so loved the world',
        'John 3:16',
        'https://app.test/bible/JHN.3.16'
      )
    ).toBe(
      'For God so loved the world\n\n' +
        'John 3:16\n\n' +
        'https://app.test/bible/JHN.3.16'
    );
  });

  it('falls back to the bare reference when no verse text ' +
    'was scraped', () => {
      expect(
        buildShareText(
          '',
          'John 3:16-18',
          'https://app.test/bible/JHN.3.16-18'
        )
      ).toBe(
        'John 3:16-18\n\nhttps://app.test/bible/JHN.3.16-18'
      );
    });
});
