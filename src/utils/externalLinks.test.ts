import { describe, it, expect } from 'vitest';
import { getBooks } from '../api/structure';
import {
  BIBLE_MAPPER_MAPFINDER_URL,
  BIBLE_MAPPER_WEB_URL,
  buildBibleHubUrl,
  buildBibleMapperUrl,
  buildBlbUrl,
  buildShareText,
  buildYouVersionUrl,
} from './externalLinks';

describe('externalLinks URL builders', () => {
  it('builds a YouVersion compare URL for a range', () => {
    expect(buildYouVersionUrl('JHN', 3, [16, 17, 18])).toBe(
      'https://www.bible.com/bible/compare/JHN.3.16-18'
    );
  });

  it('builds a YouVersion URL for a single verse', () => {
    expect(buildYouVersionUrl('JHN', 3, [16])).toBe(
      'https://www.bible.com/bible/compare/JHN.3.16'
    );
  });

  it('returns null from YouVersion builder without verses', () => {
    expect(buildYouVersionUrl('JHN', 3, [])).toBeNull();
  });

  it('builds a BibleHub commentary URL', () => {
    expect(buildBibleHubUrl('JHN', 3, 16)).toBe(
      'https://biblehub.com/john/3-16.htm#commentary'
    );
  });

  it('builds a BibleHub URL for 1 Samuel', () => {
    expect(buildBibleHubUrl('1SA', 2, 5)).toBe(
      'https://biblehub.com/1_samuel/2-5.htm#commentary'
    );
  });

  // Regression: display-name keying broke SNG because
  // toBookName('SNG') is "Song Of Solomon" (capital "Of").
  it('uses the BibleHub "songs" path for SNG', () => {
    expect(buildBibleHubUrl('SNG', 1, 1)).toBe(
      'https://biblehub.com/songs/1-1.htm#commentary'
    );
  });

  it('builds a BLB URL for SNG (previously unmapped)', () => {
    expect(buildBlbUrl('SNG', 1, 1)).toBe(
      'https://www.blueletterbible.org/kjv/sng/1/1/'
    );
  });

  it('builds a BLB URL for a numbered book', () => {
    expect(buildBlbUrl('2CO', 5, 17)).toBe(
      'https://www.blueletterbible.org/kjv/2co/5/17/'
    );
  });

  it('returns null from BLB/BibleHub without a verse', () => {
    expect(buildBlbUrl('JHN', 3, undefined)).toBeNull();
    expect(buildBibleHubUrl('JHN', 3, undefined)).toBeNull();
  });

  it('builds a BibleMapper mapfinder URL with the ref', () => {
    expect(buildBibleMapperUrl('JHN', 3)).toBe(
      `${BIBLE_MAPPER_MAPFINDER_URL}?ref=${encodeURIComponent('John 3')}`
    );
  });

  it('falls back to the bare mapfinder URL', () => {
    expect(buildBibleMapperUrl(null, null)).toBe(
      BIBLE_MAPPER_MAPFINDER_URL
    );
    expect(buildBibleMapperUrl('ZZZ', 1)).toBe(
      BIBLE_MAPPER_MAPFINDER_URL
    );
  });

  it('exposes the BibleMapper WebViewer URL constant', () => {
    expect(BIBLE_MAPPER_WEB_URL).toBe('https://biblemapper.com/web/');
  });

  it('includes scraped verse text in the share body', () => {
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

  it('maps every canonical book to a BLB abbreviation', () => {
    // Every book the API can return must map, or the BLB
    // button silently disappears.
    const books = getBooks();
    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      expect(
        buildBlbUrl(book.book_id, 1, 1),
        `missing BLB abbr for ${book.book_name} ` +
          `(${book.book_id})`
      ).toBeTruthy();
    }
  });
});
