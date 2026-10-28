import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NoteVerseList from './NoteVerseList';
import {
  renderWithProviders,
  createMockNote,
  createMockVerse,
} from '../__tests__/helpers';

describe('NoteVerseList', () => {
  it('renders each verse with its text', () => {
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1,
          text: 'In the beginning was the Word',
        }),
        createMockVerse({
          book: 'John', chapter: 1, verse: 2,
          text: 'He was with God',
        }),
      ],
    });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded={false} />
    );

    expect(
      screen.getByText(/In the beginning was the Word/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/He was with God/)
    ).toBeInTheDocument();
  });

  it('renders a section heading before its verse', () => {
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1, text: 'v1',
        }),
        createMockVerse({
          book: 'John', chapter: 1, verse: 2, text: 'v2',
        }),
      ],
      headings: [{ before_verse: 2, text: 'The Word' }],
    });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded={false} />
    );

    expect(screen.getByText('The Word')).toBeInTheDocument();
  });

  it('scopes headings to the first chapter of the note', () => {
    // before_verse keying fix: verse 2 exists in both
    // chapters — the heading belongs to chapter 1 (the
    // backend only fetches headings for verses[0].chapter)
    // and must not render again before chapter 2's verse 2.
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 2, text: 'c1v2',
        }),
        createMockVerse({
          book: 'John', chapter: 2, verse: 2, text: 'c2v2',
        }),
      ],
      headings: [{ before_verse: 2, text: 'First chapter' }],
    });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded={false} />
    );

    expect(
      screen.getAllByText('First chapter')
    ).toHaveLength(1);
  });

  it('renders the provider error instead of verses', () => {
    const note = createMockNote({
      error: 'Bible provider rate limit exceeded (HTTP 429)',
      error_code: 'rate_limited',
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1, text: '',
        }),
      ],
    });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded={false} />
    );

    expect(
      screen.getByText(/rate limit exceeded/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reloading in a few moments/i)
    ).toBeInTheDocument();
  });

  it('renders only the first verse when folded', () => {
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1, text: 'first',
        }),
        createMockVerse({
          book: 'John', chapter: 1, verse: 2, text: 'second',
        }),
      ],
    });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded />
    );

    expect(
      screen.getByTitle('passage-verse-1-1')
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle('passage-verse-1-2')
    ).not.toBeInTheDocument();
  });

  it('keeps folded verse text on one line inside a ' +
    'horizontally scrollable row', () => {
    // Mobile regression: the unbreakable nowrap line must be
    // scrollable within the verse row, and the scope
    // container must not report that width to the
    // shrink-to-fit ScrollArea wrapper (which otherwise
    // widens the whole page past the device width).
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1,
          text: 'A very long verse that will not fit on ' +
            'one line of a narrow screen and would ' +
            'normally have to wrap',
        }),
      ],
    });

    const { container } = renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded />
    );

    const verseText = screen.getByTitle('passage-verse-1-1');
    const textStyle = getComputedStyle(verseText);
    expect(textStyle.whiteSpace).toBe('nowrap');
    expect(textStyle.overflowX).toBe('auto');

    const scopeBox = container.querySelector(
      '[data-verse-scope="n1"]'
    );
    const scopeStyle = getComputedStyle(
      scopeBox as HTMLElement
    );
    expect(scopeStyle.display).toBe('grid');
    expect(scopeStyle.gridTemplateColumns).toContain(
      'minmax(0'
    );
  });

  it('shows the copyright notice past 500 verses', () => {
    const verses = Array.from({ length: 501 }, (_, i) =>
      createMockVerse({
        book: 'John',
        chapter: 1,
        verse: i + 1,
        text: i < 500 ? `Verse ${i + 1} text` : '',
      })
    );
    const note = createMockNote({ verses });

    renderWithProviders(
      <NoteVerseList note={note} scope="n1" folded={false} />
    );

    expect(
      screen.getByText(/cannot display more than 500 verses/i)
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('passage-verse-1-500')
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle('passage-verse-1-501')
    ).not.toBeInTheDocument();
  });

  it('tags the container with the verse scope', () => {
    const note = createMockNote({
      verses: [
        createMockVerse({
          book: 'John', chapter: 1, verse: 1, text: 'v',
        }),
      ],
    });

    const { container } = renderWithProviders(
      <NoteVerseList
        note={note}
        scope="n1__overlay"
        folded={false}
      />
    );

    expect(
      container.querySelector('[data-verse-scope="n1__overlay"]')
    ).toBeInTheDocument();
  });
});
