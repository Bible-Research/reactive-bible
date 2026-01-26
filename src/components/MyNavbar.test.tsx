import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import MyNavbar from './MyNavbar';
import { renderWithProviders } from '../__tests__/helpers';

describe('MyNavbar Component', () => {
  it('should render books, chapters, and verses', () => {
    renderWithProviders(<MyNavbar opened={true} setOpened={() => {}} />);
    expect(screen.getByText('Genesis')).toBeInTheDocument();
    expect(screen.getByText('Exodus')).toBeInTheDocument();
    expect(screen.getByTitle('nav-chapter-2')).toBeInTheDocument();
    expect(screen.getByTitle('nav-verse-4')).toBeInTheDocument();
  });

  it('should call setActiveBook when a book is clicked', async () => {
    const { mockStore } = renderWithProviders(
      <MyNavbar opened={true} setOpened={() => {}} />
    );
    const bookLink = screen.getByText('Exodus');
    await userEvent.click(bookLink);
    expect(mockStore.setActiveBook).toHaveBeenCalledWith('Exodus');
  });

  it('should call setActiveChapter when a chapter is clicked', async () => {
    const { mockStore } = renderWithProviders(
      <MyNavbar opened={true} setOpened={() => {}} />
    );
    const chapterLink = screen.getByTitle('nav-chapter-3');
    await userEvent.click(chapterLink);
    expect(mockStore.setActiveChapter).toHaveBeenCalledWith(3);
  });

  it('should call setActiveVerses when a verse is clicked', async () => {
    const { mockStore } = renderWithProviders(
      <MyNavbar opened={true} setOpened={() => {}} />
    );
    const verseLink = screen.getByTitle('nav-verse-5');
    await userEvent.click(verseLink);
    expect(mockStore.setActiveVerses).toHaveBeenCalledWith([5]);
  });
});
