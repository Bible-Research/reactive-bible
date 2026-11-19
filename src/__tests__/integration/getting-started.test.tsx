/**
 * /getting-started is an onboarding page aimed at visitors who
 * have not signed up yet, so the route must stay public: an
 * anonymous render must reach the page, never bounce to
 * /login. Mounts the real AppRoutes so the registration itself
 * (src/routes/index.tsx) is under test — deleting the <Route>
 * or wrapping it in ProtectedRoute fails this suite.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../routes/index';
import { useBibleStore, initialState } from '../../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../../stores/authStore';

// Stand-in so a stray ProtectedRoute redirect is detectable.
vi.mock('../../components/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login</div>,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('/getting-started route registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState(initialState);
    useAuthStore.setState(authInitialState);
  });

  it('renders anonymously without a login redirect', async () => {
    renderAt('/getting-started');

    // The route is lazy (lazyWithReload + Suspense), so the
    // heading lands only after the dynamic import resolves.
    expect(
      await screen.findByRole('heading', {
        name: 'Getting started',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('login-page'))
      .not.toBeInTheDocument();
  });
});
