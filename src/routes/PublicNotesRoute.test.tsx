import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../__tests__/setup';
import PublicNotesRoute from './PublicNotesRoute';
import { mockNotes } from '../__tests__/handlers';
import { renderWithProviders } from '../__tests__/helpers';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('PublicNotesRoute', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders a loading state initially', () => {
    renderWithProviders(<PublicNotesRoute />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('renders a list of public notes', async () => {
    server.use(
      http.get('https://bibleresearchapi.vercel.app/api/v1/notes/', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('public') === 'true') {
          return HttpResponse.json(mockNotes);
        }
        return HttpResponse.json([]);
      })
    );

    renderWithProviders(<PublicNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText(mockNotes[0].note_text)).toBeInTheDocument();
    });
  });

  it('renders a message when no public notes are found', async () => {
    server.use(
      http.get('https://bibleresearchapi.vercel.app/api/v1/notes/', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('public') === 'true') {
          return HttpResponse.json([]);
        }
        return HttpResponse.json([]);
      })
    );

    renderWithProviders(<PublicNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText('No public notes found.')).toBeInTheDocument();
    });
  });

  it('navigates to note detail when a note is clicked', async () => {
    server.use(
      http.get('https://bibleresearchapi.vercel.app/api/v1/notes/', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('public') === 'true') {
          return HttpResponse.json(mockNotes);
        }
        return HttpResponse.json([]);
      })
    );

    renderWithProviders(<PublicNotesRoute />);

    await waitFor(() => {
      expect(screen.getByText(mockNotes[0].note_text)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText(mockNotes[0].note_text));

    expect(mockNavigate).toHaveBeenCalledWith(`/notes/${mockNotes[0].id}`);
  });
});
