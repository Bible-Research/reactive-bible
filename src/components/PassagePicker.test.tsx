import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PassagePicker from './PassagePicker';
import { renderWithProviders } from '../__tests__/helpers';

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
});
