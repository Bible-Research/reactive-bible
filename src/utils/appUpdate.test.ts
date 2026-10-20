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
import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from './nativeAudio';

vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn() },
}));

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    CapacitorHttp: { get: vi.fn() },
  };
});

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
  vi.mocked(CapacitorHttp.get).mockResolvedValue({
    status: 200,
    data: body,
    headers: {},
    url: UPDATE_MANIFEST_URL,
  });
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
    expect(CapacitorHttp.get).toHaveBeenCalledWith(
      expect.objectContaining({ url: UPDATE_MANIFEST_URL }),
    );
  });

  it('parses a manifest returned as a JSON string', async () => {
    vi.mocked(CapacitorHttp.get).mockResolvedValue({
      status: 200,
      data: JSON.stringify(manifest()),
      headers: {},
      url: UPDATE_MANIFEST_URL,
    });
    const result = await fetchUpdateManifest();
    expect(result?.versionCode).toBe(42);
  });

  it('returns null on a non-ok response', async () => {
    vi.mocked(CapacitorHttp.get).mockResolvedValue({
      status: 404,
      data: '',
      headers: {},
      url: UPDATE_MANIFEST_URL,
    });
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('returns null on a malformed payload', async () => {
    mockFetchOk({ versionCode: '42' });
    expect(await fetchUpdateManifest()).toBeNull();
    mockFetchOk({ versionCode: 42 });
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('rejects manifests with an untrusted apkUrl', async () => {
    mockFetchOk(manifest({ apkUrl: 'javascript:alert(1)' }));
    expect(await fetchUpdateManifest()).toBeNull();

    mockFetchOk(
      manifest({ apkUrl: 'http://github.com/x/y/a.apk' }),
    );
    expect(await fetchUpdateManifest()).toBeNull();

    mockFetchOk(
      manifest({ apkUrl: 'https://evil.example.com/a.apk' }),
    );
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('accepts GitHub release and asset hosts', async () => {
    mockFetchOk(manifest());
    expect(await fetchUpdateManifest()).not.toBeNull();

    mockFetchOk(
      manifest({
        apkUrl:
          'https://objects.githubusercontent.com/x/y/a.apk',
      }),
    );
    expect(await fetchUpdateManifest()).not.toBeNull();
  });

  it('returns null when the request rejects', async () => {
    vi.mocked(CapacitorHttp.get).mockRejectedValue(
      new Error('offline'),
    );
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('rejects a non-https apkUrl', async () => {
    // The sideloaded APK must come from a TLS URL — a
    // plaintext http:// link is trivially mitm-able.
    mockFetchOk(manifest({ apkUrl: 'http://x/y.apk' }));
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('rejects an apkUrl from a non-GitHub host', async () => {
    mockFetchOk(
      manifest({ apkUrl: 'https://evil.example.com/a.apk' })
    );
    expect(await fetchUpdateManifest()).toBeNull();
  });

  it('accepts github.com and *.githubusercontent.com apkUrls',
    async () => {
      mockFetchOk(
        manifest({ apkUrl: 'https://github.com/o/r/a.apk' })
      );
      expect(await fetchUpdateManifest()).not.toBeNull();
      mockFetchOk(
        manifest({
          apkUrl:
            'https://objects.githubusercontent.com/a.apk',
        })
      );
      expect(await fetchUpdateManifest()).not.toBeNull();
    });

  it('currently accepts a non-integer versionCode', async () => {
    // FIXME: isUpdateManifest checks `typeof versionCode ===
    // 'number'` only — fractional codes pass even though
    // Android versionCode is an integer.
    mockFetchOk(manifest({ versionCode: 42.5 }));
    const result = await fetchUpdateManifest();
    expect(result?.versionCode).toBe(42.5);
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
    expect(await checkForUpdates()).toEqual({ kind: 'skipped' });
    expect(CapacitorHttp.get).not.toHaveBeenCalled();
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
    vi.mocked(CapacitorHttp.get).mockRejectedValue(
      new Error('offline'),
    );
    expect(await checkForUpdates()).toEqual({ kind: 'error' });
  });

  it('does not burn the throttle on a failed check', async () => {
    vi.mocked(CapacitorHttp.get)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        status: 200,
        data: manifest({ versionCode: 41 }),
        headers: {},
        url: UPDATE_MANIFEST_URL,
      });

    expect(await checkForUpdates()).toEqual({ kind: 'error' });
    // The failed check left no throttle mark, so the next call
    // retries immediately instead of waiting an hour.
    expect(shouldCheckForUpdates()).toBe(true);
    expect((await checkForUpdates()).kind).toBe('update');
    expect(CapacitorHttp.get).toHaveBeenCalledTimes(2);
  });

  it('force bypasses the throttle', async () => {
    markUpdateChecked();
    mockFetchOk(manifest({ versionCode: 41 }));
    const result = await checkForUpdates({ force: true });
    expect(result.kind).toBe('update');
  });
});
