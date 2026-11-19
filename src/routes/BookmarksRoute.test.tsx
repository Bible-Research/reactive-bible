import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import BookmarksRoute from './BookmarksRoute';
import {
  renderWithProviders,
  mockDomApis,
} from '../__tests__/helpers';

describe('BookmarksRoute', () => {
  beforeEach(() => {
    mockDomApis();
  });

  const renderRoute = () =>
    renderWithProviders(
      // renderWithProviders already supplies the router —
      // these routes read no params, only navigate.
      <BookmarksRoute />,
      {
        authStoreState: {
          isAuthenticated: true,
          token: 't',
          user: { id: 2, username: 'me' },
        },
      }
    );

  it('renders saved notes and unavailable rows', async () => {
    renderRoute();

    // MSW serves one available bookmark plus a stale
    // (unavailable) pointer.
    await waitFor(() => {
      expect(
        screen.getByText('This is a test note.')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText('This note is no longer accessible.')
    ).toBeInTheDocument();
  });

  it('removes a stale bookmark via the delete action', async () => {
    renderRoute();

    await waitFor(() => {
      expect(
        screen.getByText('This note is no longer accessible.')
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove bookmark' })
    );
    await waitFor(() => {
      expect(
        screen.queryByText('This note is no longer accessible.')
      ).not.toBeInTheDocument();
    });
  });
});
