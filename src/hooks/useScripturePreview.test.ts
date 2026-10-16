import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useScripturePreview from './useScripturePreview';

describe('useScripturePreview', () => {
  it('opens a preview for a valid ref', () => {
    const { result } = renderHook(() => useScripturePreview());

    act(() => result.current.togglePreview('@John.3.16'));

    expect(result.current.error).toBeNull();
    expect(result.current.preview).toEqual({
      book: 'John',
      chapter: 3,
      verses: [16],
    });
  });

  it('surfaces a parse error for an invalid ref', () => {
    const { result } = renderHook(() => useScripturePreview());

    act(() => result.current.togglePreview('not-a-ref'));

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBe(
      'Invalid scripture format'
    );
  });

  it('closes the preview when the same ref is clicked again', () => {
    const { result } = renderHook(() => useScripturePreview());

    act(() => result.current.togglePreview('@John.3.16'));
    act(() => result.current.togglePreview('@John.3.16'));

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('replaces the preview when a different ref is clicked', () => {
    const { result } = renderHook(() => useScripturePreview());

    act(() => result.current.togglePreview('@John.3.16'));
    act(() => result.current.togglePreview('@John.3.17'));

    expect(result.current.preview).toEqual({
      book: 'John',
      chapter: 3,
      verses: [17],
    });
  });

  it('clears a previous error on the next valid ref', () => {
    const { result } = renderHook(() => useScripturePreview());

    act(() => result.current.togglePreview('nope'));
    act(() => result.current.togglePreview('@John.3.16'));

    expect(result.current.error).toBeNull();
    expect(result.current.preview).not.toBeNull();
  });
});
