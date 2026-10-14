import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { openConfirmModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import {
  checkForUpdatesManually,
  useAppUpdate,
} from './useAppUpdate';
import {
  checkForUpdates,
  UpdateCheckResult,
} from '../utils/appUpdate';

vi.mock('@mantine/modals', () => ({
  openConfirmModal: vi.fn(),
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('../utils/appUpdate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/appUpdate')>()),
  checkForUpdates: vi.fn(),
}));

const updateResult = (versionCode = 41): UpdateCheckResult => ({
  kind: 'update',
  manifest: {
    versionCode,
    versionName: `0.0.${versionCode}`,
    apkUrl: 'https://github.com/x/y/releases/download/a.apk',
  },
  installed: { build: 40, version: '0.0.40' },
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useAppUpdate', () => {
  it('opens the update modal when a newer build exists', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue(updateResult());
    renderHook(() => useAppUpdate());
    await waitFor(() => {
      expect(openConfirmModal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Update available · v0.0.41',
          labels: { confirm: 'Update', cancel: 'Later' },
        }),
      );
    });
  });

  it('does not notify when up to date', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      kind: 'current',
    });
    renderHook(() => useAppUpdate());
    await waitFor(() => {
      expect(checkForUpdates).toHaveBeenCalled();
    });
    expect(openConfirmModal).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('stays silent on check errors (automatic check)', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({ kind: 'error' });
    renderHook(() => useAppUpdate());
    await waitFor(() => {
      expect(checkForUpdates).toHaveBeenCalled();
    });
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('confirms by opening the APK url in the system browser',
    async () => {
      vi.mocked(checkForUpdates).mockResolvedValue(updateResult());
      const openSpy = vi.fn();
      vi.stubGlobal('open', openSpy);
      renderHook(() => useAppUpdate());
      await waitFor(() => {
        expect(openConfirmModal).toHaveBeenCalled();
      });
      const options = vi.mocked(openConfirmModal).mock.calls[0][0];
      options.onConfirm?.();
      expect(openSpy).toHaveBeenCalledWith(
        'https://github.com/x/y/releases/download/a.apk',
        '_system',
      );
    });
});

describe('checkForUpdatesManually', () => {
  it('forces the check and opens the modal on update', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue(updateResult());
    await checkForUpdatesManually();
    expect(checkForUpdates).toHaveBeenCalledWith({ force: true });
    expect(openConfirmModal).toHaveBeenCalled();
  });

  it('notifies when already up to date', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      kind: 'current',
    });
    await checkForUpdatesManually();
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No update available' }),
    );
  });

  it('notifies on failure', async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({ kind: 'error' });
    await checkForUpdatesManually();
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Update check failed',
        color: 'red',
      }),
    );
  });
});
