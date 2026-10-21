import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ScripturePassagePopover from './ScripturePassagePopover';
import type { ScriptureRefAnchor } from '../hooks/useScriptureRefPreview';
import type { ScriptureRef } from '../utils/scriptureRef';

const JHN316: ScriptureRef = {
  book: 'John',
  chapter: 3,
  verses: [16],
};

// happy-dom has no layout — anchors must return a stubbed,
// non-zero rect or the popover treats them as deleted and
// closes itself on mount.
const rectAt = (over: Partial<DOMRect> = {}): DOMRect =>
  ({
    top: 100,
    bottom: 120,
    left: 40,
    right: 90,
    width: 50,
    height: 20,
    x: 40,
    y: 100,
    toJSON: () => ({}),
    ...over,
  } as DOMRect);

const anchorAt = (rect: DOMRect): ScriptureRefAnchor => ({
  getBoundingClientRect: () => rect,
});

const renderPopover = (
  props: Partial<
    Parameters<typeof ScripturePassagePopover>[0]
  > = {}
) =>
  render(
    <ScripturePassagePopover
      reference={JHN316}
      anchor={anchorAt(rectAt())}
      onClose={vi.fn()}
      {...props}
    />
  );

const tap = (
  target: Element | Document,
  from: [number, number],
  to: [number, number] = from
) => {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    clientX: from[0],
    clientY: from[1],
  });
  fireEvent.pointerUp(target, {
    pointerId: 1,
    clientX: to[0],
    clientY: to[1],
  });
};

describe('ScripturePassagePopover', () => {
  it('portals a fixed panel under the anchor', async () => {
    renderPopover();
    const panel = await screen.findByTestId(
      'scripture-passage-popover'
    );
    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe('fixed');
    // top = rect.bottom + 4; left clamped to the anchor.
    expect(panel.style.top).toBe('124px');
    expect(panel.style.left).toBe('40px');
    expect(panel.style.width).toBe('400px');
    expect(panel.style.zIndex).toBe('10000');
    // ScripturePassage renders inside, unchanged.
    expect(
      await screen.findByTestId('passage-container')
    ).toBeInTheDocument();
  });

  it('flips above the anchor when there is no room below', async () => {
    // Anchor sits at the bottom edge of a 768px viewport;
    // happy-dom reports offsetHeight 0, so top alone overflows.
    renderPopover({
      anchor: anchorAt(
        rectAt({ top: 780, bottom: 800, y: 780 })
      ),
    });
    const panel = await screen.findByTestId(
      'scripture-passage-popover'
    );
    // rect.top - height(0) - 4
    expect(panel.style.top).toBe('776px');
  });

  it('goes full viewport width at the mobile breakpoint', async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      value: 500,
      writable: true,
      configurable: true,
    });
    try {
      renderPopover();
      const panel = await screen.findByTestId(
        'scripture-passage-popover'
      );
      expect(panel.style.width).toBe('500px');
      expect(panel.style.left).toBe('0px');
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });

  it('tracks the anchor on scroll', async () => {
    let rect = rectAt();
    const anchor: ScriptureRefAnchor = {
      getBoundingClientRect: () => rect,
    };
    renderPopover({ anchor });
    const panel = await screen.findByTestId(
      'scripture-passage-popover'
    );
    expect(panel.style.top).toBe('124px');

    rect = rectAt({ top: 200, bottom: 220, y: 200 });
    fireEvent.scroll(window);
    await waitFor(() =>
      expect(panel.style.top).toBe('224px')
    );
  });

  it('closes on a tap outside the panel', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    tap(document.body, [10, 10], [12, 11]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the press moved — a swipe', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    tap(document.body, [10, 10], [10, 200]);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores presses inside the panel', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    const panel = await screen.findByTestId(
      'scripture-passage-popover'
    );

    tap(panel, [50, 150]);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves taps on [data-scripture-ref] elements to the ' +
    'caller', async () => {
    const onClose = vi.fn();
    render(
      <>
        <span data-scripture-ref="">@JHN.3.16</span>
        <ScripturePassagePopover
          reference={JHN316}
          anchor={anchorAt(rectAt())}
          onClose={onClose}
        />
      </>
    );
    await screen.findByTestId('scripture-passage-popover');

    const refEl = document.querySelector(
      '[data-scripture-ref]'
    ) as Element;
    tap(refEl, [45, 110]);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('only the recorded pointer can dismiss', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    // Finger 1's press must survive finger 2's release.
    fireEvent.pointerDown(document.body, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(document.body, {
      pointerId: 2,
      clientX: 10,
      clientY: 10,
    });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerUp(document.body, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops the armed press on pointercancel', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    fireEvent.pointerDown(document.body, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent(document.body, new Event('pointercancel'));
    fireEvent.pointerUp(document.body, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores non-primary-button presses', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    // A right-click press never arms a dismissal, so its
    // release (or a later left release) cannot close.
    fireEvent.pointerDown(document.body, {
      button: 2,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(document.body, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops Escape reaching an enclosing modal', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    await screen.findByTestId('scripture-passage-popover');
    const modalHandler = vi.fn();
    // Stands in for a Mantine Modal's own Escape listener —
    // the popover's capture handler must cut it off.
    document.addEventListener('keydown', modalHandler);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    } finally {
      document.removeEventListener('keydown', modalHandler);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(modalHandler).not.toHaveBeenCalled();
  });

  it('closes itself when the anchor rect collapses', async () => {
    const onClose = vi.fn();
    const zero = rectAt({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      x: 0,
      y: 0,
    });
    renderPopover({ anchor: anchorAt(zero), onClose });

    await waitFor(() =>
      expect(onClose).toHaveBeenCalled()
    );
  });

  it('renders the parse error inside the panel', async () => {
    renderPopover({
      reference: null,
      error: 'Unknown book: ZZZ',
    });
    await screen.findByTestId('scripture-passage-popover');

    expect(
      screen.getByText('Unknown book: ZZZ')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('passage-container')
    ).toBeNull();
  });
});
