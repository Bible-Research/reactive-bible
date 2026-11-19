import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import NoteDetailRoute from './NoteDetailRoute';
import { useAuthStore } from '../stores/authStore';
import {
  mockDomApis,
  resetStore,
} from '../__tests__/helpers';

/**
 * Regression coverage for issue #39: visiting a public note renders
 * inside the AppShell `overflow: hidden` main area, so the route must
 * provide its own scroll container — otherwise long notes are
 * clipped and can never be scrolled to the bottom.
 */
const NOTE_ID = 'NOTE0FEE944148CF460';
const VERSE_COUNT = 40;

const makeNote = () => ({
  id: NOTE_ID,
  note_text: '',
  public: true,
  is_owner: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  tag: {
    id: 'TAG1',
    name: 'Study',
    parent_tag: null,
    public: false,
    created_at: '',
    updated_at: '',
  },
  tag_position: null,
  headings: [],
  verses: Array.from({ length: VERSE_COUNT }, (_, i) => ({
    book: 'John',
    chapter: 3,
    verse: i + 1,
    text: `Verse ${i + 1} text.`,
  })),
});

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={[`/notes/${NOTE_ID}`]}>
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailRoute />} />
      </Routes>
    </MemoryRouter>
  );

describe('NoteDetailRoute scrolling (#39)', () => {
  beforeEach(() => {
    resetStore();
    mockDomApis();
    server.use(
      http.get(
        `${API_BASE_URL}/api/v1/notes/:noteId/`,
        ({ params }) =>
          HttpResponse.json({ ...makeNote(), id: params.noteId })
      )
    );
  });

  it('renders the note inside a scrollable container', async () => {
    renderRoute();

    // The whole passage — including the last verse — loads.
    const lastVerse = await screen.findByText(
      `Verse ${VERSE_COUNT} text.`
    );

    const viewport = document.querySelector(
      '.mantine-ScrollArea-viewport'
    );
    expect(viewport).not.toBeNull();
    // Everything the reader may need to reach is inside the
    // scrollable viewport — header, note card, and comment thread.
    expect(viewport).toContainElement(lastVerse);
    expect(viewport).toContainElement(
      screen.getByText('Study')
    );
  });
});

describe('NoteDetailRoute author attribution', () => {
  beforeEach(() => {
    resetStore();
    mockDomApis();
  });

  it('renders the author line for a note the viewer ' +
    'does not own', async () => {
      server.use(
        http.get(
          `${API_BASE_URL}/api/v1/notes/:noteId/`,
          ({ params }) =>
            HttpResponse.json({
              ...makeNote(),
              id: params.noteId,
              author: { id: 9, username: 'scholar' },
            })
        )
      );
      renderRoute();

      expect(
        await screen.findByText('by scholar')
      ).toBeInTheDocument();
    });

  it('hides the author line on the viewer\'s own note',
    async () => {
      server.use(
        http.get(
          `${API_BASE_URL}/api/v1/notes/:noteId/`,
          ({ params }) =>
            HttpResponse.json({
              ...makeNote(),
              id: params.noteId,
              is_owner: true,
              author: { id: 1, username: 'me' },
            })
        )
      );
      renderRoute();

      // Wait for the note itself before asserting absence.
      await screen.findByText(
        `Verse ${VERSE_COUNT} text.`
      );
      expect(
        screen.queryByText('by me')
      ).not.toBeInTheDocument();
    });

  it('hides the author line when author.id matches the ' +
    'viewer and is_owner is absent', async () => {
      // Payloads serialized before `is_owner` shipped (or any
      // response that omits it) fall back to matching the
      // author id against the logged-in user.
      useAuthStore.setState({
        token: 'token',
        user: { id: 9, username: 'me' },
        isAuthenticated: true,
      });
      server.use(
        http.get(
          `${API_BASE_URL}/api/v1/notes/:noteId/`,
          ({ params }) =>
            HttpResponse.json({
              ...makeNote(),
              id: params.noteId,
              is_owner: undefined,
              author: { id: 9, username: 'me' },
            })
        )
      );
      renderRoute();

      await screen.findByText(
        `Verse ${VERSE_COUNT} text.`
      );
      expect(
        screen.queryByText('by me')
      ).not.toBeInTheDocument();
    });
});

describe('NoteDetailRoute error paths', () => {
  beforeEach(() => {
    resetStore();
    mockDomApis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a friendly error when the note fetch fails ' +
    '(private or missing)', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      server.use(
        http.get(
          `${API_BASE_URL}/api/v1/notes/:noteId/`,
          () => new HttpResponse(null, { status: 404 })
        )
      );
      renderRoute();

      expect(
        await screen.findByText(
          'Note not found or is not public.'
        )
      ).toBeInTheDocument();
    });

  it('shows "No note ID provided" when the param is missing',
    async () => {
      render(
        <MemoryRouter initialEntries={['/notes']}>
          <Routes>
            <Route path="/notes" element={<NoteDetailRoute />} />
          </Routes>
        </MemoryRouter>
      );

      expect(
        await screen.findByText('No note ID provided')
      ).toBeInTheDocument();
    });
});
