import { Capacitor } from '@capacitor/core';
import { BackgroundMode } from '@anuradev/capacitor-background-mode';

/**
 * Native (Capacitor) helpers that keep the WebView's JS alive while
 * audio plays with the screen off. On Android a WebView is frozen a
 * few minutes after screen-off unless the app runs a foreground
 * service — this module wraps @anuradev/capacitor-background-mode
 * and the one-time battery-optimization exemption prompt.
 */

const BATTERY_PROMPT_KEY = 'android_battery_prompt_shown';

export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const ensureNotificationPermission = async (): Promise<void> => {
  try {
    const status =
      await BackgroundMode.checkNotificationsPermission();
    if (status.notifications !== 'granted') {
      await BackgroundMode.requestNotificationsPermission();
    }
  } catch (err) {
    console.warn('Notification permission check failed:', err);
  }
};

// Android shows a system dialog for ACTION_REQUEST_IGNORE_BATTERY_
// OPTIMIZATIONS — ask only once per install.
const promptBatteryExemptionOnce = async (): Promise<void> => {
  try {
    if (localStorage.getItem(BATTERY_PROMPT_KEY)) return;
    localStorage.setItem(BATTERY_PROMPT_KEY, '1');
    const { enabled } =
      await BackgroundMode.checkBatteryOptimizations();
    if (enabled) {
      await BackgroundMode.requestDisableBatteryOptimizations();
    }
  } catch (err) {
    console.warn('Battery optimization check failed:', err);
  }
};

/**
 * Start the keep-alive foreground service. `disableWebViewOptimiza-
 * tion` makes the plugin re-dispatch View.VISIBLE to the WebView so
 * its JS (chapter advancement, media handlers) is not frozen while
 * backgrounded.
 */
export const enableAudioKeepAlive = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    await ensureNotificationPermission();
    const { enabled } = await BackgroundMode.isEnabled();
    if (!enabled) {
      await BackgroundMode.enable({
        title: 'Bible Research',
        text: 'Audio playback in progress',
        channelName: 'Audio playback',
        channelDescription:
          'Keeps audio playing while the screen is off',
        disableWebViewOptimization: true,
      });
    } else {
      await BackgroundMode.disableWebViewOptimizations();
    }
    await promptBatteryExemptionOnce();
  } catch (err) {
    console.warn('Failed to enable audio keep-alive:', err);
  }
};

export const disableAudioKeepAlive = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    const { enabled } = await BackgroundMode.isEnabled();
    if (enabled) {
      await BackgroundMode.disable();
    }
  } catch (err) {
    console.warn('Failed to disable audio keep-alive:', err);
  }
};
