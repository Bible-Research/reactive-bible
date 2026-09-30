import { useEffect, useRef } from 'react';
import {
  disableAudioKeepAlive,
  enableAudioKeepAlive,
  isNativeApp,
} from '../utils/nativeAudio';

// How long to keep the foreground service running while paused
// before releasing it (the user may resume from the lock screen).
const PAUSE_KEEPALIVE_MS = 5 * 60 * 1000;

/**
 * Keeps the app's WebView alive in the Capacitor Android shell while
 * audio is active: starts a foreground service on play and releases
 * it on stop or after a pause timeout. No-op in the browser.
 */
export const useAudioKeepAlive = (
  active: boolean,
  isPlaying: boolean,
): void => {
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!isNativeApp()) return;

    const clearPauseTimer = () => {
      if (pauseTimerRef.current !== null) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
    };

    if (!active) {
      clearPauseTimer();
      void disableAudioKeepAlive();
      return;
    }

    if (isPlaying) {
      clearPauseTimer();
      void enableAudioKeepAlive();
      return;
    }

    // Paused but session still active: keep alive briefly so a
    // lock-screen resume is instant, then release the service.
    pauseTimerRef.current = setTimeout(() => {
      pauseTimerRef.current = null;
      void disableAudioKeepAlive();
    }, PAUSE_KEEPALIVE_MS);

    return clearPauseTimer;
  }, [active, isPlaying]);
};
