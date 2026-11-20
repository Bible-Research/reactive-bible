import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MainMenu from './MainMenu';
import { renderWithProviders } from '../__tests__/helpers';
import { isPreviewDeploy } from '../utils/platform';

// isPreviewDeploy reads the build-time VITE_APP_ENV constant,
// so the env can't be flipped per-test — the function is the
// seam, same as isNativeApp elsewhere.
vi.mock('../utils/platform', () => ({
  isNativeApp: () => false,
  isPreviewDeploy: vi.fn(() => true),
}));

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
});
