import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotesSearchRoute from './NotesSearchRoute';
import { mockNotes, mockTags } from '../__tests__/handlers';
import { renderWithProviders } from '../__tests__/helpers';
import { waitForSearchForm, fillSearchForm, waitForSearchResults } from '../__tests__/helpers/notes';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('NotesSearchRoute', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders search form with empty state', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: ['/notes/search'],
    });

    await waitForSearchForm();
  });

  it('performs search and displays results', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: ['/notes/search'],
    });

    await fillSearchForm('test');
    await waitForSearchResults(1);

    // Verify note details are shown
    expect(screen.getByText(mockNotes[0].note_text)).toBeInTheDocument();
    expect(screen.getByText(mockTags[0].name)).toBeInTheDocument();
    expect(screen.getByText(/1 verse/i)).toBeInTheDocument();
  });

  it('filters by tag', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: ['/notes/search'],
    });

    await fillSearchForm('test', mockTags[0].id);
    await waitForSearchResults(1);

    // Verify filtered results
    expect(screen.getByText(mockNotes[0].note_text)).toBeInTheDocument();
  });

  it('navigates to note detail when clicking a result', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: ['/notes/search'],
    });

    await fillSearchForm('test');
    await waitForSearchResults(1);

    // Click on a note
    const user = userEvent.setup();
    await user.click(screen.getByText(mockNotes[0].note_text));

    // Verify navigation
    expect(mockNavigate).toHaveBeenCalledWith(`/notes/${mockNotes[0].id}`);
  });

  it('shows no results message when search returns empty', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: ['/notes/search'],
    });

    await fillSearchForm('nonexistent');
    await waitForSearchResults(0);
  });

  it('preserves search params in URL', async () => {
    renderWithProviders(<NotesSearchRoute />, {
      initialRoutes: [`/notes/search?q=test&tag=${mockTags[0].id}`],
    });

    await waitForSearchForm();

    await waitForSearchForm();

    await waitFor(async () => {
      expect(screen.getByPlaceholderText('Enter keywords...')).toHaveValue('test');
      await screen.findByText(mockTags[0].name);
    });

    // Verify results are loaded
    await waitForSearchResults(1);
    expect(screen.getByText(mockNotes[0].note_text)).toBeInTheDocument();
  });
});
