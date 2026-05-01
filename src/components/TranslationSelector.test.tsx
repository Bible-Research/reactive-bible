import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TranslationSelector from './TranslationSelector';
import { useBibleStore } from '../store';
import * as api from '../api';

// Mock the API
vi.mock('../api', () => ({
  getAvailableTranslations: vi.fn(),
}));

const initialStoreState = useBibleStore.getState();

describe('TranslationSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBibleStore.setState({
      ...initialStoreState,
      translations: [],
      activeTextFilesetId: 'ENGESV',
      activeAudioFilesetId: null,
      setTranslations: vi.fn(),
      setActiveTextFilesetId: vi.fn(),
      setActiveAudioFilesetId: vi.fn(),
    });

    (api.getAvailableTranslations as vi.Mock).mockResolvedValue([
      {
        abbr: 'KJV',
        name: 'King James Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGKJV', type: 'text_plain', size: 'NT' },
        ],
      },
    ]);
  });

  it('should render the Translations button', () => {
    render(<TranslationSelector />);
    expect(
      screen.getByRole('button', { name: 'Translations' })
    ).toBeInTheDocument();
  });

  it('should open modal when button is clicked', () => {
    render(<TranslationSelector />);
    const button = screen.getByRole('button', 
      { name: 'Translations' });
    fireEvent.click(button);

    // Modal should be visible with title
    expect(
      screen.getByText('Select Translation')
    ).toBeInTheDocument();
  });

  // Note: Testing modal interactions with Select dropdowns
  // is problematic due to portal rendering.
  // See SKIPPED_TESTS.md for details.
  it.skip('should display available translations', async () => {
    render(<TranslationSelector />);
    const button = screen.getByRole('button', 
      { name: 'Translations' });
    await userEvent.click(button);

    // This test is skipped because Select component renders
    // options in a portal that's not accessible in tests
  });

  it('refreshes translations from the API when modal opens', async () => {
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;

    render(<TranslationSelector />);

    // Initial mount triggers a cached fetch (forceRefresh=false).
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng');
    });
    mock.mockClear();

    const button = screen.getByRole('button',
      { name: 'Translations' });
    fireEvent.click(button);

    // Opening the modal must trigger an async refresh that
    // bypasses the cache so newly available translations from
    // the API show up without a manual cache bust.
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });
  });

  it('refreshes again on each re-open of the modal', async () => {
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;

    render(<TranslationSelector />);
    const button = screen.getByRole('button',
      { name: 'Translations' });

    fireEvent.click(button);
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });

    // Close the modal.
    fireEvent.click(screen.getByRole('button',
      { name: /cancel/i }));

    mock.mockClear();

    // Re-open: must fetch fresh translations again.
    fireEvent.click(button);
    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('eng', true);
    });
  });

  it('updates the translations store with freshly fetched list', async () => {
    const setTranslations = vi.fn();
    useBibleStore.setState({
      ...initialStoreState,
      translations: [],
      activeTextFilesetId: 'ENGESV',
      activeAudioFilesetId: null,
      setTranslations,
      setActiveTextFilesetId: vi.fn(),
      setActiveAudioFilesetId: vi.fn(),
    });

    const freshTranslations = [
      {
        abbr: 'NIV',
        name: 'New International Version',
        language: 'English',
        language_iso: 'eng',
        filesets: [
          { id: 'ENGNIV', type: 'text_plain', size: 'C' },
        ],
      },
    ];
    const mock = api.getAvailableTranslations as unknown as ReturnType<
      typeof vi.fn
    >;
    mock.mockImplementation(
      (_iso: string, forceRefresh?: boolean) =>
        Promise.resolve(
          forceRefresh ? freshTranslations : []
        )
    );

    render(<TranslationSelector />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Translations' })
    );

    await waitFor(() => {
      expect(setTranslations).toHaveBeenCalledWith(
        freshTranslations
      );
    });
  });
});
