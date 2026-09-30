import { describe, it, expect } from 'vitest';
import {
  buildScriptureToken,
  formatMentionPreview,
  isValidScriptureToken,
  matchBookNames,
  parseMentionQuery,
} from './scriptureMention';

describe('matchBookNames', () => {
  it('returns all books for an empty query', () => {
    expect(matchBookNames('')).toHaveLength(66);
  });

  it('filters by name prefix', () => {
    const matches = matchBookNames('J');
    expect(matches).toContain('John');
    expect(matches).toContain('James');
    expect(matches).toContain('Judges');
    expect(matches).not.toContain('Genesis');
  });

  it('matches USFM codes', () => {
    expect(matchBookNames('JHN')).toEqual(['John']);
  });

  it('matches multi-word names without separators', () => {
    expect(matchBookNames('1co')).toEqual(['1 Corinthians']);
    expect(matchBookNames('songof')).toEqual([
      'Song of Solomon',
    ]);
  });
});

describe('parseMentionQuery', () => {
  it('returns an empty parse for an empty query', () => {
    const p = parseMentionQuery('');
    expect(p.bookName).toBeNull();
    expect(p.bookMatches).toHaveLength(66);
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('filters books on a partial prefix without error', () => {
    const p = parseMentionQuery('J');
    expect(p.bookName).toBeNull();
    expect(p.bookMatches).toContain('John');
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('resolves a USFM code and awaits chapter', () => {
    const p = parseMentionQuery('JHN.');
    expect(p.bookName).toBe('John');
    expect(p.chapter).toBeNull();
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('resolves book + chapter and awaits verse', () => {
    const p = parseMentionQuery('JHN.3');
    expect(p.bookName).toBe('John');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBeNull();
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('parses a complete single-verse ref', () => {
    const p = parseMentionQuery('JHN.3.16');
    expect(p.bookName).toBe('John');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBe(16);
    expect(p.verseEnd).toBeNull();
    expect(p.complete).toBe(true);
    expect(p.error).toBeNull();
  });

  it('parses a verse range', () => {
    const p = parseMentionQuery('JHN.3.16-18');
    expect(p.verseStart).toBe(16);
    expect(p.verseEnd).toBe(18);
    expect(p.complete).toBe(true);
  });

  it('errors on an out-of-range chapter', () => {
    const p = parseMentionQuery('JHN.99.1');
    expect(p.error).toBe('No chapter 99 in John');
    expect(p.complete).toBe(false);
  });

  it('errors on an out-of-range verse', () => {
    const p = parseMentionQuery('JHN.3.999');
    expect(p.error).toBe('No verse 999 in John 3');
    expect(p.complete).toBe(false);
  });

  it('errors on an unknown book', () => {
    const p = parseMentionQuery('ZZZ');
    expect(p.error).toBe('Unknown book: ZZZ');
    expect(p.bookName).toBeNull();
  });

  it('handles partial state for 1CO.3.', () => {
    const p = parseMentionQuery('1CO.3.');
    expect(p.bookName).toBe('1 Corinthians');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBeNull();
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('treats space and colon as separators', () => {
    const p = parseMentionQuery('john 3:16');
    expect(p.bookName).toBe('John');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBe(16);
    expect(p.complete).toBe(true);
  });

  it('lets + escape spaces inside book names', () => {
    const p = parseMentionQuery('1+corinthians.3.5');
    expect(p.bookName).toBe('1 Corinthians');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBe(5);
    expect(p.complete).toBe(true);
  });

  it('parses multi-word book names typed with spaces', () => {
    const p = parseMentionQuery('1 corinthians 3:5');
    expect(p.bookName).toBe('1 Corinthians');
    expect(p.chapter).toBe(3);
    expect(p.verseStart).toBe(5);
    expect(p.complete).toBe(true);
  });

  it('keeps ambiguous prefixes unresolved without error', () => {
    const p = parseMentionQuery('ju');
    expect(p.bookName).toBeNull();
    expect(p.bookMatches).toEqual(
      expect.arrayContaining(['Judges', 'Jude'])
    );
    expect(p.error).toBeNull();
    expect(p.complete).toBe(false);
  });

  it('treats a trailing hyphen as a pending range', () => {
    const p = parseMentionQuery('JHN.3.16-');
    expect(p.verseStart).toBe(16);
    expect(p.verseEnd).toBeNull();
    expect(p.complete).toBe(false);
    expect(p.error).toBeNull();
  });

  it('rejects reversed ranges', () => {
    const p = parseMentionQuery('JHN.3.18-16');
    expect(p.error).toBe('Invalid verse range 18-16');
  });
});

describe('buildScriptureToken', () => {
  it('builds a canonical USFM token', () => {
    const p = parseMentionQuery('john 3:16-18');
    expect(buildScriptureToken(p)).toBe('@JHN.3.16-18');
  });

  it('omits the range for a single verse', () => {
    const p = parseMentionQuery('JHN.3.16');
    expect(buildScriptureToken(p)).toBe('@JHN.3.16');
  });

  it('returns null for incomplete refs', () => {
    expect(buildScriptureToken(parseMentionQuery('JHN.3')))
      .toBeNull();
    expect(buildScriptureToken(parseMentionQuery('J')))
      .toBeNull();
  });
});

describe('formatMentionPreview', () => {
  it('formats a complete ref', () => {
    expect(
      formatMentionPreview(parseMentionQuery('JHN.3.16-18'))
    ).toBe('John 3:16-18');
  });

  it('formats partial refs', () => {
    expect(
      formatMentionPreview(parseMentionQuery('JHN.3'))
    ).toBe('John 3');
    expect(formatMentionPreview(parseMentionQuery('JHN.')))
      .toBe('John');
    expect(formatMentionPreview(parseMentionQuery('j')))
      .toBe('');
  });
});

describe('isValidScriptureToken', () => {
  it('accepts complete in-range refs', () => {
    expect(isValidScriptureToken('@JHN.3.16')).toBe(true);
    expect(isValidScriptureToken('@JHN.3.16-18')).toBe(true);
    expect(isValidScriptureToken('JHN.3:16')).toBe(true);
  });

  it('rejects out-of-range and unknown refs', () => {
    expect(isValidScriptureToken('@JHN.99.1')).toBe(false);
    expect(isValidScriptureToken('@JHN.3.999')).toBe(false);
    expect(isValidScriptureToken('@ZZZ.1.1')).toBe(false);
  });

  it('rejects partial refs', () => {
    expect(isValidScriptureToken('@JHN')).toBe(false);
    expect(isValidScriptureToken('@JHN.3')).toBe(false);
  });

  it('ignores trailing punctuation after a full ref', () => {
    expect(isValidScriptureToken('@JHN.3.16.')).toBe(true);
  });
});
