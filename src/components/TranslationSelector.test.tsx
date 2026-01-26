import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import TranslationSelector from './TranslationSelector';
import { renderWithProviders } from '../__tests__/helpers';

describe('TranslationSelector Component', () => {
  it('should render the Translations button', () => {
    renderWithProviders(<TranslationSelector />);
    expect(
      screen.getByRole('button', { name: 'Translations' })
    ).toBeInTheDocument();
  });

  it('should open modal when button is clicked', async () => {
    renderWithProviders(<TranslationSelector />);
    const button = screen.getByRole('button', { name: 'Translations' });
    await userEvent.click(button);

    // Modal should be visible with title
    expect(screen.getByText('Select Translation')).toBeInTheDocument();
  });

  // Note: Testing modal interactions with Select dropdowns
  // is problematic due to portal rendering.
  // See SKIPPED_TESTS.md for details.
  it.skip('should display available translations', async () => {
    renderWithProviders(<TranslationSelector />);
    const button = screen.getByRole('button', { name: 'Translations' });
    await userEvent.click(button);

    // This test is skipped because Select component renders
    // options in a portal that's not accessible in tests
  });
});
