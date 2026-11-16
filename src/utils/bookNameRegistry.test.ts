import { describe, it, expect, beforeEach } from 'vitest';
import {
  localizedBookName,
  toBookName,
  toUsfmCode,
} from './bibleUtils';
import {
  chaptersFor,
  isBookCovered,
  localizedName,
  resetActiveStructure,
  setActiveStructure,
  structureVersion,
} from './bookNameRegistry';
import type { BibleStructure } from '../types';
import catalogLv from '../assets/bookNames.lv.json';
import catalogRu from '../assets/bookNames.ru.json';
import catalogEn from '../assets/bookNames.en.json';

const LV = catalogLv as unknown as BibleStructure;
const RU = catalogRu as unknown as BibleStructure;
const EN = catalogEn as unknown as BibleStructure;

const partialStructure: BibleStructure = {
  books: [
    {
      book_id: 'GEN',
      name: '1. Mozus grāmata',
      name_short: '1. Mozus',
      testament: 'OT',
      chapters: [1, 2, 3],
    },
    {
      book_id: 'JHN',
      name: 'Jāņa evaņģēlijs',
      name_short: 'Jāņa',
      testament: 'NT',
      chapters: [1, 2, 3, 4, 5],
    },
  ],
};

beforeEach(() => {
  resetActiveStructure();
});

describe('bundled catalogs (task 2.2)', () => {
  it('GEN names pin the generated files', () => {
    expect(EN.books[0].book_id).toBe('GEN');
    expect(EN.books[0].name).toBe('Genesis');
    expect(LV.books[0].name).toBe('1. Mozus grāmata');
    expect(RU.books[0].name).toBe('Бытие');
    expect(EN.books).toHaveLength(66);
    expect(LV.books).toHaveLength(66);
    expect(RU.books).toHaveLength(66);
  });
});

describe('localizedBookName (display layer)', () => {
  it('falls back to English before a structure loads', () => {
    expect(localizedBookName('JHN')).toBe('John');
    expect(localizedBookName('GEN')).toBe('Genesis');
  });

  it('returns the localized name once a structure lands', () => {
    setActiveStructure(LV);
    expect(localizedBookName('GEN')).toBe('1. Mozus grāmata');
    expect(localizedBookName('JHN')).toBe('Jāņa evaņģēlijs');
  });

  it('falls back per-book when a partial structure lacks it', () => {
    setActiveStructure(partialStructure);
    expect(localizedBookName('GEN')).toBe('1. Mozus grāmata');
    expect(localizedBookName('EXO')).toBe('Exodus');
  });
});

describe('toBookName (contract identity stays English)', () => {
  it('keeps emitting English names under a localized structure', () => {
    setActiveStructure(LV);
    // Contract calls — passage= params, stored book fields,
    // external links — must never carry localized names.
    expect(toBookName('GEN')).toBe('Genesis');
    expect(toBookName('JHN')).toBe('John');
  });
});

describe('toUsfmCode additive localized matching', () => {
  it('resolves localized names under lv', () => {
    setActiveStructure(LV);
    expect(toUsfmCode('Jāņa evaņģēlijs')).toBe('JHN');
    expect(toUsfmCode('1. Mozus grāmata')).toBe('GEN');
  });

  it('resolves unique localized prefixes', () => {
    setActiveStructure(LV);
    expect(toUsfmCode('Jāņa')).toBe('JHN');
  });

  it('keeps English names and USFM codes working', () => {
    setActiveStructure(LV);
    expect(toUsfmCode('John')).toBe('JHN');
    expect(toUsfmCode('john')).toBe('JHN');
    expect(toUsfmCode('jhn')).toBe('JHN');
    expect(toUsfmCode('Genesis')).toBe('GEN');
  });

  it('folds diacritics when matching', () => {
    setActiveStructure(LV);
    expect(toUsfmCode('jana evangelijs')).toBe('JHN');
  });
});

describe('coverage queries', () => {
  it('everything covered when no structure is loaded', () => {
    expect(isBookCovered('GEN')).toBe(true);
    expect(isBookCovered('REV')).toBe(true);
  });

  it('marks uncovered books in a partial structure', () => {
    setActiveStructure(partialStructure);
    expect(isBookCovered('GEN')).toBe(true);
    expect(isBookCovered('EXO')).toBe(false);
    expect(chaptersFor('GEN')).toEqual([1, 2, 3]);
    expect(chaptersFor('EXO')).toBeNull();
    expect(localizedName('EXO')).toBeUndefined();
  });

  it('bumps structureVersion on every apply', () => {
    const v0 = structureVersion();
    setActiveStructure(LV);
    expect(structureVersion()).toBe(v0 + 1);
    setActiveStructure(EN);
    expect(structureVersion()).toBe(v0 + 2);
  });
});
