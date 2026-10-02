import { App } from '@capacitor/app';
import { isNativeApp } from './nativeAudio';

/**
 * Sideload update check for the Android APK build.
 *
 * The app is distributed via GitHub Releases, not Google Play, so on
 * launch we poll the `update.json` manifest attached to the rolling
 * `continuous` release. When it advertises a newer versionCode than
 * the installed APK the UI offers a download link — Android always
 * requires user consent for sideloaded installs, so there is no
 * silent update path.
 */
export const UPDATE_MANIFEST_URL =
  'https://github.com/Bible-Research/reactive-bible/releases/' +
  'download/continuous/update.json';

const LAST_CHECK_KEY = 'app_update_last_check';

// Automatic checks are throttled so rapid relaunches do not
// re-fetch the manifest on every cold start.
const MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  apkSha256?: string;
  minShellBuild?: number;
  commitSha?: string;
  releasedAt?: string;
}

export interface InstalledVersion {
  /** Android versionCode. */
  build: number;
  /** Android versionName. */
  version: string;
}

export type UpdateCheckResult =
  | {
      kind: 'update';
      manifest: UpdateManifest;
      installed: InstalledVersion;
    }
  | { kind: 'current' }
  | { kind: 'skipped' }
  | { kind: 'error' };

const isUpdateManifest = (data: unknown): data is UpdateManifest =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as UpdateManifest).versionCode === 'number' &&
  typeof (data as UpdateManifest).apkUrl === 'string';

export const getInstalledVersion =
  async (): Promise<InstalledVersion | null> => {
    if (!isNativeApp()) return null;
    try {
      const info = await App.getInfo();
      const build = Number(info.build);
      if (!Number.isFinite(build)) return null;
      return { build, version: info.version };
    } catch {
      return null;
    }
  };

export const fetchUpdateManifest =
  async (): Promise<UpdateManifest | null> => {
    try {
      const res = await fetch(UPDATE_MANIFEST_URL, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      return isUpdateManifest(data) ? data : null;
    } catch {
      return null;
    }
  };

export const isUpdateAvailable = (
  manifest: UpdateManifest,
  installed: InstalledVersion,
): boolean => manifest.versionCode > installed.build;

export const shouldCheckForUpdates = (now = Date.now()): boolean => {
  const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
  return (
    !Number.isFinite(last) || now - last > MIN_CHECK_INTERVAL_MS
  );
};

export const markUpdateChecked = (now = Date.now()): void => {
  localStorage.setItem(LAST_CHECK_KEY, String(now));
};

/**
 * Fetch the manifest and compare it against the installed build.
 * Non-native platforms and throttled calls resolve to 'skipped';
 * network/parse failures resolve to 'error' (never thrown).
 */
export const checkForUpdates = async (
  options: { force?: boolean } = {},
): Promise<UpdateCheckResult> => {
  if (!isNativeApp()) return { kind: 'skipped' };
  if (!options.force && !shouldCheckForUpdates()) {
    return { kind: 'skipped' };
  }
  markUpdateChecked();
  const [installed, manifest] = await Promise.all([
    getInstalledVersion(),
    fetchUpdateManifest(),
  ]);
  if (!installed || !manifest) return { kind: 'error' };
  return isUpdateAvailable(manifest, installed)
    ? { kind: 'update', manifest, installed }
    : { kind: 'current' };
};
