import { findVersesInBetween } from './findVersesInBetween';

describe('findVersesInBetween', () => {
  it('should find verses in between first verse and last verse', () => {
    expect(findVersesInBetween('1', '9')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('should return one verse if only one is available', () => {
    expect(findVersesInBetween('1', '1')).toEqual([1])
  })
})