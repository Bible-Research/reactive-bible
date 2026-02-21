import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';

describe('MainMenu Component', () => {
  const mockOnClose = vi.fn();
  const mockSetShowNotes = vi.fn();
  const mockToggleColorScheme = vi.fn();

  const defaultProps = {
    opened: true,
    onClose: mockOnClose,
    showNotes: false,
    setShowNotes: mockSetShowNotes,
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

  it('should toggle notes view when clicked', async () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    const notesToggle = screen.getByText('View Notes');
    await userEvent.click(notesToggle);
    
    expect(mockSetShowNotes).toHaveBeenCalledWith(true);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show "View Bible" when notes are active', () => {
    renderWithProviders(<MainMenu {...defaultProps} showNotes={true} />);
    
    expect(screen.getByText('View Bible')).toBeInTheDocument();
  });

  it('should display theme text', () => {
    renderWithProviders(<MainMenu {...defaultProps} />);
    
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });
});
