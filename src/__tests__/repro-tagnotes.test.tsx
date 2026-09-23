import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TagNotesRoute from '../routes/TagNotesRoute';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import * as api from '../api';

vi.mock('../api');
const mockApi = vi.mocked(api);

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const sel = () => useBibleStore.getState().verseSelection;

const mockTag = {
  id: 'tag-1',
  name: 'Study',
  parent_tag: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockNotes = [
  {
    id: 'note-1',
    note_text: 'A note',
    public: false,
    is_owner: true,
    tag: mockTag,
    verses: [
      { book: 'John', chapter: 3, verse: 16, text: 'For God so' },
      { book: 'John', chapter: 3, verse: 17, text: 'For God sent' },
      { book: 'John', chapter: 3, verse: 18, text: 'He that' },
    ],
    tag_position: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

describe('note-card multi verse selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      tags: [mockTag],
      notes: [],
      activeBook: 'John',
      activeBookShort: 'Joh',
      activeChapter: 1,
      verseSelection: null,
      bibleVersion: 'KJV',
      versesFolded: false,
      showNotes: false,
    });
    useAuthStore.setState({
      token: 't',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockApi.getTags.mockResolvedValue([mockTag]);
    mockApi.getNotes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: mockNotes,
    });
    mockApi.getTag.mockResolvedValue(mockTag);
    mockApi.fetchCommentCounts.mockResolvedValue({});
  });

  it('accumulates verse refs when clicking note-card verses',
    async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/notes/tag/tag-1']}>
          <Routes>
            <Route
              path="/notes/tag/:tagId"
              element={<TagNotesRoute />}
            />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('For God so')
        ).toBeInTheDocument();
      }, { timeout: 5000 });

      const v16 = screen.getByText('For God so');
      const v18 = screen.getByText('He that');

      await user.click(v16);
      await waitFor(() => {
        console.log('SEL1', JSON.stringify(sel()));
        expect(sel()?.refs).toHaveLength(1);
      });

      await user.click(v18);
      await waitFor(() => {
        console.log('SEL2', JSON.stringify(sel()));
        expect(sel()?.refs).toHaveLength(2);
      });
    });
});
