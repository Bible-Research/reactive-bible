import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StagingChecklistModal from './StagingChecklistModal';
import { renderWithProviders } from '../__tests__/helpers';
import {
  STAGING_COMPARE_URL,
  StagingPrsError,
  fetchPendingStagingPrs,
  type StagingPr,
} from '../utils/stagingPrs';

vi.mock('../utils/stagingPrs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/stagingPrs')>();
  return {
    ...actual,
    fetchPendingStagingPrs: vi.fn(),
  };
});

const pr = (overrides: Partial<StagingPr> = {}): StagingPr => ({
  number: 10,
  title: 'Feat: Something',
  htmlUrl: 'https://github.com/x/y/pull/10',
  qcSteps: null,
  ...overrides,
});

const opened = { opened: true, onClose: vi.fn() };

beforeEach(() => {
  vi.mocked(fetchPendingStagingPrs).mockReset();
});

describe('StagingChecklistModal', () => {
  it('renders each QC step as a tickable checkbox', async () => {
    vi.mocked(fetchPendingStagingPrs).mockResolvedValue([
      pr({ qcSteps: ['Open the menu', 'Click the entry'] }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<StagingChecklistModal {...opened} />);

    await user.click(
      await screen.findByText(/#10 Feat: Something/),
    );
    const step = await screen.findByLabelText('Open the menu');
    await user.click(step);
    expect(step).toBeChecked();
    expect(
      screen.getByLabelText('Click the entry'),
    ).not.toBeChecked();
  });

  it('links to the PR when the body has no QC section',
    async () => {
      vi.mocked(fetchPendingStagingPrs).mockResolvedValue([pr()]);
      const user = userEvent.setup();
      renderWithProviders(<StagingChecklistModal {...opened} />);

      await user.click(
        await screen.findByText(/#10 Feat: Something/),
      );
      const link = await screen.findByText(
        'See the PR body for verification steps',
      );
      expect(link.closest('a')).toHaveAttribute(
        'href',
        'https://github.com/x/y/pull/10',
      );
    });

  it('shows the nothing-pending state on an empty list',
    async () => {
      vi.mocked(fetchPendingStagingPrs).mockResolvedValue([]);
      renderWithProviders(<StagingChecklistModal {...opened} />);

      expect(
        await screen.findByText(
          'Nothing pending — staging matches production.',
        ),
      ).toBeInTheDocument();
    });

  it('shows the error state with the compare link on failure',
    async () => {
      vi.mocked(fetchPendingStagingPrs).mockRejectedValue(
        new StagingPrsError('boom', 403),
      );
      renderWithProviders(<StagingChecklistModal {...opened} />);

      const link = await screen.findByText(
        'Open the main...staging compare on GitHub',
      );
      expect(link.closest('a')).toHaveAttribute(
        'href',
        STAGING_COMPARE_URL,
      );
    });

  it('keeps the last good list when a reopen revalidation ' +
    'fails', async () => {
      vi.mocked(fetchPendingStagingPrs).mockResolvedValue([pr()]);
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <StagingChecklistModal {...opened} />,
      );

      await user.click(
        await screen.findByText(/#10 Feat: Something/),
      );
      await screen.findByText(
        'See the PR body for verification steps',
      );

      // Reopen with the fetch now failing — the previous rows
      // stay, no error state.
      vi.mocked(fetchPendingStagingPrs).mockRejectedValue(
        new StagingPrsError('boom'),
      );
      rerender(<StagingChecklistModal {...opened} opened={false} />);
      rerender(<StagingChecklistModal {...opened} />);

      await user.click(
        await screen.findByText(/#10 Feat: Something/),
      );
      expect(
        await screen.findByText(
          'See the PR body for verification steps',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Open the main...staging compare on GitHub',
        ),
      ).not.toBeInTheDocument();
    });

  it('does not fetch while closed', () => {
    renderWithProviders(
      <StagingChecklistModal {...opened} opened={false} />,
    );
    expect(fetchPendingStagingPrs).not.toHaveBeenCalled();
  });
});
