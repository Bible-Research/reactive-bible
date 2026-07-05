# Media Session API Best Practices for React PWAs

## 🎯 **Core Principle**
**Never trigger React state updates directly from Media Session handlers when the app is in the background.**

---

## ✅ **DO: Use Refs for Background Operations**

```typescript
const Audio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<Howl | null>(null);

  // Sync ref with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  // Media Session handlers use refs
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      // ✅ Read from ref, call async function
      const currentAudio = audioRef.current;
      if (currentAudio && !isPlayingRef.current) {
        safePlay(); // Async function handles state update
      }
    });
  }, [audio, safePlay]);
};
```

**Why:** Refs don't trigger re-renders, preventing main thread blocking.

---

## ❌ **DON'T: Call setState Directly in Handlers**

```typescript
// ❌ BAD: Direct state mutation
navigator.mediaSession.setActionHandler('play', () => {
  setIsPlaying(true); // Triggers re-render on main thread
});

// ❌ BAD: Direct audio operation
navigator.mediaSession.setActionHandler('pause', () => {
  audio.pause(); // No promise handling, can cause state locks
});
```

**Why:** State updates block the main thread, especially when the screen is locked.

---

## ✅ **DO: Handle Audio Promises Properly**

```typescript
const safePlay = useCallback(async () => {
  const currentAudio = audioRef.current;
  if (!currentAudio || isPlayingRef.current) return;

  // Wait for any pending operation
  if (pendingOperationRef.current) {
    await pendingOperationRef.current;
  }

  try {
    const playPromise = currentAudio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      pendingOperationRef.current = playPromise as Promise<void>;
      await playPromise;
      pendingOperationRef.current = null;
    }
    isPlayingRef.current = true;
    setIsPlaying(true); // Update state AFTER operation completes
  } catch (err) {
    console.warn('Play failed:', err);
    pendingOperationRef.current = null;
  }
}, []);
```

**Why:** Prevents concurrent operations and state locks.

---

## ✅ **DO: Debounce Position State Updates**

```typescript
let positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSyncPosition = () => {
  if (positionUpdateTimer) clearTimeout(positionUpdateTimer);
  positionUpdateTimer = setTimeout(() => {
    const currentAudio = audioRef.current;
    if (!currentAudio) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: currentAudio.duration(),
        playbackRate: 1,
        position: currentAudio.seek() as number,
      });
    } catch {
      // Ignore out-of-range errors
    }
  }, 100);
};

navigator.mediaSession.setActionHandler('seekto', (details) => {
  if (details.seekTime !== undefined) {
    safeSeek(details.seekTime);
    debouncedSyncPosition(); // Debounced update
  }
});
```

**Why:** Reduces main thread load during rapid seeking.

---

## ✅ **DO: Clean Up Handlers Properly**

```typescript
useEffect(() => {
  if (!('mediaSession' in navigator)) return;

  // Setup handlers
  navigator.mediaSession.setActionHandler('play', handlePlay);
  navigator.mediaSession.setActionHandler('pause', handlePause);

  return () => {
    // Clean up on unmount
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  };
}, [handlePlay, handlePause]);
```

**Why:** Prevents memory leaks and stale handlers.

---

## ✅ **DO: Sync Playback State**

```typescript
useEffect(() => {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
}, [isPlaying]);
```

**Why:** Ensures lock-screen controls show the correct state.

---

## ❌ **DON'T: Create Circular Dependencies**

```typescript
// ❌ BAD: isPlaying is both a dependency and modified inside
useEffect(() => {
  navigator.mediaSession.setActionHandler('play', () => {
    setIsPlaying(true); // Modifies dependency
  });
}, [isPlaying]); // Circular dependency

// ✅ GOOD: Remove isPlaying from dependencies
useEffect(() => {
  navigator.mediaSession.setActionHandler('play', () => {
    safePlay(); // Async function handles state
  });
}, [safePlay]); // No circular dependency
```

**Why:** Prevents infinite loops and excessive re-renders.

---

## 🧪 **Testing Checklist**

### **Lock Screen Testing**
- [ ] Play/pause from lock screen
- [ ] Seek forward/backward from lock screen
- [ ] Drag seek bar on lock screen
- [ ] Rapid tapping of controls
- [ ] Unlock device after interaction

### **Headphone Controls**
- [ ] Play/pause button
- [ ] Next/previous track buttons
- [ ] Seek buttons (if available)

### **Car Stereo**
- [ ] Bluetooth controls
- [ ] Android Auto integration

### **Performance**
- [ ] No ANR crashes
- [ ] No UI freezing
- [ ] Smooth audio playback
- [ ] Responsive controls

---

## 📊 **Common Pitfalls**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Direct `setState` in handlers | App freezes on lock screen | Use refs + async functions |
| No promise handling | Audio stutters/stops | Await audio operations |
| Missing cleanup | Stale handlers fire | Clean up in `useEffect` return |
| Circular dependencies | Infinite re-renders | Remove state from dependencies |
| Excessive position updates | Main thread lag | Debounce position state |

---

## 🔗 **Resources**

- [Media Session API Spec](https://w3c.github.io/mediasession/)
- [Android Media Session Guide](https://developer.android.com/guide/topics/media-apps/working-with-a-media-session)
- [React useRef Documentation](https://react.dev/reference/react/useRef)
- [Howler.js API](https://github.com/goldfire/howler.js#documentation)

---

## 📝 **Quick Reference Template**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

const MyAudioComponent = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOpRef = useRef<Promise<void> | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { audioRef.current = audio; }, [audio]);

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || isPlayingRef.current) return;
    if (pendingOpRef.current) await pendingOpRef.current;
    try {
      const promise = audio.play();
      if (promise) {
        pendingOpRef.current = promise;
        await promise;
        pendingOpRef.current = null;
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (err) {
      console.warn('Play failed:', err);
      pendingOpRef.current = null;
    }
  }, []);

  const safePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !isPlayingRef.current) return;
    if (pendingOpRef.current) await pendingOpRef.current;
    try {
      audio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      pendingOpRef.current = null;
    } catch (err) {
      console.warn('Pause failed:', err);
      pendingOpRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => safePlay());
    navigator.mediaSession.setActionHandler('pause', () => safePause());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
    };
  }, [safePlay, safePause]);

  return <div>Your audio UI</div>;
};
```

---

**Remember:** The key to preventing ANR crashes is to **avoid synchronous state updates in background event handlers**. Always use refs and async operations!
