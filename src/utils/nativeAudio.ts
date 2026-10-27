import { isNativeApp } from './platform';
import { trace } from './mediaDebug';

/**
 * Native (Capacitor) helpers that keep the WebView's JS alive while
 * audio plays with the screen off. On Android a WebView is frozen a
 * few minutes after screen-off unless the app runs a foreground
 * service — this module wraps @anuradev/capacitor-background-mode
 * and the one-time battery-optimization exemption prompt.
 */
/**
 * Dynamic-import the plugin lazily (this module is statically
 * reachable from the app shell, so a static import would keep the
 * plugin code in the entry chunk even though it only runs on
 * native builds) and return its namespace — NOT `m.BackgroundMode`.
 * The plugin export is a Capacitor Proxy whose get-trap returns a
 * callable method wrapper for every property, including `then`.
 * Resolving a promise with the proxy itself makes the promise
 * machinery invoke `BackgroundMode.then()`, which throws
 * "not implemented on android": that rejection is unhandled while
 * the awaiting promise never settles. Destructuring the namespace
 * keeps the proxy out of promise resolution entirely.
 */
const loadBackgroundMode = () =>
  import('@anuradev/capacitor-background-mode');

const BATTERY_PROMPT_KEY = 'android_battery_prompt_shown';

const ensureNotificationPermission = async (): Promise<void> => {
  try {
    const { BackgroundMode } = await loadBackgroundMode();
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
    const { BackgroundMode } = await loadBackgroundMode();
    const { enabled } =
      await BackgroundMode.checkBatteryOptimizations();
    // Mark the prompt shown only after the check succeeded —
    // a failed plugin call must not burn the one-time prompt.
    localStorage.setItem(BATTERY_PROMPT_KEY, '1');
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
    const { BackgroundMode } = await loadBackgroundMode();
    await ensureNotificationPermission();
    const { enabled } = await BackgroundMode.isEnabled();
    trace('keepAlive', 'enable', { wasEnabled: enabled });
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
    trace('keepAlive', 'enableFailed', { error: String(err) });
    console.warn('Failed to enable audio keep-alive:', err);
  }
};

export const disableAudioKeepAlive = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    const { BackgroundMode } = await loadBackgroundMode();
    const { enabled } = await BackgroundMode.isEnabled();
    trace('keepAlive', 'disable', { wasEnabled: enabled });
    if (enabled) {
      await BackgroundMode.disable();
    }
  } catch (err) {
    trace('keepAlive', 'disableFailed', { error: String(err) });
    console.warn('Failed to disable audio keep-alive:', err);
  }
};
