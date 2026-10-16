import { Capacitor } from '@capacitor/core';

/**
 * Platform detection for the Capacitor Android shell.
 *
 * Kept separate from `nativeAudio.ts` so importing this check does
 * not pull `@anuradev/capacitor-background-mode` into the entry
 * chunk — the plugin code is only fetched when the keep-alive
 * helpers actually run on a native build.
 */
export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
