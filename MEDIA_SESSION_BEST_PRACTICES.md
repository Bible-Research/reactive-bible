# Media Session API Best Practices for React PWAs

## Core Principle

**Media Session action handlers must be synchronous,
fire-and-forget, and never throw.** The single owner is
`useMediaSession` (`src/hooks/useMediaSession.ts`), wired once in
`Audio.tsx` for both chapter and playlist playback.

Why: on Android the WebView can be frozen on the lock screen. A
handler that `await`s a playback promise may never return, which
blocks the main thread and triggers ANR crashes. All playback
work is dispatched to fire-and-forget callbacks instead.

---

## DO: Single owner for `navigator.mediaSession`

`navigator.mediaSession` is a global singleton. Registering
handlers from multiple components produces stale or duplicated
owners. `useMediaSession` registers all action handlers once per
active session and reads the latest callbacks from refs:

```typescript
const controlsRef = useRef(controls);
useEffect(() => {
  controlsRef.current = controls;
}, [controls]);
```

**Why:** refs don't trigger re-renders and never re-register
handlers mid-session, which matters while backgrounded.

---

## DO: Keep handlers synchronous — never await inside them

```typescript
// GOOD: handler returns immediately, work is detached
const dispatch = (action, details) => {
  try {
    const c = controlsRef.current;
    if (action === 'play') c.play();   // fire-and-forget
  } catch (err) {
    console.warn('MediaSession handler error:', err);
  }
};
```

Note: Howler's html5 `play()` returns a sound **id** (number),
not a promise — the underlying `<audio>` element's play promise
is managed internally and rejections surface via `onplayerror`.
There is nothing to await; the handler just kicks the work off.

```typescript
// BAD: awaiting inside a handler can hang forever on a frozen
// lock-screen renderer and never lets the handler return.
navigator.mediaSession.setActionHandler('play', async () => {
  await audio.play(); // ANR risk — do NOT do this
});
```

---

## DO: Call setState from handlers if needed — but return fast

An earlier revision of this doc claimed state updates must never
run inside handlers. The real constraint is **blocking**: a
synchronous `setIsPlaying(...)` is fine — React batches it and the
handler still returns immediately. What is dangerous is awaiting
promises or doing heavy synchronous work.

```typescript
const safePlay = useCallback(() => {
  const currentAudio = audioRef.current;
  if (!currentAudio || currentAudio.playing()) return;
  try {
    currentAudio.play();       // returns a number, not a promise
    isPlayingRef.current = true;
    setIsPlaying(true);        // synchronous — handler stays fast
  } catch (err) {
    console.warn('Play operation failed:', err);
  }
}, []);
```

---

## DO: Wrap every MediaSession API call in try/catch

Some Android WebView versions throw `NotSupportedError` for
certain actions or invalid `setPositionState` values. Validate
position data before sending (`duration > 0`,
`0 <= position <= duration`, all finite) and never let a call
escape the hook's try/catch.

---

## DO: Clean up handlers and metadata

```typescript
return () => {
  ALL_ACTIONS.forEach((a) => safeSetHandler(a, null));
};
```

On deactivate also clear `mediaSession.metadata = null` and set
`playbackState = 'none'` — and mirror an empty
`setMetadata({title: '', artist: '', album: '', artwork: []})`
to the native plugin (it has no dedicated clear call).

---

## DO: Prefer the native plugin's handlers on Capacitor

In the Capacitor shell, `@capgo/capacitor-media-session` mirrors
metadata/state/position to the Android MediaSession. Action
**handlers** are registered only on the native side when
`Capacitor.isNativePlatform()` — registering both web and native
handlers can double-dispatch `seekBy`/`nexttrack` if the OS also
surfaces the WebView's media session.

---

## DON'T: Create circular dependencies

```typescript
// BAD: isPlaying is both a dependency and modified inside
useEffect(() => {
  navigator.mediaSession.setActionHandler('play', () => {
    setIsPlaying(true);
  });
}, [isPlaying]);

// GOOD: register once; read latest state from refs
useEffect(() => {
  navigator.mediaSession.setActionHandler('play', () =>
    controlsRef.current.play(),
  );
}, []);
```

---

## Testing Checklist

### Lock Screen Testing

- [ ] Play/pause from lock screen
- [ ] Seek forward/backward from lock screen
- [ ] Drag seek bar on lock screen
- [ ] Rapid tapping of controls
- [ ] Unlock device after interaction

### Headphone Controls

- [ ] Play/pause button
- [ ] Next/previous track buttons
- [ ] Seek buttons (if available)

### Car Stereo

- [ ] Bluetooth controls
- [ ] Android Auto integration

### Performance

- [ ] No ANR crashes
- [ ] No UI freezing
- [ ] Smooth audio playback
- [ ] Responsive controls

---

## Common Pitfalls

| Issue | Symptom | Fix |
|-------|---------|-----|
| Awaiting in handlers | ANR on lock screen | Fire-and-forget |
| Multiple handler owners | Desynced controls | `useMediaSession` only |
| Missing cleanup | Stale handlers fire | Clear in effect return |
| Circular dependencies | Infinite re-renders | Refs, not state deps |
| Invalid position state | API throws | Validate range/finite |
| Web+native handlers | Double seeks/skips | Native only on Capacitor |

---

## Resources

- [Media Session API Spec](https://w3c.github.io/mediasession/)
- Android media session guide:
  developer.android.com/guide/topics/media-apps/
  working-with-a-media-session
- [React useRef Documentation](https://react.dev/reference/react/useRef)
- [Howler.js API](https://github.com/goldfire/howler.js#documentation)

---

**Remember:** the key to preventing ANR crashes is handlers that
**return immediately** — synchronous, fire-and-forget, and
never throwing. Detached functions own the actual playback work.
