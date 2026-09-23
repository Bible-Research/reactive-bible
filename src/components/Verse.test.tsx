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

const JOHN_3_5: VerseRef = { book: 'John', chapter: 3, verse: 5 };

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
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/3.5', {
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
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/3', {
      replace: true,
    });
  });

  it('should have the active class and scroll into view', () => {
    useBibleStore.setState({
      verseSelection: {
        scope: 'bible',
        refs: [{ book: 'John', chapter: 3, verse: 10 }],
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
      refs: [{ book: 'John', chapter: 3, verse: 2 }],
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
        { book: 'John', chapter: 3, verse: 16 },
        { book: 'John', chapter: 3, verse: 17 },
        { book: 'John', chapter: 3, verse: 18 },
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

  it('should not have the active class when not active', () => {
    renderVerse({ verse: 1 });
    expect(verseContainer('1')).toHaveAttribute(
      'data-active',
      'false'
    );
  });
});
