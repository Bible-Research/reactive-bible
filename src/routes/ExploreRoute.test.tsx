import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, beforeEach } from 'vitest';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import ExploreRoute from './ExploreRoute';
import { mockDomApis, resetStore } from '../__tests__/helpers';

const API_URL = `${API_BASE_URL}/api/v1`;

const publishedNote = {
  id: 'pub-1',
  note_text: 'Published study note.',
  public: true,
  published: true,
  is_owner: false,
  author: { id: 9, username: 'scholar' },
  tag_position: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  tag: {
    id: 'T1',
    name: 'Study',
    parent_tag: null,
    public: true,
    published: true,
    created_at: '',
    updated_at: '',
  },
  verses: [
    {
      book: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world...',
    },
  ],
  headings: [],
};

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/explore']}>
      <Routes>
        <Route path="/explore" element={<ExploreRoute />} />
      </Routes>
    </MemoryRouter>
  );

describe('ExploreRoute', () => {
  beforeEach(() => {
    resetStore();
    mockDomApis();
    server.use(
      http.get(`${API_URL}/notes/`, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results:
            url.searchParams.get('published') === 'true'
              ? [publishedNote]
              : [],
        });
      })
    );
  });

  it('renders the published feed with author attribution', async () => {
    renderRoute();

    await waitFor(() => {
      expect(
        screen.getByText('Published study note.')
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/scholar/)).toBeInTheDocument();
  });

  it('sends the search term after the debounce', async () => {
    let capturedQ: string | null = null;
    server.use(
      http.get(`${API_URL}/notes/`, ({ request }) => {
        const url = new URL(request.url);
        capturedQ = url.searchParams.get('q');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      })
    );
    renderRoute();

    fireEvent.change(
      screen.getByLabelText('Search published notes…'),
      { target: { value: 'grace' } }
    );

    await waitFor(() => {
      expect(capturedQ).toBe('grace');
    });
  });

  it('drops a stale response that resolves after a newer ' +
    'query', async () => {
      // The initial feed request hangs behind a gate; the
      // debounced search resolves first and wins the feed.
      let releaseInitial: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        releaseInitial = resolve;
      });
      server.use(
        http.get(`${API_URL}/notes/`, async ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('q') === 'grace') {
            return HttpResponse.json({
              count: 1,
              next: null,
              previous: null,
              results: [
                {
                  ...publishedNote,
                  id: 'hit-1',
                  note_text: 'Search hit.',
                },
              ],
            });
          }
          await gate;
          return HttpResponse.json({
            count: 1,
            next: null,
            previous: null,
            results: [publishedNote],
          });
        })
      );
      renderRoute();

      // Search before the initial load resolves.
      fireEvent.change(
        screen.getByLabelText('Search published notes…'),
        { target: { value: 'grace' } }
      );
      await screen.findByText('Search hit.');

      // The stale initial response resolves now — it must be
      // dropped whole, not overwrite the search results.
      releaseInitial();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(
        screen.queryByText('Published study note.')
      ).not.toBeInTheDocument();
      expect(screen.getByText('Search hit.')).toBeInTheDocument();
    });
});
