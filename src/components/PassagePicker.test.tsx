import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PassagePicker from './PassagePicker';
import { renderWithProviders } from '../__tests__/helpers';
import { setActiveStructure } from '../utils/bookNameRegistry';
import { showNotification } from '@mantine/notifications';
import type { BibleStructure } from '../types';
import catalogLv from '../assets/bookNames.lv.json';

const LV = catalogLv as unknown as BibleStructure;

vi.mock('@mantine/notifications', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showNotification: vi.fn(),
}));


const renderPicker = (
  overrides: Partial<
    React.ComponentProps<typeof PassagePicker>
  > = {}
) => {
  const props = {
    bookId: 'JHN' as string | null,
    chapter: 3 as number | null,
    verses: [16],
    titlePrefix: 'mention-',
    onSelectBook: vi.fn(),
    onSelectChapter: vi.fn(),
    onSelectVerse: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<PassagePicker {...props} />);
  return props;
};

describe('PassagePicker', () => {
  it('renders books, chapters, and verses columns', () => {
    renderPicker();
    expect(screen.getByTitle('mention-book-GEN'))
      .toBeInTheDocument();
    expect(screen.getByTitle('mention-book-JHN'))
      .toBeInTheDocument();
    expect(screen.getByTitle('mention-chapter-3'))
      .toBeInTheDocument();
    expect(screen.getByTitle('mention-verse-16'))
      .toBeInTheDocument();
  });

  it('calls onSelectBook with the USFM book code', async () => {
    const props = renderPicker();
    await userEvent.click(
      screen.getByTitle('mention-book-GEN')
    );
    expect(props.onSelectBook).toHaveBeenCalledWith('GEN');
  });

  it('calls onSelectChapter with the chapter', async () => {
    const props = renderPicker();
    await userEvent.click(
      screen.getByTitle('mention-chapter-5')
    );
    expect(props.onSelectChapter).toHaveBeenCalledWith(5);
  });

  it('calls onSelectVerse; shift+click extends range', async () => {
    const props = renderPicker();
    await userEvent.click(
      screen.getByTitle('mention-verse-16')
    );
    expect(props.onSelectVerse).toHaveBeenCalledWith(16, false);

    const user = userEvent.setup();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTitle('mention-verse-20'));
    await user.keyboard('{/Shift}');
    expect(props.onSelectVerse).toHaveBeenCalledWith(20, true);
  });

  it('scrolls the active book into view', () => {
    renderPicker({ bookId: 'COL' });
    // scrollIntoView is mocked by renderWithProviders
    expect(
      window.HTMLElement.prototype.scrollIntoView
    ).toHaveBeenCalled();
    const active = document.querySelector(
      '[data-active="true"][title="mention-book-COL"]'
    );
    expect(active).toBeTruthy();
  });

  it('restricts the book column via bookFilter', () => {
    renderPicker({ bookFilter: ['John', 'Jude'] });
    expect(screen.getByTitle('mention-book-JHN'))
      .toBeInTheDocument();
    expect(screen.getByTitle('mention-book-JUD'))
      .toBeInTheDocument();
    expect(screen.queryByTitle('mention-book-GEN'))
      .not.toBeInTheDocument();
  });

  it('renders empty chapter/verse columns without a book', () => {
    renderPicker({ bookId: null, chapter: null, verses: [] });
    expect(screen.getByTitle('mention-book-GEN'))
      .toBeInTheDocument();
    expect(screen.queryByTitle('mention-chapter-1'))
      .not.toBeInTheDocument();
    expect(screen.queryByTitle('mention-verse-1'))
      .not.toBeInTheDocument();
  });

describe('structure coverage (task 3.2)', () => {
  const partial: BibleStructure = {
    books: [
      {
        book_id: 'GEN',
        name: '1. Mozus grāmata',
        name_short: '1. Mozus',
        testament: 'OT',
        chapters: [1, 2, 3],
      },
      {
        book_id: 'JHN',
        name: 'Jāņa evaņģēlijs',
        name_short: 'Jāņa',
        testament: 'NT',
        chapters: [1, 2],
      },
    ],
  };

  /**
   * Stage a partial-canon structure. `loadStructure` is
   * mocked out so the store-change subscription cannot kick
   * an SWR fetch that would overwrite the staged registry.
   */
  const stagePartial = () => {
    setActiveStructure(partial);
    return {
      activeTextFilesetId: 'LAVNLI',
      translations: [
        {
          abbr: 'LAVNLI',
          name: 'Jaunā Latviešu Bībele',
          language: 'Latvian',
          language_iso: 'lvs',
          filesets: [
            {
              id: 'LAVNLI',
              type: 'text_plain' as const,
              size: 'C',
              codec: null,
              bitrate: null,
            },
          ],
        },
      ],
      structureByBible: { LAVNLI: partial },
      activeStructureKey: 'LAVNLI',
      loadStructure: vi.fn(),
    };
  };

  it('renders localized names + dims uncovered books', () => {
    const overrides = stagePartial();
    renderWithProviders(<PassagePicker {...{
      bookId: 'JHN', chapter: 3, verses: [16],
      titlePrefix: 'mention-', onSelectBook: vi.fn(),
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    const gen = screen.getByTitle('mention-book-GEN');
    const exo = screen.getByTitle('mention-book-EXO');
    expect(gen).toHaveTextContent('1. Mozus grāmata');
    expect(gen).not.toHaveStyle({ opacity: '0.4' });
    // Uncovered book stays a clickable button — only dimmed.
    expect(exo).not.toBeDisabled();
  });

  it('click on uncovered book notifies, never navigates', async () => {
    const overrides = stagePartial();
    const onSelectBook = vi.fn();
    renderWithProviders(<PassagePicker {...{
      bookId: 'JHN', chapter: 3, verses: [16],
      titlePrefix: 'mention-', onSelectBook,
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    await userEvent.click(
      screen.getByTitle('mention-book-EXO')
    );
    expect(onSelectBook).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "doesn't include"
        ),
      })
    );
  });

  it('click on covered book still navigates', async () => {
    const overrides = stagePartial();
    const onSelectBook = vi.fn();
    renderWithProviders(<PassagePicker {...{
      bookId: 'JHN', chapter: 3, verses: [16],
      titlePrefix: 'mention-', onSelectBook,
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    await userEvent.click(
      screen.getByTitle('mention-book-JHN')
    );
    expect(onSelectBook).toHaveBeenCalledWith('JHN');
  });

  it('limits chapters to the structure coverage', () => {
    const overrides = stagePartial();
    renderWithProviders(<PassagePicker {...{
      bookId: 'GEN', chapter: 3, verses: [16],
      titlePrefix: 'mention-', onSelectBook: vi.fn(),
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    expect(screen.getByTitle('mention-chapter-3'))
      .toBeInTheDocument();
    expect(screen.queryByTitle('mention-chapter-4'))
      .not.toBeInTheDocument();
  });

  it('shows same-language names for uncovered books', () => {
    const overrides = stagePartial();
    // Same-language fallback catalog: uncovered entries
    // display Latvian names, not English.
    setActiveStructure(partial, LV);
    renderWithProviders(<PassagePicker {...{
      bookId: 'JHN', chapter: 3, verses: [16],
      titlePrefix: 'nav-', onSelectBook: vi.fn(),
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    expect(screen.getByTitle('nav-book-EXO'))
      .toHaveTextContent('2. Mozus grāmata');
  });

  it('keeps the previous coverage while the switched-to ' +
    'structure is in flight', () => {
      // activeStructureKey already flipped to a bible whose
      // structure hasn't landed — `structure` is null but
      // the registry still holds the previous coverage, so
      // uncovered books stay dimmed instead of flashing
      // all-covered.
      setActiveStructure(partial);
      renderWithProviders(<PassagePicker {...{
        bookId: 'GEN', chapter: 2, verses: [],
        titlePrefix: 'nav-', onSelectBook: vi.fn(),
        onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
      }} />, { stores: { bible: {
        activeTextFilesetId: 'DEUBIB',
        translations: [],
        structureByBible: {},
        activeStructureKey: 'DEUBIB',
        loadStructure: vi.fn(),
      }}});
      // Names still come from the previous structure…
      expect(screen.getByTitle('nav-book-GEN'))
        .toHaveTextContent('1. Mozus grāmata');
      // …and so does coverage: EXO stays uncovered (no
      // data-covered attr) and GEN keeps its [1,2,3]
      // chapter list — no canon flash.
      expect(screen.getByTitle('nav-book-EXO'))
        .not.toHaveAttribute('data-covered');
      expect(screen.getByTitle('nav-book-GEN'))
        .toHaveAttribute('data-covered');
      expect(screen.getByTitle('nav-chapter-3'))
        .toBeInTheDocument();
      expect(screen.queryByTitle('nav-chapter-4'))
        .not.toBeInTheDocument();
    });

  it('lets citation pickers select uncovered books', async () => {
    const overrides = stagePartial();
    const onSelectBook = vi.fn();
    renderWithProviders(<PassagePicker {...{
      bookId: 'GEN', chapter: 1, verses: [],
      titlePrefix: 'mention-', restrictToCoverage: false,
      onSelectBook,
      onSelectChapter: vi.fn(), onSelectVerse: vi.fn(),
    }} />, { stores: { bible: overrides } });
    await userEvent.click(
      screen.getByTitle('mention-book-EXO')
    );
    expect(onSelectBook).toHaveBeenCalledWith('EXO');
    expect(showNotification).not.toHaveBeenCalled();
    // Chapter column shows the bundled canon for citation,
    // not the structure's coverage.
    expect(screen.getByTitle('mention-chapter-50'))
      .toBeInTheDocument();
  });
});
});
