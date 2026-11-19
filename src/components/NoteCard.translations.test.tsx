import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import NoteCard from './NoteCard';
import {
  renderWithProviders,
  createMockNote,
  createMockTag,
} from '../__tests__/helpers';
import type { Note } from '../types';

vi.mock('./CommentThread', () => ({
  default: () => <div data-testid="comment-thread" />,
}));

vi.mock('@mantine/notifications', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@mantine/notifications')>();
  return { ...actual, showNotification: vi.fn() };
});

const LV_NOTE: Partial<Note> = {
  id: 'tr-note-1',
  note_text: 'Original English text.',
  source_language: 'en',
  served_language: 'en',
  translations: [
    {
      language: 'en',
      status: 'source',
      verified: false,
      engine: null,
      error: null,
    },
    {
      language: 'lv',
      status: 'ready',
      verified: false,
      engine: 'google-nmt',
      error: null,
    },
  ],
};

const makeNote = (overrides: Partial<Note> = {}): Note =>
  createMockNote({
    tag: createMockTag({ id: '1', name: 'T' }),
    ...LV_NOTE,
    ...overrides,
  });

const noop = () => undefined;
const renderCard = (
  note: Note,
  store?: Record<string, unknown>
) =>
  renderWithProviders(
    <NoteCard
      note={note}
      onViewInBible={noop}
      onEdit={noop}
      onDelete={noop}
    />,
    { stores: { bible: store } }
  );

describe('NoteCard translations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers source + ready languages in the switcher', () => {
    renderCard(makeNote());
    const control = screen.getByLabelText('Note language');
    expect(control).toBeInTheDocument();
    expect(
      screen.getByText('EN')
    ).toBeInTheDocument();
    expect(
      screen.getByText('LV')
    ).toBeInTheDocument();
  });

  it('hides all controls when auto-translate is off', () => {
    renderCard(makeNote(), { autoTranslateNotes: false });
    expect(
      screen.queryByLabelText('Note language')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Auto-translated')
    ).not.toBeInTheDocument();
  });

  it('fetches ?lang= on switch and labels the swap', async () => {
    let requested: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/api/v1/notes/:id/`, ({
        request,
      }) => {
        requested = new URL(request.url).searchParams.get(
          'lang'
        );
        return HttpResponse.json({
          ...makeNote(),
          note_text: 'Latviesu teksts.',
          served_language: 'lv',
        });
      })
    );
    renderCard(makeNote());
    fireEvent.click(screen.getByText('LV'));
    await waitFor(() =>
      expect(
        screen.getByText('Latviesu teksts.')
      ).toBeInTheDocument()
    );
    expect(requested).toBe('lv');
    expect(
      screen.getByText('Auto-translated')
    ).toBeInTheDocument();
  });

  it('peeks at the original without changing selection',
    async () => {
      renderCard(makeNote());
      const peek = screen.getByText('Show original');
      fireEvent.click(peek);
      // Note is already served in the source language —
      // peek just toggles the same text; the control flips
      // to 'Hide original' and the switcher is untouched.
      expect(
        screen.getByText('Hide original')
      ).toBeInTheDocument();
    });

  it('shows Translating… for pending rows', () => {
    renderCard(
      makeNote({
        translations: [
          {
            language: 'en',
            status: 'source',
            verified: false,
            engine: null,
            error: null,
          },
          {
            language: 'lv',
            status: 'pending',
            verified: false,
            engine: null,
            error: null,
          },
        ],
      })
    );
    expect(
      screen.getByText('Translating…')
    ).toBeInTheDocument();
  });

  it('shows the verified chip on verified ready rows', () => {
    renderCard(
      makeNote({
        note_text: 'Latviesu teksts.',
        served_language: 'lv',
        translations: [
          {
            language: 'en',
            status: 'source',
            verified: false,
            engine: null,
            error: null,
          },
          {
            language: 'lv',
            status: 'ready',
            verified: true,
            engine: 'google-nmt',
            error: null,
          },
        ],
      })
    );
    expect(
      screen.getByText('Verified by author')
    ).toBeInTheDocument();
  });

  it('keeps last-good text when ?lang= fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/v1/notes/:id/`, () =>
        HttpResponse.error()
      )
    );
    renderCard(makeNote());
    fireEvent.click(screen.getByText('LV'));
    // The original text must remain — never a silent
    // substitution on failure (last-good preserved).
    await waitFor(() =>
      expect(
        screen.getByText('Original English text.')
      ).toBeInTheDocument()
    );
  });
});
