import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useNavigate } from 'react-router-dom';
import BibleSelector from './BibleSelector';
import { renderWithProviders } from '../__tests__/helpers';
import * as api from '../api';

// Mock API functions
vi.mock('../api');

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('BibleSelector Component', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as any).mockReturnValue(mockNavigate);

    // Provide mock implementations for API calls
    vi.spyOn(api, 'getBooks').mockResolvedValue([
      { book_name: 'Genesis', book_id: 'Gen' },
      { book_name: 'Exodus', book_id: 'Exo' },
      { book_name: 'John', book_id: 'Jhn' },
    ]);
    vi.spyOn(api, 'getChapters').mockResolvedValue([1, 2, 3, 4, 5]);
    vi.spyOn(api, 'getVerses').mockResolvedValue([1, 2, 3, 4, 5]);
  });

  const noop = () => { /* noop */ };

  it('should show a loader initially', () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render books, chapters, and verses after loading', async () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);

    await waitFor(() => {
      expect(screen.getByText('Genesis')).toBeInTheDocument();
      expect(screen.getByText('Exodus')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTitle('nav-chapter-2')).toBeInTheDocument();
      expect(screen.getByTitle('nav-verse-4')).toBeInTheDocument();
    });
  });

  it('should navigate when a book is clicked', async () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);
    const bookLink = await screen.findByText('Exodus');
    await userEvent.click(bookLink);
    expect(mockNavigate).toHaveBeenCalledWith('/bible/Exodus/1');
  });

  it('should navigate when a chapter is clicked', async () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);
    const chapterLink = await screen.findByTitle('nav-chapter-3');
    await userEvent.click(chapterLink);
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/3');
  });

  it('should navigate when a verse is clicked', async () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);
    const verseLink = await screen.findByTitle('nav-verse-5');
    await userEvent.click(verseLink);
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/1');
  });
});
