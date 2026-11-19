import { describe, it, expect } from 'vitest';
import { pageCount, pageNumberList } from './pagination';

describe('pageCount', () => {
  it('rounds up partial pages', () => {
    expect(pageCount(60, 25)).toBe(3);
    expect(pageCount(61, 25)).toBe(3);
    expect(pageCount(26, 25)).toBe(2);
  });

  it('handles exact and empty totals', () => {
    expect(pageCount(50, 25)).toBe(2);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(0, 25)).toBe(0);
  });
});

describe('pageNumberList', () => {
  it('lists every page when there are five or fewer', () => {
    expect(pageNumberList(1, 1)).toEqual([1]);
    expect(pageNumberList(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('bookends a middle page with both ellipses', () => {
    expect(pageNumberList(5, 10))
      .toEqual([1, 'ellipsis', 5, 'ellipsis', 10]);
    expect(pageNumberList(3, 10))
      .toEqual([1, 'ellipsis', 3, 'ellipsis', 10]);
    expect(pageNumberList(4, 6))
      .toEqual([1, 'ellipsis', 4, 'ellipsis', 6]);
  });

  it('merges the current page into the first page near ' +
    'the start', () => {
      expect(pageNumberList(1, 10))
        .toEqual([1, 'ellipsis', 10]);
      expect(pageNumberList(2, 10))
        .toEqual([1, 2, 'ellipsis', 10]);
    });

  it('merges the current page into the last page near ' +
    'the end', () => {
      expect(pageNumberList(9, 10))
        .toEqual([1, 'ellipsis', 9, 10]);
      expect(pageNumberList(10, 10))
        .toEqual([1, 'ellipsis', 10]);
    });
});
