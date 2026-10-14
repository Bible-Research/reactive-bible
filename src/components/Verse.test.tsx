import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNavigate } from 'react-router-dom';
import Verse from './Verse';
import { useBibleStore, initialState } from '../store';
import type { VerseRef } from '../types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

const mockNavigate = vi.fn();
const initialStoreState = useBibleStore.getState();

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const JOHN_3_5: VerseRef = { bookId: 'JHN', chapter: 3, verse: 5 };

const renderVerse = (
  overrides: Partial<{
    book: string;
    chapter: number;
    verse: number;
    text: string;
    scope: string;
    selectable: boolean;
  }> = {}
) =>
  render(
    <Verse
      book={overrides.book ?? 'John'}
      chapter={overrides.chapter ?? 3}
      verse={overrides.verse ?? 5}
      text={overrides.text ?? 'And God called the light Day...'}
      scope={overrides.scope ?? 'bible'}
      selectable={overrides.selectable ?? true}
    />
  );

const verseContainer = (num: string) => {
  const el = screen.getByText(num).parentElement;
  if (!el) throw new Error('Verse element not found');
  return el;
};

describe('Verse Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(
      mockNavigate
    );
    useBibleStore.setState({
      ...initialStoreState,
      ...initialState,
      verseSelection: null,
      audioActiveVerse: null,
    });
  });

  it('should render the verse number and text', () => {
    renderVerse({ verse: 1, text: 'In the beginning...' });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(
      screen.getByText('In the beginning...')
    ).toBeInTheDocument();
  });

  it('should select the verse and navigate when clicked', async () => {
    renderVerse();
    await userEvent.click(verseContainer('5'));

    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'bible',
      refs: [JOHN_3_5],
    });
    expect(mockNavigate).toHaveBeenCalledWith('/bible/JHN.3.5', {
      replace: true,
    });
  });

  it('should deselect an active verse when clicked', async () => {
    useBibleStore.setState({
      verseSelection: { scope: 'bible', refs: [JOHN_3_5] },
    });
    renderVerse();
    await userEvent.click(verseContainer('5'));

    expect(useBibleStore.getState().verseSelection).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/bible/JHN.3', {
      replace: true,
    });
  });

  it('should have the active class and scroll into view', () => {
    useBibleStore.setState({
      verseSelection: {
        scope: 'bible',
        refs: [{ bookId: 'JHN', chapter: 3, verse: 10 }],
      },
    });
    renderVerse({ verse: 10 });

    expect(verseContainer('10')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(
      window.HTMLElement.prototype.scrollIntoView
    ).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'smooth',
    });
  });

  it('should scroll once — to the first selected verse — when ' +
    'a multi-verse selection mounts', () => {
    useBibleStore.setState({
      verseSelection: {
        scope: 'bible',
        refs: [16, 17, 18].map((verse) => ({
          bookId: 'JHN',
          chapter: 3,
          verse,
        })),
      },
    });
    render(
      <>
        {[16, 17, 18].map((verse) => (
          <Verse
            key={verse}
            scope="bible"
            book="John"
            chapter={3}
            verse={verse}
            text={`Verse ${verse}`}
          />
        ))}
      </>
    );

    // All three verses are active, but only verse 16 (the
    // minimum) may scroll — otherwise the view settles on the
    // last selected verse.
    expect(
      window.HTMLElement.prototype.scrollIntoView
    ).toHaveBeenCalledTimes(1);
  });

  it('should not be active when the selection is another scope', () => {
    useBibleStore.setState({
      verseSelection: { scope: 'note-9', refs: [JOHN_3_5] },
    });
    renderVerse();
    expect(verseContainer('5')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('should be active in a note scope without navigating', async () => {
    renderVerse({ scope: 'note-42' });
    await userEvent.click(verseContainer('5'));

    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-42',
      refs: [JOHN_3_5],
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should move the whole selection when scope changes', async () => {
    useBibleStore.setState({
      verseSelection: { scope: 'bible', refs: [JOHN_3_5] },
    });
    renderVerse({ scope: 'note-7', verse: 2 });
    await userEvent.click(verseContainer('2'));

    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-7',
      refs: [{ bookId: 'JHN', chapter: 3, verse: 2 }],
    });
  });

  it('should range-select with shift+click inside one scope', async () => {
    render(
      <>
        <Verse
          scope="note-1"
          book="John"
          chapter={3}
          verse={16}
          text="For God so loved"
        />
        <Verse
          scope="note-1"
          book="John"
          chapter={3}
          verse={18}
          text="He that believeth"
        />
      </>
    );
    const user = userEvent.setup();
    await user.click(verseContainer('16'));
    fireEvent.click(verseContainer('18'), { shiftKey: true });

    expect(useBibleStore.getState().verseSelection).toEqual({
      scope: 'note-1',
      refs: [
        { bookId: 'JHN', chapter: 3, verse: 16 },
        { bookId: 'JHN', chapter: 3, verse: 17 },
        { bookId: 'JHN', chapter: 3, verse: 18 },
      ],
    });
  });

  it('should not highlight audio when the scope differs', () => {
    useBibleStore.setState({
      audioActiveVerse: { ...JOHN_3_5, scope: 'note-1' },
    });
    renderVerse();
    expect(verseContainer('5')).toHaveAttribute(
      'data-audio-active',
      'false'
    );
  });

  it('should highlight audio only in the matching scope', () => {
    useBibleStore.setState({
      audioActiveVerse: { ...JOHN_3_5, scope: 'note-1' },
    });
    render(
      <>
        <Verse
          scope="note-1"
          book="John"
          chapter={3}
          verse={5}
          text="Card one"
        />
        <Verse
          scope="note-2"
          book="John"
          chapter={3}
          verse={5}
          text="Card two"
        />
      </>
    );
    const cardOne = screen.getByText('Card one').parentElement;
    const cardTwo = screen.getByText('Card two').parentElement;
    expect(cardOne).toHaveAttribute('data-audio-active', 'true');
    expect(cardTwo).toHaveAttribute('data-audio-active', 'false');
  });

  it('should not double-toggle when a tap fires touch + click',
    () => {
      vi.useFakeTimers();
      try {
        renderVerse();
        const el = verseContainer('5');
        const touch = { clientX: 10, clientY: 10 };
        const dispatchTouch = (type: string) => {
          const evt = new Event(type, { bubbles: true });
          Object.assign(evt, {
            touches: [touch],
            changedTouches: [touch],
          });
          el.dispatchEvent(evt);
        };

        act(() => {
          dispatchTouch('touchstart');
          dispatchTouch('touchend');
        });
        // Synthetic click the browser fires after a tap
        fireEvent.click(el);
        act(() => {
          vi.advanceTimersByTime(100);
        });

        expect(useBibleStore.getState().verseSelection).toEqual({
          scope: 'bible',
          refs: [JOHN_3_5],
        });
      } finally {
        vi.useRealTimers();
      }
    });

  it('should dismiss an existing text selection on tap', () => {
    vi.useFakeTimers();
    const removeAllRanges = vi.fn();
    const selection = {
      toString: () => 'For God so loved',
      removeAllRanges,
    } as unknown as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);
    try {
      renderVerse();
      const el = verseContainer('5');
      const touch = { clientX: 10, clientY: 10 };
      const dispatchTouch = (type: string) => {
        const evt = new Event(type, { bubbles: true });
        Object.assign(evt, {
          touches: [touch],
          changedTouches: [touch],
        });
        el.dispatchEvent(evt);
      };

      act(() => {
        dispatchTouch('touchstart');
        dispatchTouch('touchend');
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(removeAllRanges).toHaveBeenCalled();
      expect(useBibleStore.getState().verseSelection).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('should keep a text selection created during the touch',
    () => {
      vi.useFakeTimers();
      const removeAllRanges = vi.fn();
      let selectedText = '';
      const selection = {
        toString: () => selectedText,
        removeAllRanges,
      } as unknown as Selection;
      vi.spyOn(window, 'getSelection').mockReturnValue(selection);
      try {
        renderVerse();
        const el = verseContainer('5');
        const touch = { clientX: 10, clientY: 10 };
        const dispatchTouch = (type: string) => {
          const evt = new Event(type, { bubbles: true });
          Object.assign(evt, {
            touches: [touch],
            changedTouches: [touch],
          });
          el.dispatchEvent(evt);
        };

        act(() => {
          dispatchTouch('touchstart');
          // Long-press creates a selection during the touch
          selectedText = 'For God so loved';
          dispatchTouch('touchend');
        });
        act(() => {
          vi.advanceTimersByTime(100);
        });

        expect(removeAllRanges).not.toHaveBeenCalled();
        expect(useBibleStore.getState().verseSelection).toBeNull();
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    });

  it('should not toggle when the touch moves more than 10px',
    () => {
      renderVerse();
      const el = verseContainer('5');
      const dispatchTouch = (
        type: string,
        touch: { clientX: number; clientY: number }
      ) => {
        const evt = new Event(type, { bubbles: true });
        Object.assign(evt, {
          touches: [touch],
          changedTouches: [touch],
        });
        el.dispatchEvent(evt);
      };

      act(() => {
        dispatchTouch('touchstart', { clientX: 10, clientY: 10 });
        // 20px vertical movement — a scroll, not a tap
        dispatchTouch('touchend', { clientX: 10, clientY: 30 });
      });

      // The scroll must not select the verse…
      expect(useBibleStore.getState().verseSelection).toBeNull();
      expect(el).toHaveAttribute('data-active', 'false');
      expect(mockNavigate).not.toHaveBeenCalled();

      // …and must not poison tap dedup: a real click right
      // after the scroll still toggles normally.
      fireEvent.click(el);
      expect(useBibleStore.getState().verseSelection).toEqual({
        scope: 'bible',
        refs: [JOHN_3_5],
      });
    });

  it('should ignore clicks and taps when selectable is false',
    async () => {
      renderVerse({ selectable: false });
      const el = verseContainer('5');

      await userEvent.click(el);
      expect(useBibleStore.getState().verseSelection).toBeNull();
      expect(mockNavigate).not.toHaveBeenCalled();

      // The touch path short-circuits in handleTouchClick too.
      const touch = { clientX: 10, clientY: 10 };
      const dispatchTouch = (type: string) => {
        const evt = new Event(type, { bubbles: true });
        Object.assign(evt, {
          touches: [touch],
          changedTouches: [touch],
        });
        el.dispatchEvent(evt);
      };
      act(() => {
        dispatchTouch('touchstart');
        dispatchTouch('touchend');
      });
      // The 50ms selection-check timer must not toggle either.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(useBibleStore.getState().verseSelection).toBeNull();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

  it('should prevent default on shift+mousedown to block ' +
    'text selection', () => {
      renderVerse();
      const el = verseContainer('5');

      const shiftDown = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      });
      el.dispatchEvent(shiftDown);
      expect(shiftDown.defaultPrevented).toBe(true);

      const plainDown = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(plainDown);
      expect(plainDown.defaultPrevented).toBe(false);
    });

  it('should not have the active class when not active', () => {
    renderVerse({ verse: 1 });
    expect(verseContainer('1')).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});
