import { useEffect } from 'react';
import { Stack, Text } from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import { showNotification } from '@mantine/notifications';
import {
  checkForUpdates,
  UpdateCheckResult,
  UpdateManifest,
  InstalledVersion,
} from '../utils/appUpdate';

/**
 * Sideload update UX for the Android APK build. `useAppUpdate` runs
 * one throttled check per app start; `checkForUpdatesManually`
 * backs the "Check for updates" menu row and reports every outcome.
 *
 * Android requires user consent for sideloaded installs, so the
 * "Update" action hands the APK URL off to the browser — the user
 * confirms the install themselves.
 */
const openUpdateModal = (
  manifest: UpdateManifest,
  installed: InstalledVersion,
): void => {
  openConfirmModal({
    title: `Update available · v${manifest.versionName}`,
    children: (
      <Stack spacing="xs">
        <Text size="sm">
          A newer build is available (installed: v{installed.version}
          ).
        </Text>
        <Text size="sm" color="dimmed">
          Downloading opens your browser; Android will ask you to
          confirm the install once the APK finishes downloading.
        </Text>
      </Stack>
    ),
    labels: { confirm: 'Update', cancel: 'Later' },
    onConfirm: () => window.open(manifest.apkUrl, '_system'),
  });
};

const handleCheckResult = (
  result: UpdateCheckResult,
  manual: boolean,
): void => {
  switch (result.kind) {
    case 'update':
      openUpdateModal(result.manifest, result.installed);
      break;
    case 'current':
      if (manual) {
        showNotification({
          title: 'No update available',
          message: 'You are on the latest version.',
        });
      }
      break;
    case 'error':
      if (manual) {
        showNotification({
          title: 'Update check failed',
          message: 'Could not reach the update server.',
          color: 'red',
        });
      }
      break;
    default:
      break;
  }
};

export const useAppUpdate = (): void => {
  useEffect(() => {
    let cancelled = false;
    void checkForUpdates().then((result) => {
      if (!cancelled) handleCheckResult(result, false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
};

export const checkForUpdatesManually = async (): Promise<void> => {
  handleCheckResult(await checkForUpdates({ force: true }), true);
};
