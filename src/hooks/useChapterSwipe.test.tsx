import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useChapterSwipe } from './useChapterSwipe';
import { useBibleStore } from '../store';
import { renderWithProviders } from '../__tests__/helpers';

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const SwipeHarness = ({ enabled = true }: { enabled?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  useChapterSwipe(ref, enabled);
  return (
    <>
      <div ref={ref} data-testid="swipe-viewport" />
      <LocationProbe />
    </>
  );
};

const firePointer = (
  el: HTMLElement,
  type: string,
  init: {
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
    button?: number;
  },
) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'touch',
    button: init.button ?? 0,
  });
  act(() => {
    el.dispatchEvent(event);
  });
};

const swipe = (
  el: HTMLElement,
  {
    fromX,
    toX,
    fromY = 100,
    toY = 110,
    pointerType = 'touch',
  }: {
    fromX: number;
    toX: number;
    fromY?: number;
    toY?: number;
    pointerType?: string;
  },
) => {
  firePointer(el, 'pointerdown', {
    clientX: fromX,
    clientY: fromY,
    pointerType,
  });
  firePointer(el, 'pointerup', {
    clientX: toX,
    clientY: toY,
    pointerType,
  });
};

const fireWheel = (
  el: HTMLElement,
  {
    deltaX,
    deltaY = 0,
    times = 1,
  }: {
    deltaX: number;
    deltaY?: number;
    times?: number;
  },
) => {
  for (let i = 0; i < times; i++) {
    const event = new Event('wheel', {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(event, { deltaX, deltaY, ctrlKey: false });
    act(() => {
      el.dispatchEvent(event);
    });
  }
};

const currentPath = () =>
  screen.getByTestId('location').textContent;

// renderWithProviders seeds JHN.1 as the active passage, so the
// adjacent chapters are LUK.24 (previous) and JHN.2 (next).
describe('useChapterSwipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the next chapter on a left swipe', () => {
    renderWithProviders(<SwipeHarness />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 300,
      toX: 100,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('navigates to the previous chapter on a right swipe', () => {
    renderWithProviders(<SwipeHarness />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 100,
      toX: 300,
    });
    expect(currentPath()).toBe('/bible/LUK.24');
  });

  it('ignores drags shorter than the swipe distance', () => {
    renderWithProviders(<SwipeHarness />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 300,
      toX: 260,
    });
    expect(currentPath()).toBe('/');
  });

  it('ignores mostly-vertical drags', () => {
    renderWithProviders(<SwipeHarness />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 300,
      toX: 200,
      fromY: 100,
      toY: 300,
    });
    expect(currentPath()).toBe('/');
  });

  it('navigates on a desktop mouse drag', () => {
    renderWithProviders(<SwipeHarness />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 300,
      toX: 100,
      pointerType: 'mouse',
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('ignores a mouse drag that selected text', () => {
    renderWithProviders(<SwipeHarness />);
    const realGetSelection = window.getSelection;
    window.getSelection = () =>
      ({ toString: () => 'selected text' }) as Selection;
    try {
      swipe(screen.getByTestId('swipe-viewport'), {
        fromX: 300,
        toX: 100,
        pointerType: 'mouse',
      });
      expect(currentPath()).toBe('/');
    } finally {
      window.getSelection = realGetSelection;
    }
  });

  it('does not capture a plain click, so the verse under ' +
    'the cursor still gets it', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    const capture = vi.fn();
    el.setPointerCapture = capture;
    swipe(el, {
      fromX: 300,
      toX: 295,
      pointerType: 'mouse',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(currentPath()).toBe('/');
  });

  it('captures once a drag passes the slop, and the swipe ' +
    'still turns the chapter', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    const capture = vi.fn();
    el.setPointerCapture = capture;
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerType: 'mouse',
    });
    firePointer(el, 'pointermove', {
      clientX: 289,
      clientY: 102,
      pointerType: 'mouse',
    });
    expect(capture).toHaveBeenCalledWith(1);
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerType: 'mouse',
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('captures a vertical mouse drag past the slop so a ' +
    'drag ending on its own verse cannot toggle it', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    const capture = vi.fn();
    el.setPointerCapture = capture;
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerType: 'mouse',
    });
    firePointer(el, 'pointermove', {
      clientX: 301,
      clientY: 115,
      pointerType: 'mouse',
    });
    expect(capture).toHaveBeenCalledWith(1);
  });

  it('ignores a drag that starts on the scrollbar so the ' +
    'thumb keeps its own pointer capture', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    // Radix tags its scrollbar — the thumb lives inside it —
    // with data-orientation.
    const scrollbar = document.createElement('div');
    scrollbar.setAttribute('data-orientation', 'vertical');
    el.appendChild(scrollbar);
    const capture = vi.fn();
    el.setPointerCapture = capture;
    firePointer(scrollbar, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerType: 'mouse',
    });
    firePointer(scrollbar, 'pointermove', {
      clientX: 200,
      clientY: 140,
      pointerType: 'mouse',
    });
    firePointer(scrollbar, 'pointerup', {
      clientX: 100,
      clientY: 160,
      pointerType: 'mouse',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(currentPath()).toBe('/');
  });

  it('does not capture a vertical touch drag — the ' +
    'browser claims it for scrolling', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    const capture = vi.fn();
    el.setPointerCapture = capture;
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
    });
    firePointer(el, 'pointermove', {
      clientX: 301,
      clientY: 115,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('lets a second pointer replace an uncaptured ' +
    'in-progress gesture', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    // Pointer 1 presses and drifts under the slop — the
    // gesture never committed to a drag.
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    firePointer(el, 'pointermove', {
      clientX: 295,
      clientY: 102,
      pointerId: 1,
    });
    // Pointer 2's press takes over; its swipe resolves.
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerId: 2,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('blocks a second pointer while a gesture is captured', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    const capture = vi.fn();
    el.setPointerCapture = capture;
    // Pointer 1 drags past the slop and captures.
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    firePointer(el, 'pointermove', {
      clientX: 290,
      clientY: 100,
      pointerId: 1,
    });
    expect(capture).toHaveBeenCalledWith(1);
    // Pointer 2's whole swipe is ignored — the captured
    // gesture owns the viewport.
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerId: 2,
    });
    expect(currentPath()).toBe('/');
    // Pointer 1 finishing its drag still turns the chapter.
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerId: 1,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('clears the gesture on pointercancel so the next ' +
    'swipe still works', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    // Pointer 1 captures, then the browser claims it.
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    firePointer(el, 'pointermove', {
      clientX: 290,
      clientY: 100,
      pointerId: 1,
    });
    firePointer(el, 'pointercancel', { pointerId: 1 });
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerId: 2,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('clears a stale gesture on window blur — a press ' +
    'released outside the window sends no pointerup', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
      pointerType: 'mouse',
    });
    firePointer(el, 'pointermove', {
      clientX: 290,
      clientY: 100,
      pointerId: 1,
      pointerType: 'mouse',
    });
    // Released over the OS chrome: the gesture ends with a
    // blur, never a pointerup.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerId: 2,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('does not resolve on a chorded non-primary mouse ' +
    'button release', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
      pointerType: 'mouse',
    });
    firePointer(el, 'pointermove', {
      clientX: 200,
      clientY: 105,
      pointerType: 'mouse',
    });
    // A right-button release mid-drag shares pointerId 1.
    firePointer(el, 'pointerup', {
      clientX: 150,
      clientY: 105,
      pointerType: 'mouse',
      button: 2,
    });
    expect(currentPath()).toBe('/');
    firePointer(el, 'pointerup', {
      clientX: 100,
      clientY: 110,
      pointerType: 'mouse',
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('resolves a swipe released outside the viewport', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    firePointer(el, 'pointerdown', {
      clientX: 300,
      clientY: 100,
    });
    firePointer(document.body, 'pointerup', {
      clientX: 100,
      clientY: 110,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('does nothing while disabled', () => {
    renderWithProviders(<SwipeHarness enabled={false} />);
    swipe(screen.getByTestId('swipe-viewport'), {
      fromX: 300,
      toX: 100,
    });
    expect(currentPath()).toBe('/');
  });

  it('sets touch-action pan-y so touch swipes survive ' +
    'browser scroll claiming', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    expect(el.style.touchAction).toBe('pan-y');
  });

  it('restores the previous touch-action on unmount', () => {
    const { unmount } = renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    unmount();
    expect(el.style.touchAction).toBe('');
  });

  it('leaves touch-action alone while disabled', () => {
    renderWithProviders(<SwipeHarness enabled={false} />);
    const el = screen.getByTestId('swipe-viewport');
    expect(el.style.touchAction).toBe('');
  });

  it('navigates to the previous chapter on a leftward ' +
    'wheel scroll', () => {
    renderWithProviders(<SwipeHarness />);
    fireWheel(screen.getByTestId('swipe-viewport'), {
      deltaX: -40,
      times: 8,
    });
    expect(currentPath()).toBe('/bible/LUK.24');
  });

  it('navigates to the next chapter on a rightward ' +
    'wheel scroll', () => {
    renderWithProviders(<SwipeHarness />);
    fireWheel(screen.getByTestId('swipe-viewport'), {
      deltaX: 40,
      times: 8,
    });
    expect(currentPath()).toBe('/bible/JHN.2');
  });

  it('ignores a weak trackpad swipe', () => {
    renderWithProviders(<SwipeHarness />);
    fireWheel(screen.getByTestId('swipe-viewport'), {
      deltaX: 20,
      times: 3,
    });
    expect(currentPath()).toBe('/');
  });

  it('ignores vertical scrolls', () => {
    renderWithProviders(<SwipeHarness />);
    fireWheel(screen.getByTestId('swipe-viewport'), {
      deltaX: 50,
      deltaY: 60,
      times: 5,
    });
    expect(currentPath()).toBe('/');
  });

  it('turns once per swipe, and again on the next', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    fireWheel(el, { deltaX: 40, times: 8 });
    expect(currentPath()).toBe('/bible/JHN.2');
    // The real app syncs the store to the new URL on landing.
    act(() => {
      useBibleStore.setState({
        activeBookId: 'JHN',
        activeChapter: 2,
      });
    });
    // The decaying inertial tail of the same gesture can't
    // turn again — deltas only shrink below the last peak.
    fireWheel(el, { deltaX: 30 });
    fireWheel(el, { deltaX: 20 });
    fireWheel(el, { deltaX: 10 });
    expect(currentPath()).toBe('/bible/JHN.2');
    // A renewed push mid-stream re-arms — this swipe counts.
    fireWheel(el, { deltaX: 35 });
    fireWheel(el, { deltaX: 40, times: 7 });
    expect(currentPath()).toBe('/bible/JHN.3');
  });

  it('re-arms when the stream settles to noise level', () => {
    renderWithProviders(<SwipeHarness />);
    const el = screen.getByTestId('swipe-viewport');
    fireWheel(el, { deltaX: 40, times: 8 });
    act(() => {
      useBibleStore.setState({
        activeBookId: 'JHN',
        activeChapter: 2,
      });
    });
    // Still-streaming deltas above the noise floor do not
    // re-arm — only a settled stream does.
    fireWheel(el, { deltaX: 10 });
    fireWheel(el, { deltaX: 2 });
    fireWheel(el, { deltaX: 40, times: 8 });
    expect(currentPath()).toBe('/bible/JHN.3');
  });

  it('resets the distance once the stream goes quiet', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<SwipeHarness />);
      const el = screen.getByTestId('swipe-viewport');
      // Sub-threshold distance that would turn a chapter if
      // it were allowed to accumulate across the quiet gap.
      fireWheel(el, { deltaX: 40, times: 5 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireWheel(el, { deltaX: 40, times: 5 });
      expect(currentPath()).toBe('/');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns again after the stream goes quiet', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<SwipeHarness />);
      const el = screen.getByTestId('swipe-viewport');
      fireWheel(el, { deltaX: 40, times: 8 });
      act(() => {
        useBibleStore.setState({
          activeBookId: 'JHN',
          activeChapter: 2,
        });
      });
      // Same gesture's tail can still not turn here — the
      // quiet gap, not a settle event, does the re-arming.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireWheel(el, { deltaX: 40, times: 8 });
      expect(currentPath()).toBe('/bible/JHN.3');
    } finally {
      vi.useRealTimers();
    }
  });
});
