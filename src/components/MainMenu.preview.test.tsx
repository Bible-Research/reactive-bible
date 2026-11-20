import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';
import { isPreviewDeploy } from '../utils/platform';
import { fetchPendingStagingPrs } from '../utils/stagingPrs';

// isPreviewDeploy reads the build-time VITE_APP_ENV constant,
// so the env can't be flipped per-test — the function is the
// seam, same as isNativeApp elsewhere.
vi.mock('../utils/platform', () => ({
  isNativeApp: () => false,
  isPreviewDeploy: vi.fn(() => true),
}));

// The lazily-loaded modal's only external call — keep the
// GitHub API out of this test entirely.
vi.mock('../utils/stagingPrs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/stagingPrs')>();
  return {
    ...actual,
    fetchPendingStagingPrs: vi.fn(() => Promise.resolve([])),
  };
});

const props = {
  opened: true,
  onClose: vi.fn(),
  colorScheme: 'light' as const,
  toggleColorScheme: vi.fn(),
};

beforeEach(() => {
  vi.mocked(isPreviewDeploy).mockReturnValue(true);
});

describe('MainMenu staging checklist entry', () => {
  it('shows "What\'s on staging" on preview deploys', () => {
    renderWithProviders(<MainMenu {...props} />);
    expect(
      screen.getByText("What's on staging"),
    ).toBeInTheDocument();
  });

  it('hides it on production / Android builds', () => {
    vi.mocked(isPreviewDeploy).mockReturnValue(false);
    renderWithProviders(<MainMenu {...props} />);
    expect(
      screen.queryByText("What's on staging"),
    ).not.toBeInTheDocument();
  });

  it('opens the checklist modal and keeps ticks on reopen',
    async () => {
      vi.mocked(fetchPendingStagingPrs).mockResolvedValue([
        {
          number: 7,
          title: 'Feat: X',
          htmlUrl: 'https://github.com/x/y/pull/7',
          qcSteps: ['Do the thing'],
        },
      ]);
      const user = userEvent.setup();
      renderWithProviders(<MainMenu {...props} />);

      await user.click(screen.getByText("What's on staging"));
      await user.click(await screen.findByText(/#7 Feat: X/));
      const step = await screen.findByLabelText('Do the thing');
      await user.click(step);
      expect(step).toBeChecked();
      // Closing the modal must not wipe the tick — the tester
      // performs steps with the modal closed.
      await user.keyboard('{Escape}');
      await user.click(
        screen.getAllByText("What's on staging")[0],
      );
      await user.click(await screen.findByText(/#7 Feat: X/));
      expect(
        await screen.findByLabelText('Do the thing'),
      ).toBeChecked();
    });
});
