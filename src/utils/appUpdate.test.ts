import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkForUpdates,
  fetchUpdateManifest,
  getInstalledVersion,
  isUpdateAvailable,
  markUpdateChecked,
  shouldCheckForUpdates,
  UPDATE_MANIFEST_URL,
  UpdateManifest,
} from './appUpdate';
import { App } from '@capacitor/app';
import { isNativeApp } from './nativeAudio';

vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn() },
}));

vi.mock('./nativeAudio', () => ({
  isNativeApp: vi.fn(),
}));

const manifest = (
  overrides: Partial<UpdateManifest> = {},
): UpdateManifest => ({
  versionCode: 42,
  versionName: '0.0.42',
  apkUrl: 'https://github.com/x/y/releases/download/continuous/a.apk',
  ...overrides,
});

const mockFetchOk = (body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }),
  );
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isNativeApp).mockReturnValue(true);
  vi.mocked(App.getInfo).mockResolvedValue({
    build: '40',
    version: '0.0.40',
  } as Awaited<ReturnType<typeof App.getInfo>>);
});

describe('shouldCheckForUpdates', () => {
  it('returns true when never checked', () => {
    expect(shouldCheckForUpdates()).toBe(true);
  });

  it('returns false when checked recently', () => {
    markUpdateChecked();
    expect(shouldCheckForUpdates()).toBe(false);
  });

  it('returns true after the interval elapses', () => {
    const now = Date.now();
    markUpdateChecked(now - 61 * 60 * 1000);
    expect(shouldCheckForUpdates(now)).toBe(true);
  });

  it('returns true when the stored value is garbage', () => {
    localStorage.setItem('app_update_last_check', 'not-a-number');
    expect(shouldCheckForUpdates()).toBe(true);
  });
});

describe('isUpdateAvailable', () => {
  it('is true when the manifest build is newer', () => {
    expect(
      isUpdateAvailable(manifest({ versionCode: 41 }), {
        build: 40,
        version: '0.0.40',
      }),
    ).toBe(true);
  });

  it('is false for an equal or older build', () => {
    const installed = { build: 42, version: '0.0.42' };
    expect(isUpdateAvailable(manifest(), installed)).toBe(false);
    expect(
      isUpdateAvailable(manifest({ versionCode: 1 }), installed),
    ).toBe(false);
  });
});

describe('fetchUpdateManifest', () => {
  it('returns the manifest when the payload is valid', async () => {
    mockFetchOk(manifest());
    const result = await fetchUpdateManifest();
    expect(result?.versionCode).toBe(42);
    expect(fetch).toHaveBeenCalledWith(
      UPDATE_MANIFEST_URL,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    );
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('returns null on a malformed payload', async () => {
    mockFetchOk({ versionCode: '42' });
    expect(await fetchUpdateManifest()).toBeNull();
    mockFetchOk({ versionCode: 42 });
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('offline')),
    );
    expect(await fetchUpdateManifest()).toBeNull();
  });
});

describe('getInstalledVersion', () => {
  it('returns build and version on native', async () => {
    expect(await getInstalledVersion()).toEqual({
      build: 40,
      version: '0.0.40',
    });
  });

  it('returns null off the native platform', async () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    expect(await getInstalledVersion()).toBeNull();
    expect(App.getInfo).not.toHaveBeenCalled();
  });

  it('returns null when getInfo fails', async () => {
    vi.mocked(App.getInfo).mockRejectedValue(new Error('nope'));
    expect(await getInstalledVersion()).toBeNull();
  });
});

describe('checkForUpdates', () => {
  it('is skipped off the native platform', async () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    expect(await checkForUpdates()).toEqual({ kind: 'skipped' });
    expect(App.getInfo).not.toHaveBeenCalled();
  });

  it('is skipped when throttled', async () => {
    markUpdateChecked();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await checkForUpdates()).toEqual({ kind: 'skipped' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns update when a newer build exists', async () => {
    mockFetchOk(manifest({ versionCode: 41 }));
    const result = await checkForUpdates();
    expect(result).toEqual({
      kind: 'update',
      manifest: manifest({ versionCode: 41 }),
      installed: { build: 40, version: '0.0.40' },
    });
  });

  it('returns current when up to date', async () => {
    mockFetchOk(manifest({ versionCode: 40 }));
    expect(await checkForUpdates()).toEqual({ kind: 'current' });
  });

  it('returns error when the manifest cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('offline')),
    );
    expect(await checkForUpdates()).toEqual({ kind: 'error' });
  });

  it('force bypasses the throttle', async () => {
    markUpdateChecked();
    mockFetchOk(manifest({ versionCode: 41 }));
    const result = await checkForUpdates({ force: true });
    expect(result.kind).toBe('update');
  });
});
