import {
  screen,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import SharedWithMeRoute from './SharedWithMeRoute';
import { useAuthStore } from '../stores/authStore';
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

  it('opens an include_descendants grant on the merged ' +
    'subtree view', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 2, username: 'me' },
    });
    // Probe records where the tag-grant link lands.
    const TagProbe = () => {
      const location = useLocation();
      return (
        <div data-testid="tag-landing">
          {`${location.pathname}${location.search}`}
        </div>
      );
    };
    render(
      <MemoryRouter initialEntries={['/shared']}>
        <Routes>
          <Route path="/shared" element={<SharedWithMeRoute />} />
          <Route
            path="/notes/tag/:tagId"
            element={<TagProbe />}
          />
        </Routes>
      </MemoryRouter>
    );

    // MSW's single tag grant ships include_descendants=true —
    // the link must carry ?descendants=1 or the subtree notes
    // it grants would be invisible on the tag page.
    fireEvent.click(
      await screen.findByText(/Test Tag/)
    );

    await waitFor(() => {
      expect(screen.getByTestId('tag-landing'))
        .toHaveTextContent('/notes/tag/1?descendants=1');
    });
  });
});
