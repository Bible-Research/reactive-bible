import { findVersesInBetween } from './findVersesInBetween';

describe('findVersesInBetween', () => {
  it('should find verses in between first verse and last verse', () => {
    expect(findVersesInBetween('1', '9')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('should return one verse if only one is available', () => {
    expect(findVersesInBetween('1', '1')).toEqual([1])
  })

  it('should return an empty array when start exceeds end', () => {
    expect(findVersesInBetween('18', '16')).toEqual([])
    expect(findVersesInBetween('5', '1')).toEqual([])
  })

  it('should return an empty array for non-numeric input', () => {
    // Number('abc') is NaN — the <= loop condition is never
    // true, so nothing is collected.
    expect(findVersesInBetween('abc', 'def')).toEqual([])
    expect(findVersesInBetween('abc', '5')).toEqual([])
    expect(findVersesInBetween('1', 'x')).toEqual([])
  })
})