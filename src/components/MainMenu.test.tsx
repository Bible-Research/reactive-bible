import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNavigate } from 'react-router-dom';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  const defaultProps = {
    opened: true,
    onClose: mockOnClose,
    colorScheme: 'light' as const,
    toggleColorScheme: mockToggleColorScheme,
  };

  it('should render menu items when opened', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    expect(screen.getByText('View Notes')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    renderWithProviders(<MainMenu {...defaultProps} opened={false} />);
    
    expect(screen.queryByText('View Notes')).not.toBeInTheDocument();
  });

  it('should render close button', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    const closeButton = screen.getByTitle('Close menu');
    expect(closeButton).toBeInTheDocument();
  });

  it('should navigate to notes when clicked', async () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    const notesToggle = screen.getByText('View Notes');
    await userEvent.click(notesToggle);
    
    expect(mockNavigate).toHaveBeenCalledWith('/notes');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should navigate to Bible when viewing notes', async () => {
    // Set showNotes to true in store
    renderWithProviders(<MainMenu {...defaultProps} />, {
      storeOverrides: { showNotes: true }
    });
    
    expect(screen.getByText('View Bible')).toBeInTheDocument();
    
    const bibleToggle = screen.getByText('View Bible');
    await userEvent.click(bibleToggle);
    
    // Should navigate to current book/chapter
    expect(mockNavigate).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display theme text', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });
});
