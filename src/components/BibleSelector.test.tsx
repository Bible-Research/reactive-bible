import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useNavigate } from 'react-router-dom';
import BibleSelector from './BibleSelector';
import { renderWithProviders } from '../__tests__/helpers';

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
  });

  const noop = () => { /* noop */ };

  it('should render books, chapters, and verses', () => {
    renderWithProviders(<BibleSelector opened={true} setOpened={noop} />);
    expect(screen.getByText('Genesis')).toBeInTheDocument();
    expect(screen.getByText('Exodus')).toBeInTheDocument();
    expect(screen.getByTitle('nav-chapter-2')).toBeInTheDocument();
    expect(screen.getByTitle('nav-verse-4')).toBeInTheDocument();
  });

  it('should navigate when a book is clicked', async () => {
    renderWithProviders(
      <BibleSelector opened={true} setOpened={noop} />
    );
    const bookLink = screen.getByText('Exodus');
    await userEvent.click(bookLink);
    // Should navigate to Exodus chapter 1
    expect(mockNavigate).toHaveBeenCalledWith('/bible/Exodus/1');
  });

  it('should navigate when a chapter is clicked', async () => {
    renderWithProviders(
      <BibleSelector opened={true} setOpened={noop} />
    );
    const chapterLink = screen.getByTitle('nav-chapter-3');
    await userEvent.click(chapterLink);
    // Should navigate to current book (John) chapter 3
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/3');
  });

  it('should navigate when a verse is clicked', async () => {
    renderWithProviders(
      <BibleSelector opened={true} setOpened={noop} />
    );
    const verseLink = screen.getByTitle('nav-verse-5');
    await userEvent.click(verseLink);
    // Verse clicking navigates to the verse URL (URL is source of truth)
    expect(mockNavigate).toHaveBeenCalledWith('/bible/John/1/5');
  });
});
