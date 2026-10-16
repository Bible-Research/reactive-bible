# Media Session — how it works here

Lock-screen / headphone / car-stereo media controls for audio
playback. This document describes the architecture as
implemented — read it before touching `src/hooks/
useMediaSession.ts`, `src/utils/mediaSession.ts`, or the media
wiring in `src/components/Audio.tsx`.

## Architecture

- **Single owner.** `useMediaSession` (src/hooks/
  useMediaSession.ts) is the only writer to the global
  `navigator.mediaSession` and to the native
  `@capgo/capacitor-media-session` bridge. It is wired once in
  `Audio.tsx`, covering both chapter playback and playlist
  playback — do not add a second `setActionHandler` caller
  anywhere (two owners desynced the lock screen from Howler in
  the past).
- **Pure dispatch.** `dispatchMediaAction` in
  `src/utils/mediaSession.ts` routes each action to a
  `MediaSessionControls` entry; both the web handlers and the
  native plugin handlers call it, so behavior is identical on
  lock screen, bluetooth remotes and browser media keys.
- **One registration per session.** Action handlers register
  once per `active` session and read the latest controls from
  refs, so re-renders never churn OS-level handlers while the
  page is backgrounded.

## Rules that prevent ANR / lock-screen breakage

1. **Handlers are synchronous fire-and-forget.** They return
   immediately and never throw. Howler's html5 `play()` returns
   a sound id (not a promise) and reports failures via
   `onplayerror`, so controls stay sync by design — an
   `await`-ed handler can hang on a frozen tab and block the
   main thread (observed as Android ANR).
2. **Every MediaSession API call is wrapped in try/catch.**
   Some Android WebViews throw `NotSupportedError` for
   individual actions; `dispatchMediaAction` also swallows
   control errors into `console.warn`.
3. **Guard every position push with `isValidPosition`.**
   `setPositionState` throws RangeError for `duration <= 0` or
   a position outside `[0, duration]` — states a frozen
   renderer produces. The hook also pushes position after every
   seek action and polls it at 1s while playing.
4. **Never trust `seek()` mid-load.** Use `getPlayPosition`
   (utils/audioUtils.ts): while loading it returns the Howl,
   not a number, and frozen pages produce NaN/stale values.
   Feeding those back into `seek()` corrupts the `<audio>`
   element ("stuck/broken noise" on headphone seeks).
5. **Teardown order matters.** `disposeHowl` (utils/
   audioUtils.ts) stops first so 'stop' subscribers still run,
   detaches all listeners before `unload()` so a rejected
   pending `play()` can't surface as a `playerror`, and mutes
   via `volume(0)` — `mute(true)` sets `node.muted`, which the
   html5 pool never resets and would silence the next chapter.

## Wiring contract (Audio.tsx)

- `active` = playlist active OR a chapter Howl exists;
  `isPlaying` mirrors the same source. `metadata` /
  `controls` / `getPosition` are memoized per mode — playlist
  mode forwards to `useAudioPlaylist`, chapter mode to
  `safePlay`/`safePause`/`safeSeek` and verse-aware
  next/previous.
- `stop` falls back to `pause` when absent; `previoustrack`/
  `nexttrack` fall back to a 10s `seekBy` when the session has
  no real track navigation.
- `useAudioKeepAlive` keeps the Capacitor WebView alive during
  lock-screen playback (no-op in the browser).
- Cleanup on `active -> false` clears every handler
  (`setActionHandler(action, null)` on both web and native)
  and nulls metadata.

## Testing checklist

### Lock screen (Android, Capacitor shell)

- [ ] Play/pause from the lock screen
- [ ] Seek forward/backward (10s) from the lock screen
- [ ] Drag the seek bar; position updates on the lock screen
- [ ] Chapter auto-advance while the screen stays locked
- [ ] Unlock mid-playback — controls and highlight in sync

### Headphone / bluetooth / car controls

- [ ] Play/pause button
- [ ] Next/previous (verse jumps in chapter mode, item jumps in
      playlist mode)
- [ ] No ANR or frozen WebView after rapid button presses

### Common pitfalls (learned from production bugs)

| Issue | Symptom | Guard |
|-------|---------|-------|
| Two owners of mediaSession | Playlist buttons dead | useMediaSession |
| Awaited/throwing handlers | Android ANR on frozen tab | dispatchMediaAction |
| seek() of a loading Howl | Broken noise on headphone seek | getPlayPosition |
| Invalid position state | RangeError spam | isValidPosition |
| unload() on a playing Howl | Audio plays after teardown | disposeHowl |
| mute(true) in teardown | Next chapter silent | volume(0) instead |
