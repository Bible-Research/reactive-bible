import { describe, it, expect } from 'vitest';
import { defaultTagId } from './defaultTag';
import { createMockTag } from '../__tests__/helpers/factories';

describe('defaultTagId', () => {
  const faith = createMockTag({ id: '1', name: 'Faith' });
  const hope = createMockTag({ id: '2', name: 'Hope' });

  it('returns null for zero tags — the empty state, not a ' +
    'spinner', () => {
    expect(defaultTagId([], '1')).toBeNull();
    expect(defaultTagId([], null)).toBeNull();
  });

  it('prefers the last-viewed tag when it still exists', () => {
    expect(defaultTagId([hope, faith], '1')).toBe('1');
  });

  it('falls back to the alphabetically first tag', () => {
    // Faith < Hope alphabetically regardless of array order.
    expect(defaultTagId([hope, faith], null)).toBe('1');
    expect(defaultTagId([hope, faith], 'gone')).toBe('1');
  });
});
