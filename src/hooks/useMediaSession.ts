import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  MediaSession as NativeMediaSession,
} from '@capgo/capacitor-media-session';
import type {
  MediaSessionAction as NativeAction,
} from '@capgo/capacitor-media-session';

/**
 * Single, centralized owner of the global `navigator.mediaSession`.
 *
 * Why this hook exists:
 * Previously two independent systems (chapter playback in `Audio.tsx` and
 * playlist playback in `useAudioPlaylist.ts`) both wrote to the single global
 * `navigator.mediaSession`. In playlist mode no action handlers were ever
 * registered, so lock-screen buttons fell through to the WebView default and
 * desynced from Howler's JS-managed <audio>. Action handlers also inline
 * `await`-ed playback promises that can hang while the tab is frozen, which
 * blocked the handler from returning and triggered Android ANR crashes.
 *
 * Design rules (critical for background stability on Android / Samsung):
 * 1. Register action handlers ONCE; read the latest callbacks from a ref so we
 *    never re-register on every render (avoids churn while backgrounded).
 * 2. Every handler is synchronous and fire-and-forget. It must return
 *    immediately and must never throw. Actual playback work is detached.
 * 3. Every MediaSession API call is wrapped in try/catch because some Android
 *    WebView versions throw `NotSupportedError` for certain actions.
 *
 * In the Capacitor shell the same calls are mirrored to the native
 * Android MediaSession via @capgo/capacitor-media-session, so the
 * lock-screen media notification and hardware buttons keep working
 * even when the WebView's own media session is not surfaced by the OS.
 */

export interface MediaSessionMetadata {
  title: string;
  artist: string;
  album?: string;
  artwork?: MediaImage[];
}

export interface MediaSessionControls {
  play: () => void;
  pause: () => void;
  stop?: () => void;
  /** Real track navigation (playlist). Falls back to seek when absent. */
  nextTrack?: () => void;
  previousTrack?: () => void;
  /** Absolute seek, in seconds. */
  seekTo?: (time: number) => void;
  /** Relative seek, in seconds (may be negative). */
  seekBy?: (offset: number) => void;
}

export interface MediaSessionPosition {
  duration: number;
  position: number;
  playbackRate?: number;
}

export interface UseMediaSessionParams {
  /** True when there is active audio to control. */
  active: boolean;
  isPlaying: boolean;
  metadata: MediaSessionMetadata | null;
  controls: MediaSessionControls;
  getPosition?: () => MediaSessionPosition | null;
}

const isSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'mediaSession' in navigator;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Native plugin calls are best-effort — ignore rejections.
const ignoreRejection = (): undefined => undefined;

const safeSetHandler = (
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void => {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Action unsupported on this platform; safe to ignore.
  }
};

const ALL_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
];

