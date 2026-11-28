import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import SettingsRoute from './SettingsRoute';
import { renderWithProviders } from '../__tests__/helpers';
import { useBibleStore } from '../store';

const textFs = (id: string, size = 'C') => ({
  id,
  type: 'text_plain' as const,
  size,
  codec: null,
  bitrate: null,
});
const audioFs = (id: string, size = 'C') => ({
  id,
  type: 'audio' as const,
  size,
  codec: null,
  bitrate: null,
});
const esv = {
  abbr: 'ENGESV',
  name: 'English Standard Version',
  language: 'English',
  language_iso: 'eng',
  filesets: [
    textFs('ENGESVO_ET', 'OT'),
    textFs('ENGESVN_ET', 'NT'),
    textFs('ENGESV_API', 'C'),
    audioFs('ENGESV_API', 'C'),
  ],
};

describe('SettingsRoute', () => {
  it('defaults to following the selected translation', () => {
    renderWithProviders(<SettingsRoute />);

    expect(
      screen.getByRole('radio', { name: 'Selected translation' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Specific translation' }),
    ).toBeInTheDocument();
  });

  it('pins the picked translation without retuning the reader',
    async () => {
      renderWithProviders(<SettingsRoute />, {
        storeOverrides: {
          translations: [esv],
          activeTextFilesetId: 'ENGESV_API',
          activeAudioFilesetId: 'ENGESV_API',
        },
      });
      const user = userEvent.setup();

      await user.click(
        screen.getByRole('radio', {
          name: 'Specific translation',
        }),
      );

      // The pick-only TranslationSelector opens seeded on the
      // active selection — with no audio surface.
      await screen.findByText(/Auto-resolved per testament/);
      expect(
        screen.queryByRole('radio', {
          name: 'Read aloud — Full Bible',
        }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'Save' }),
      );

      expect(useBibleStore.getState().noteRefFilesetId).toBe(
        'ENGESV:text:1',
      );
      // The reader's selections are untouched.
      expect(useBibleStore.getState().activeTextFilesetId).toBe(
        'ENGESV_API',
      );
      expect(useBibleStore.getState().activeAudioFilesetId).toBe(
        'ENGESV_API',
      );
      // The pin shows its resolved translation name.
      expect(
        screen.getByText('English Standard Version (ENGESV)'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('radio', {
          name: 'Specific translation',
        }),
      ).toBeChecked();
    },
  );

  it('shows the raw id when the pinned owner is unknown', () => {
    renderWithProviders(<SettingsRoute />, {
      storeOverrides: {
        translations: [],
        noteRefFilesetId: 'STALE_ID',
      },
    });

    expect(screen.getByText('STALE_ID')).toBeInTheDocument();
  });

  it('shows the reorder confirmation toggle on by default ' +
    'and writes the pref', async () => {
      renderWithProviders(<SettingsRoute />);
      const toggle = screen.getByRole('switch', {
        name: 'Confirm before reordering notes',
      });
      expect(toggle).toBeChecked();
      const user = userEvent.setup();

      await user.click(toggle);

      expect(useBibleStore.getState().confirmNoteReorder)
        .toBe(false);
    });

  it('reflects a stored confirmNoteReorder opt-out', () => {
    renderWithProviders(<SettingsRoute />, {
      storeOverrides: { confirmNoteReorder: false },
    });

    expect(
      screen.getByRole('switch', {
        name: 'Confirm before reordering notes',
      }),
    ).not.toBeChecked();
  });

  it('resets the pin back to following the selection',
    async () => {
      renderWithProviders(<SettingsRoute />, {
        storeOverrides: {
          translations: [esv],
          noteRefFilesetId: 'ENGESV:text:1',
          activeTextFilesetId: 'LVSGLU8',
        },
      });
      expect(
        screen.getByText('English Standard Version (ENGESV)'),
      ).toBeInTheDocument();
      const user = userEvent.setup();

      await user.click(
        screen.getByRole('button', { name: 'Reset' }),
      );

      expect(useBibleStore.getState().noteRefFilesetId)
        .toBeNull();
      expect(
        screen.getByRole('radio', {
          name: 'Selected translation',
        }),
      ).toBeChecked();
    },
  );
});
