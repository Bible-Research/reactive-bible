import { App } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from './platform';
import { updateBreadcrumb } from './updateTelemetry';

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
  /** APK size in bytes, so the UI can show what to expect. */
  apkSize?: number;
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

// The APK URL is handed to the system browser verbatim — a
// compromised manifest must not be able to smuggle a
// `javascript:`/`intent:` phishing URL into the WebView. Only
// HTTPS URLs hosted on GitHub (release assets redirect to
// *.githubusercontent.com) are trusted.
const isTrustedApkUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'github.com' ||
        parsed.hostname.endsWith('.githubusercontent.com'))
    );
  } catch {
    return false;
  }
};

const isUpdateManifest = (data: unknown): data is UpdateManifest =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as UpdateManifest).versionCode === 'number' &&
  typeof (data as UpdateManifest).apkUrl === 'string' &&
  isTrustedApkUrl((data as UpdateManifest).apkUrl);

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
      // github.com release downloads send no CORS headers, so a
      // WebView fetch from the app's https://localhost origin is
      // blocked. CapacitorHttp runs the request through the
      // native HTTP stack on-device (on web it wraps fetch).
      const res = await CapacitorHttp.get({
        url: UPDATE_MANIFEST_URL,
        responseType: 'json',
        webFetchExtra: { cache: 'no-store' },
      });
      if (res.status < 200 || res.status >= 300) {
        updateBreadcrumb('manifest http error', {
          status: res.status,
        });
        return null;
      }
      const data: unknown =
        typeof res.data === 'string'
          ? JSON.parse(res.data)
          : res.data;
      if (!isUpdateManifest(data)) {
        updateBreadcrumb('manifest rejected');
        return null;
      }
      return data;
    } catch (err) {
      updateBreadcrumb('manifest fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
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
  const [installed, manifest] = await Promise.all([
    getInstalledVersion(),
    fetchUpdateManifest(),
  ]);
  // A failed check must not burn the hourly throttle — a
  // transient network blip would otherwise suppress checks for
  // a full interval.
  if (!installed || !manifest) return { kind: 'error' };
  markUpdateChecked();
  updateBreadcrumb('manifest fetched', {
    installedBuild: installed.build,
    offeredBuild: manifest.versionCode,
    apkUrl: manifest.apkUrl,
  });
  return isUpdateAvailable(manifest, installed)
    ? { kind: 'update', manifest, installed }
    : { kind: 'current' };
};
