import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyNavbar from './MyNavbar';
import { useBibleStore } from '../store';
import * as api from '../api';

// Mock the API functions
vi.mock('../api', () => ({
  getBooks: vi.fn(),
  getChapters: vi.fn(),
  getVerses: vi.fn(),
}));

// Mock the Zustand store
const mockSetActiveBook = vi.fn();
const mockSetActiveChapter = vi.fn();
const mockSetActiveVerses = vi.fn();
const initialStoreState = useBibleStore.getState();

describe('MyNavbar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      activeBook: 'Genesis',
      activeChapter: 1,
      activeVerses: [],
      setActiveBook: mockSetActiveBook,
      setActiveChapter: mockSetActiveChapter,
      setActiveVerses: mockSetActiveVerses,
    });

    (api.getBooks as vi.Mock).mockReturnValue([
      { book_id: 'Gen', book_name: 'Genesis' },
      { book_id: 'Exod', book_name: 'Exodus' },
    ]);
    (api.getChapters as vi.Mock).mockReturnValue([1, 2, 3]);
    (api.getVerses as vi.Mock).mockReturnValue([1, 2, 3, 4, 5]);
  });

  it('should render books, chapters, and verses', () => {
    render(<MyNavbar opened={true} setOpened={() => {}} />);
    expect(screen.getByText('Genesis')).toBeInTheDocument();
    expect(screen.getByText('Exodus')).toBeInTheDocument();
    expect(screen.getByTitle('nav-chapter-2')).toBeInTheDocument();
    expect(screen.getByTitle('nav-verse-4')).toBeInTheDocument();
  });

  it('should call setActiveBook when a book is clicked', async () => {
    render(<MyNavbar opened={true} setOpened={() => {}} />);
    const bookLink = screen.getByText('Exodus');
    await userEvent.click(bookLink);
    expect(mockSetActiveBook).toHaveBeenCalledWith('Exodus');
  });

  it('should call setActiveChapter when a chapter is clicked', async () => {
    render(<MyNavbar opened={true} setOpened={() => {}} />);
    const chapterLink = screen.getByTitle('nav-chapter-3');
    await userEvent.click(chapterLink);
    expect(mockSetActiveChapter).toHaveBeenCalledWith(3);
  });

  it('should call setActiveVerses when a verse is clicked', async () => {
    render(<MyNavbar opened={true} setOpened={() => {}} />);
    const verseLink = screen.getByTitle('nav-verse-5');
    await userEvent.click(verseLink);
    expect(mockSetActiveVerses).toHaveBeenCalledWith([5]);
  });
});
