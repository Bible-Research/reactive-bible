import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import BottomNav from './BottomNav';
import { renderWithProviders } from '../__tests__/helpers';

describe('BottomNav Component', () => {
  const mockSetBibleSelectorOpened = vi.fn();

  const defaultProps = {
    setBibleSelectorOpened: mockSetBibleSelectorOpened,
  };

  it('should render navigation buttons and passage title', () => {
    renderWithProviders(<BottomNav {...defaultProps} />);
    
    expect(screen.getByTitle('prev-passage-button')).toBeInTheDocument();
    expect(screen.getByTitle('next-passage-button')).toBeInTheDocument();
    // Passage title should be present (e.g., "Joh 1")
    expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument();
  });

  it('should render clickable passage title', () => {
    renderWithProviders(<BottomNav {...defaultProps} />);
    
    const passageTitle = screen.getByRole('heading', { level: 4 });
    expect(passageTitle).toBeInTheDocument();
    expect(passageTitle).toHaveStyle({ cursor: 'pointer' });
  });

  it('should render prev and next buttons', () => {
    renderWithProviders(<BottomNav {...defaultProps} />);
    
    const prevButton = screen.getByTitle('prev-passage-button');
    const nextButton = screen.getByTitle('next-passage-button');
    
    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
  });

  it('should display current passage reference', () => {
    const { mockStore } = renderWithProviders(
      <BottomNav {...defaultProps} />
    );
    
    const passageTitle = screen.getByRole('heading', { level: 4 });
    
    // Should display book short name and chapter
    expect(passageTitle).toHaveTextContent(
      `${mockStore.activeBookShort} ${mockStore.activeChapter}`
    );
  });
});
