import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNavigate } from 'react-router-dom';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';

// Mock useNavigate
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
  const mockNavigate = vi.fn();
  const mockOnClose = vi.fn();
  const mockToggleColorScheme = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  const defaultProps = {
    opened: true,
    onClose: mockOnClose,
    colorScheme: 'light' as const,
    toggleColorScheme: mockToggleColorScheme,
  };

  it('should render menu items when opened', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);

    expect(screen.getByText('Read Bible')).toBeInTheDocument();
    expect(screen.getByText('View Notes')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    renderWithProviders(<MainMenu {...defaultProps} opened={false} />);

    expect(
      screen.queryByText('View Notes')
    ).not.toBeInTheDocument();
  });

  it('should render a close button that calls onClose', async () => {
    renderWithProviders(<MainMenu {...defaultProps} />);

    const closeButton = screen.getByTitle('Close menu');
    await userEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to notes when clicked', async () => {
    renderWithProviders(<MainMenu {...defaultProps} />);

    await userEvent.click(screen.getByText('View Notes'));

    expect(mockNavigate).toHaveBeenCalledWith('/notes');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to the active bible passage', async () => {
    renderWithProviders(<MainMenu {...defaultProps} />, {
      storeOverrides: { activeBookId: 'JHN', activeChapter: 3 },
    });

    await userEvent.click(screen.getByText('Read Bible'));

    expect(mockNavigate).toHaveBeenCalledWith('/bible/JHN.3');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display theme text', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);

    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('hides authenticated-only items from anonymous visitors',
    () => {
      renderWithProviders(<MainMenu {...defaultProps} />, {
        authStoreState: { isAuthenticated: false },
      });

      expect(
        screen.queryByText('New Note')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Tag Management')
      ).not.toBeInTheDocument();
    });

  it('shows write affordances to authenticated users', () => {
    renderWithProviders(<MainMenu {...defaultProps} />, {
      authStoreState: {
        isAuthenticated: true,
        token: 'test-token',
        user: { username: 'testuser' },
      },
    });

    expect(screen.getByText('New Note')).toBeInTheDocument();
    expect(screen.getByText('Tag Management')).toBeInTheDocument();
  });

  it('navigates to tag management for authenticated users',
    async () => {
      renderWithProviders(<MainMenu {...defaultProps} />, {
        authStoreState: {
          isAuthenticated: true,
          token: 'test-token',
          user: { username: 'testuser' },
        },
      });

      await userEvent.click(screen.getByText('Tag Management'));

      expect(mockNavigate).toHaveBeenCalledWith('/tags');
      expect(mockOnClose).toHaveBeenCalled();
    });
});
