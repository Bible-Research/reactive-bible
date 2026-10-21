/**
 * Shared `navigator.mediaSession` stub for tests.
 *
 * Installs a fake MediaSession on `navigator` that records
 * `setActionHandler` / `setPositionState` calls so tests can
 * assert which lock-screen controls `useMediaSession` wired up
 * and drive them directly:
 *
 *   import { stubMediaSession } from '../__tests__/mocks/mediaSession';
 *
 *   const session = stubMediaSession();
 *   // ... render / act ...
 *   session.handlers.get('nexttrack')?.({ action: 'nexttrack' });
 *   expect(session.positionStates).toEqual([
 *     { duration: 60, playbackRate: 1, position: 12 },
 *   ]);
 *   session.restore();
 *
 * `handlers` maps action name → the registered handler, or is
 * missing the key entirely once `setActionHandler(action, null)`
 * clears it — asserting `handlers.has('play') === false` verifies
 * teardown.
 */

export interface MediaSessionStub {
  /** action → currently registered handler (absent = cleared). */
  handlers: Map<string, MediaSessionActionHandler>;
  /** Every setPositionState() argument, in call order. */
  positionStates: MediaPositionState[];
  /** Restores navigator.mediaSession to its previous state. */
  restore: () => void;
}

interface FakeMediaSession {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler: (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => void;
  setPositionState: (state: MediaPositionState) => void;
}

export const stubMediaSession = (): MediaSessionStub => {
  const handlers = new Map<string, MediaSessionActionHandler>();
  const positionStates: MediaPositionState[] = [];

  const fake: FakeMediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (action, handler) => {
      if (handler === null) {
        handlers.delete(action);
      } else {
        handlers.set(action, handler);
      }
    },
    setPositionState: (state) => {
      positionStates.push(state);
    },
  };

  const hadOwn = Object.prototype.hasOwnProperty.call(
    navigator,
    'mediaSession',
  );
  const previous = hadOwn
    ? Object.getOwnPropertyDescriptor(navigator, 'mediaSession')
    : undefined;

  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    writable: true,
    value: fake,
  });

  return {
    handlers,
    positionStates,
    restore: () => {
      if (previous) {
        Object.defineProperty(navigator, 'mediaSession', previous);
      } else {
        // The property was defined by this stub on the instance;
        // delete returns navigator to "mediaSession unsupported".
        delete (navigator as { mediaSession?: unknown })
          .mediaSession;
      }
    },
  };
};
