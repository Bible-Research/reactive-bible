import * as Sentry from '@sentry/react';
import type { InstalledVersion, UpdateManifest } from './appUpdate';

/**
 * Sentry visibility for the sideload updater (Android shell).
 *
 * Breadcrumbs (category `app-update`) record each step of a check
 * so any later event carries the update context. Two info events
 * form the `reportType: app-update` stream:
 *
 * - `updateStep: download-opened` — the user tapped "Update" and
 *   the APK URL went to the system browser.
 * - `updateStep: installed` — the app started on a higher
 *   versionCode than last time, i.e. an update really installed.
 *
 * A `download-opened` with no later `installed` for the same
 * device points at the browser / installer leg. Every call is a
 * no-op when Sentry was not initialized (no VITE_SENTRY_DSN).
 */
const CATEGORY = 'app-update';
const LAST_BUILD_KEY = 'app_update_last_build';

export const updateBreadcrumb = (
  message: string,
  data?: Record<string, unknown>,
): void => {
  Sentry.addBreadcrumb({ category: CATEGORY, message, level: 'info', data });
};

export const reportUpdateOpened = (
  manifest: UpdateManifest,
  installed: InstalledVersion,
): void => {
  updateBreadcrumb('apk url opened', { apkUrl: manifest.apkUrl });
  Sentry.captureMessage('app update download opened', {
    level: 'info',
    tags: {
      reportType: CATEGORY,
      updateStep: 'download-opened',
      installedBuild: String(installed.build),
      offeredBuild: String(manifest.versionCode),
    },
    extra: {
      apkUrl: manifest.apkUrl,
      apkSha256: manifest.apkSha256,
      apkSize: manifest.apkSize,
      installedVersion: installed.version,
      offeredVersion: manifest.versionName,
    },
  });
};

/**
 * Tag events with the installed versionCode and report an
 * `installed` event when it grew since the previous start.
 */
export const reportInstalledBuild = (
  installed: InstalledVersion,
): void => {
  Sentry.setTag('versionCode', String(installed.build));
  let previous = NaN;
  try {
    previous = Number(localStorage.getItem(LAST_BUILD_KEY) ?? NaN);
    localStorage.setItem(LAST_BUILD_KEY, String(installed.build));
  } catch {
    return;
  }
  if (Number.isFinite(previous) && previous > 0 &&
    installed.build > previous) {
    Sentry.captureMessage('app update installed', {
      level: 'info',
      tags: {
        reportType: CATEGORY,
        updateStep: 'installed',
        fromBuild: String(previous),
        toBuild: String(installed.build),
      },
    });
  }
};
