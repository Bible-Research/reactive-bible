import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundMode } from '@anuradev/capacitor-background-mode';
import {
  disableAudioKeepAlive,
  enableAudioKeepAlive,
} from './nativeAudio';
import { isNativeApp } from './platform';

/**
 * Capacitor's registerPlugin returns a Proxy whose get-trap yields a
 * callable method wrapper for EVERY property — including `then` —
 * making the plugin object an accidental thenable. This mock mirrors
 * that: if a promise ever resolves with `BackgroundMode` itself, the
 * promise machinery calls `BackgroundMode.then()` and it throws,
 * just like the unimplemented-method error reported on Android.
 */
vi.mock('@anuradev/capacitor-background-mode', () => ({
  BackgroundMode: {
    then: vi.fn(),
    checkNotificationsPermission: vi.fn(),
    requestNotificationsPermission: vi.fn(),
    checkBatteryOptimizations: vi.fn(),
    requestDisableBatteryOptimizations: vi.fn(),
    isEnabled: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    disableWebViewOptimizations: vi.fn(),
  },
}));

vi.mock('./platform', () => ({
  isNativeApp: vi.fn(),
}));

const mocked = vi.mocked(BackgroundMode);
const thenable = BackgroundMode as unknown as {
  then: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(isNativeApp).mockReturnValue(true);
  thenable.then.mockImplementation(() => {
    throw new Error(
      '"BackgroundMode.then()" is not implemented on android',
    );
  });
  mocked.checkNotificationsPermission.mockResolvedValue({
    notifications: 'granted',
  });
  mocked.checkBatteryOptimizations.mockResolvedValue({
    enabled: false,
  });
  mocked.isEnabled.mockResolvedValue({ enabled: false });
});

describe('enableAudioKeepAlive', () => {
  it('enables the service without invoking .then on the plugin',
    async () => {
      await expect(
        enableAudioKeepAlive(),
      ).resolves.toBeUndefined();
      expect(mocked.enable).toHaveBeenCalled();
      expect(thenable.then).not.toHaveBeenCalled();
    });

  it('refreshes WebView optimizations when already enabled',
    async () => {
      mocked.isEnabled.mockResolvedValue({ enabled: true });
      await enableAudioKeepAlive();
      expect(mocked.enable).not.toHaveBeenCalled();
      expect(
        mocked.disableWebViewOptimizations,
      ).toHaveBeenCalled();
    });

  it('requests notification permission when not granted',
    async () => {
      mocked.checkNotificationsPermission.mockResolvedValue({
        notifications: 'denied',
      });
      await enableAudioKeepAlive();
      expect(
        mocked.requestNotificationsPermission,
      ).toHaveBeenCalled();
    });

  it('prompts for the battery exemption only once', async () => {
    mocked.checkBatteryOptimizations.mockResolvedValue({
      enabled: true,
    });
    await enableAudioKeepAlive();
    await enableAudioKeepAlive();
    expect(
      mocked.requestDisableBatteryOptimizations,
    ).toHaveBeenCalledTimes(1);
  });

  it('warns instead of throwing when the plugin rejects',
    async () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      mocked.isEnabled.mockRejectedValue(
        new Error('plugin is not implemented'),
      );
      await expect(
        enableAudioKeepAlive(),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
});

describe('disableAudioKeepAlive', () => {
  it('disables the service when it is running', async () => {
    mocked.isEnabled.mockResolvedValue({ enabled: true });
    await disableAudioKeepAlive();
    expect(mocked.disable).toHaveBeenCalled();
    expect(thenable.then).not.toHaveBeenCalled();
  });

  it('skips disable when the service is not running', async () => {
    await disableAudioKeepAlive();
    expect(mocked.disable).not.toHaveBeenCalled();
  });
});

describe('non-native platforms', () => {
  it('does not touch the plugin in the browser', async () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    await enableAudioKeepAlive();
    await disableAudioKeepAlive();
    expect(mocked.isEnabled).not.toHaveBeenCalled();
  });
});
