import '@testing-library/jest-dom';
import {
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE_URL } from '../../config';
import NotesRoute from '../NotesRoute';
import { renderWithProviders } from '../../__tests__/helpers';

const TAGS_URL = `${API_BASE_URL}/api/v1/tags/`;

const authenticated = { token: 'test-token', isAuthenticated: true };
const anonymous = { token: null, isAuthenticated: false };

describe('NotesRoute', () => {
  it('shows an empty state when the user has no tags', async () => {
    server.use(
      http.get(TAGS_URL, () => HttpResponse.json([]))
    );

    renderWithProviders(<NotesRoute />, {
      authStoreState: authenticated,
    });

    // Zero tags used to leave the loader spinning forever.
    await waitFor(() => {
      expect(
        screen.getByText(/No tags yet/)
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /create your first tag/i })
    ).toBeInTheDocument();
  });

  it('shows an error with retry when tag loading fails',
    async () => {
      let fail = true;
      server.use(
        http.get(TAGS_URL, () =>
          fail
            ? new HttpResponse(null, { status: 500 })
            : HttpResponse.json([])
        )
      );

      renderWithProviders(<NotesRoute />, {
        authStoreState: authenticated,
      });

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load your tags.')
        ).toBeInTheDocument();
      });

      // Retrying after the backend recovers reaches the
      // empty state instead of staying stuck on the error.
      fail = false;
      fireEvent.click(
        screen.getByRole('button', { name: /try again/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/No tags yet/)
        ).toBeInTheDocument();
      });
    });

  it('does not fetch tags for anonymous visitors', async () => {
    const tagRequests = vi.fn();
    server.use(
      http.get(TAGS_URL, () => {
        tagRequests();
        return HttpResponse.json([]);
      })
    );

    renderWithProviders(<NotesRoute />, {
      authStoreState: anonymous,
    });

    // Anonymous users are redirected to /bible; the tags
    // endpoint must never be hit.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tagRequests).not.toHaveBeenCalled();
  });
});
