import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useNoteRefFilesetId } from './useNoteRefFilesetId';
import { useBibleStore, initialState } from '../store';

describe('useNoteRefFilesetId', () => {
  beforeEach(() => {
    useBibleStore.setState(initialState);
  });

  it('follows the selected translation when no pin is set',
    () => {
      useBibleStore.setState({
        activeTextFilesetId: 'LVSGLU8',
        noteRefFilesetId: null,
      });
      const { result } = renderHook(() => useNoteRefFilesetId());
      expect(result.current).toBe('LVSGLU8');
    });

  it('returns the pinned override when set', () => {
    useBibleStore.setState({
      activeTextFilesetId: 'LVSGLU8',
      noteRefFilesetId: 'ENGNIV:text:0',
    });
    const { result } = renderHook(() => useNoteRefFilesetId());
    expect(result.current).toBe('ENGNIV:text:0');
  });
});
