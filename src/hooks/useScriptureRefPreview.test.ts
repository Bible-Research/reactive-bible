import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useScriptureRefPreview from './useScriptureRefPreview';
import type { ScriptureRefAnchor } from './useScriptureRefPreview';

// A fixed-position anchor double — tests only assert identity
// and that it flows through to `preview.anchor`.
const anchorAt = (top: number): ScriptureRefAnchor => ({
  getBoundingClientRect: () =>
    ({
      top,
      bottom: top + 20,
      left: 10,
      right: 60,
      width: 50,
      height: 20,
      x: 10,
      y: top,
      toJSON: () => ({}),
    } as DOMRect),
});

describe('useScriptureRefPreview', () => {
  it('opens on the anchor for a valid ref', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );
    const anchor = anchorAt(50);

    act(() => result.current.open('@JHN.3.16', anchor));

    expect(result.current.error).toBeNull();
    expect(result.current.preview?.anchor).toBe(anchor);
    expect(result.current.preview?.ref).toEqual({
      book: 'John',
      chapter: 3,
      verses: [16],
    });
  });

  it('toggles closed when the same ref is opened again', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );

    act(() => result.current.open('@JHN.3.16', anchorAt(50)));
    expect(result.current.preview).not.toBeNull();

    act(() => result.current.open('@JHN.3.16', anchorAt(50)));
    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('switches to a different ref on its new anchor', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );
    const first = anchorAt(50);
    const second = anchorAt(200);

    act(() => result.current.open('@JHN.3.16', first));
    act(() => result.current.open('@JHN.1.1', second));

    expect(result.current.preview?.anchor).toBe(second);
    expect(result.current.preview?.ref).toEqual({
      book: 'John',
      chapter: 1,
      verses: [1],
    });
  });

  it('surfaces a parse error inside the panel', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );
    const anchor = anchorAt(50);

    act(() => result.current.open('@ZZZ.1.1', anchor));

    // The panel stays open, anchored at the failed token.
    expect(result.current.preview).not.toBeNull();
    expect(result.current.preview?.ref).toBeNull();
    expect(result.current.preview?.anchor).toBe(anchor);
    expect(result.current.error).toBe('Unknown book: ZZZ');
  });

  it('clears a previous error when a valid ref opens', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );

    act(() => result.current.open('@ZZZ.1.1', anchorAt(50)));
    act(() => result.current.open('@JHN.3.16', anchorAt(50)));

    expect(result.current.error).toBeNull();
    expect(result.current.preview?.ref).not.toBeNull();
  });

  it('toggles closed when the same invalid token reopens', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );

    act(() => result.current.open('@ZZZ.1.1', anchorAt(50)));
    expect(result.current.error).toBe('Unknown book: ZZZ');

    act(() => result.current.open('@ZZZ.1.1', anchorAt(80)));

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('closes when another instance opens a preview', () => {
    const first = renderHook(() => useScriptureRefPreview());
    const second = renderHook(() => useScriptureRefPreview());

    act(() => first.result.current.open(
      '@JHN.3.16', anchorAt(50)
    ));
    expect(first.result.current.preview).not.toBeNull();

    act(() => second.result.current.open(
      '@JHN.1.1', anchorAt(60)
    ));

    expect(first.result.current.preview).toBeNull();
    expect(second.result.current.preview).not.toBeNull();
  });

  it('close clears both preview and error', () => {
    const { result } = renderHook(() =>
      useScriptureRefPreview()
    );

    act(() => result.current.open('@ZZZ.1.1', anchorAt(50)));
    act(() => result.current.close());

    expect(result.current.preview).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
