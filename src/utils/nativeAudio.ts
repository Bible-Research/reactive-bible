import { isNativeApp } from './platform';

/**
 * Native (Capacitor) helpers that keep the WebView's JS alive while
 * audio plays with the screen off. On Android a WebView is frozen a
 * few minutes after screen-off unless the app runs a foreground
 * service — this module wraps @anuradev/capacitor-background-mode.
 *
 * The plugin is patched (patches/@anuradev+capacitor-background-
 * mode+*.patch) to run a `mediaPlayback` service with no battery-
 * exemption or keyguard code: its stock `specialUse|microphone`
 * service, SIP-call justification and battery prompt got sideloaded
 * updates flagged as harmful by Play Protect. Do not reintroduce a
 * battery-optimization prompt.
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
  } catch (err) {
    console.warn('Failed to enable audio keep-alive:', err);
  }
};

export const disableAudioKeepAlive = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    const { BackgroundMode } = await loadBackgroundMode();
    const { enabled } = await BackgroundMode.isEnabled();
    if (enabled) {
      await BackgroundMode.disable();
    }
  } catch (err) {
    console.warn('Failed to disable audio keep-alive:', err);
  }
};
