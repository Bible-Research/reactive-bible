// src/utils/mediaSession.ts
//
// Pure helpers for the single-owner Media Session wiring in
// hooks/useMediaSession.ts — shared between the web
// `navigator.mediaSession` handlers and the native
// @capgo/capacitor-media-session bridge so both dispatch
// through identical logic.

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

/** Detail payload carried by web and native action handlers. */
export interface MediaSessionDetails {
  seekTime?: number | null;
  seekOffset?: number | null;
}

/**
 * True when a position payload is safe to hand to
 * `setPositionState` — the API throws RangeError for a zero/
 * negative duration or a position outside [0, duration], which
 * a frozen lock-screen renderer can produce.
 */
export const isValidPosition = (
  pos: MediaSessionPosition | null | undefined,
): pos is MediaSessionPosition => {
  if (!pos) return false;
  const { duration, position } = pos;
  return (
    duration > 0 &&
    Number.isFinite(position) &&
    position >= 0 &&
    position <= duration
  );
};

/**
 * Routes one OS-level media action to the matching playback
 * control. Must return immediately and never throw — the
 * handler can run while the tab/WebView is frozen, where a
 * blocked or throwing handler triggers Android ANR. Track
 * navigation falls back to a 10s relative seek when the session
 * has no real next/previous (chapter playback); every seek
 * action pushes a fresh position state so the lock-screen
 * scrubber stays in sync.
 */
export const dispatchMediaAction = (
  action: MediaSessionAction,
  details: MediaSessionDetails,
  controls: MediaSessionControls,
  updatePosition: () => void,
): void => {
  try {
    switch (action) {
      case 'play':
        controls.play();
        break;
      case 'pause':
        controls.pause();
        break;
      case 'stop':
        (controls.stop ?? controls.pause)();
        break;
      case 'previoustrack':
        if (controls.previousTrack) controls.previousTrack();
        else {
          controls.seekBy?.(-10);
          updatePosition();
        }
        break;
      case 'nexttrack':
        if (controls.nextTrack) controls.nextTrack();
        else {
          controls.seekBy?.(10);
          updatePosition();
        }
        break;
      case 'seekbackward':
        controls.seekBy?.(-(details.seekOffset ?? 10));
        updatePosition();
        break;
      case 'seekforward':
        controls.seekBy?.(details.seekOffset ?? 10);
        updatePosition();
        break;
      case 'seekto':
        if (details.seekTime != null) {
          controls.seekTo?.(details.seekTime);
          updatePosition();
        }
        break;
    }
  } catch (err) {
    console.warn('MediaSession handler error:', err);
  }
};
