import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import SharedWithMeRoute from './SharedWithMeRoute';
import {
  renderWithProviders,
  mockDomApis,
} from '../__tests__/helpers';

describe('SharedWithMeRoute', () => {
  beforeEach(() => {
    mockDomApis();
  });

  const renderRoute = () =>
    renderWithProviders(
      // renderWithProviders already supplies the router —
      // these routes read no params, only navigate.
      <SharedWithMeRoute />,
      {
        authStoreState: {
          isAuthenticated: true,
          token: 't',
          user: { id: 2, username: 'me' },
        },
      }
    );

  it('lists shared notes and tag grants', async () => {
    renderRoute();

    // MSW serves one shared note ("This is a test note.")
    // and one tag grant for "Test Tag".
    await waitFor(() => {
      expect(
        screen.getByText('This is a test note.')
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Test Tag/)).toBeInTheDocument();
    expect(
      screen.getByText(/includes sub-tags/)
    ).toBeInTheDocument();
  });
});
