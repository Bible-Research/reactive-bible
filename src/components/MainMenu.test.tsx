import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor
// inside the "New Note" modal the same way NoteForm tests do.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

// Mock useNavigate so menu-item redirects are observable.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<
    typeof import('react-router-dom')
  >('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('MainMenu Component', () => {
  const mockNavigate: Mock = vi.fn();
  const mockOnClose = vi.fn();
  const mockToggleColorScheme = vi.fn();

  beforeEach(() => {
    // renderWithProviders' mockDomApis spyOns getElementById
    // each render — restoring unwraps the nested spy chain.
    // Restore first: it also resets the useNavigate mock impl.
    vi.restoreAllMocks();
    vi.mocked(useNavigate).mockReturnValue(
      mockNavigate as unknown as NavigateFunction
    );
  });

  // New Note / Tag Management are authenticated-only (issue
  // #68) — renderWithProviders resets auth to anonymous per
  // render unless authStoreState is passed.
  const authed = {
    isAuthenticated: true,
    token: 'test-token',
    user: { username: 'testuser' },
  };

  const defaultProps = {
    opened: true,
    onClose: mockOnClose,
    colorScheme: 'light' as const,
    toggleColorScheme: mockToggleColorScheme,
  };

  it('should render menu items when opened', () => {
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: authed,
    });

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Read Bible')).toBeInTheDocument();
    expect(screen.getByText('View Notes')).toBeInTheDocument();
    expect(screen.getByText('New Note')).toBeInTheDocument();
    expect(screen.getByText('Tag Management')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('should show Sign In button when not authenticated', () => {
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: { isAuthenticated: false, user: null },
    });

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    renderWithProviders(<MainMenu {...defaultProps} opened={false} />);

    expect(screen.queryByText('View Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Read Bible')).not.toBeInTheDocument();
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />);

    await user.click(screen.getByTitle('Close menu'));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to the active passage on Read Bible', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />);

    // initialState: activeBookId 'JHN', activeChapter 1.
    await user.click(screen.getByText('Read Bible'));

    expect(mockNavigate).toHaveBeenCalledWith('/bible/JHN.1');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to /notes on View Notes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />);

    await user.click(screen.getByText('View Notes'));

    expect(mockNavigate).toHaveBeenCalledWith('/notes');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to /tags on Tag Management', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: authed,
    });

    await user.click(screen.getByText('Tag Management'));

    expect(mockNavigate).toHaveBeenCalledWith('/tags');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to /login from the Sign In button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: { isAuthenticated: false, user: null },
    });

    await user.click(screen.getByText('Sign In'));

    // UserMenu calls onNavigate (wired to onClose) then navigates.
    expect(mockNavigate).toHaveBeenCalledWith('/login');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should open the New Note modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: authed,
    });

    await user.click(screen.getByText('New Note'));

    // The modal title differs from the menu item only in case.
    expect(await screen.findByText('New note')).toBeInTheDocument();
  });

  it('should call toggleColorScheme from the theme switch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MainMenu {...defaultProps} />);

    await user.click(screen.getByRole('switch'));

    expect(mockToggleColorScheme).toHaveBeenCalled();
  });

  it('should hide native-only items outside the native shell', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);

    // happy-dom is neither a Capacitor shell nor an Android UA.
    expect(
      screen.queryByText('Check for updates')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Download Android App')
    ).not.toBeInTheDocument();
  });
});