export const useMediaSession = ({
  active,
  isPlaying,
  metadata,
  controls,
  getPosition,
}: UseMediaSessionParams): void => {
  // Keep latest callbacks/data in refs so handlers register only once.
  const controlsRef = useRef(controls);
  const getPositionRef = useRef(getPosition);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    getPositionRef.current = getPosition;
  }, [getPosition]);

  // Push the latest position to the OS. Stable identity (reads from refs) so
  // it can be called from action handlers without re-registering them.
  const updatePositionState = useCallback(() => {
    const pos = getPositionRef.current?.();
    if (!pos) return;
    const { duration, position, playbackRate = 1 } = pos;
    if (
      !(
        duration > 0 &&
        Number.isFinite(position) &&
        position >= 0 &&
        position <= duration
      )
    ) {
      return;
    }
    if (isSupported()) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate,
          position,
        });
      } catch {
        // ignore invalid position states
      }
    }
    if (isNative()) {
      void NativeMediaSession.setPositionState({
        duration,
        playbackRate,
        position,
      }).catch(ignoreRejection);
    }
  }, []);

  // Register action handlers once per active session.
  useEffect(() => {
    if (!active) return;
    const native = isNative();
    if (!isSupported() && !native) return;

    // Shared dispatch used by both the web Media Session handlers and
    // the native plugin handlers. Must return immediately and never
    // throw: prevents Android ANR.
    const dispatch = (
      action: MediaSessionAction,
      details: { seekTime?: number | null; seekOffset?: number | null },
    ): void => {
      try {
        const c = controlsRef.current;
        switch (action) {
          case 'play':
            c.play();
            break;
          case 'pause':
            c.pause();
            break;
          case 'stop':
            (c.stop ?? c.pause)();
            break;
          case 'previoustrack':
            if (c.previousTrack) c.previousTrack();
            else {
              c.seekBy?.(-10);
              updatePositionState();
            }
            break;
          case 'nexttrack':
            if (c.nextTrack) c.nextTrack();
            else {
              c.seekBy?.(10);
              updatePositionState();
            }
            break;
          case 'seekbackward':
            c.seekBy?.(-(details.seekOffset ?? 10));
            updatePositionState();
            break;
          case 'seekforward':
            c.seekBy?.(details.seekOffset ?? 10);
            updatePositionState();
            break;
          case 'seekto':
            if (details.seekTime != null) {
              c.seekTo?.(details.seekTime);
              updatePositionState();
            }
            break;
        }
      } catch (err) {
        console.warn('MediaSession handler error:', err);
      }
    };

    if (isSupported()) {
      const wrap = (
        action: MediaSessionAction,
      ): MediaSessionActionHandler => (details) =>
        dispatch(action, details);

      safeSetHandler('play', wrap('play'));
      safeSetHandler('pause', wrap('pause'));
      safeSetHandler('stop', wrap('stop'));
      safeSetHandler('previoustrack', wrap('previoustrack'));
      safeSetHandler('nexttrack', wrap('nexttrack'));
      safeSetHandler('seekbackward', wrap('seekbackward'));
      safeSetHandler('seekforward', wrap('seekforward'));
      safeSetHandler('seekto', wrap('seekto'));
    }

    if (native) {
      ALL_ACTIONS.forEach((action) => {
        void NativeMediaSession.setActionHandler(
          { action: action as NativeAction },
          (details) => dispatch(action, details),
        ).catch(ignoreRejection);
      });
    }

    return () => {
      if (isSupported()) {
        ALL_ACTIONS.forEach((a) => safeSetHandler(a, null));
      }
      if (native) {
        ALL_ACTIONS.forEach((action) => {
          void NativeMediaSession.setActionHandler(
            { action: action as NativeAction },
            null,
          ).catch(ignoreRejection);
        });
      }
    };
  }, [active, updatePositionState]);

  // Metadata sync (only when the displayed values actually change).
  useEffect(() => {
    if (!active || !metadata) {
      if (isSupported()) {
        try {
          navigator.mediaSession.metadata = null;
        } catch {
          // ignore
        }
      }
      return;
    }
    if (isSupported()) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album ?? 'Bible Audio',
          artwork: metadata.artwork,
        });
      } catch (err) {
        console.warn('MediaSession metadata error:', err);
      }
    }
    if (isNative()) {
      void NativeMediaSession.setMetadata({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album ?? 'Bible Audio',
        artwork: metadata.artwork,
      }).catch(ignoreRejection);
    }
    // Intentionally key on primitive fields, not the `metadata` object
    // identity, so a new object with identical values does not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    metadata?.title,
    metadata?.artist,
    metadata?.album,
  ]);

  // Playback state sync.
  useEffect(() => {
    const state = !active ? 'none' : isPlaying ? 'playing' : 'paused';
    if (isSupported()) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch {
        // ignore
      }
    }
    if (isNative()) {
      void NativeMediaSession.setPlaybackState({
        playbackState: state,
      }).catch(ignoreRejection);
    }
  }, [active, isPlaying]);

  // Position state sync: lightweight 1s poll while playing. Reads the latest
  // position from a ref so this effect never re-registers on track changes.
  useEffect(() => {
    if ((!isSupported() && !isNative()) || !active) return;

    updatePositionState();
    if (!isPlaying) return;
    const timer = setInterval(updatePositionState, 1000);
    return () => clearInterval(timer);
  }, [active, isPlaying, updatePositionState]);
};
