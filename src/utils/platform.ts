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

/**
 * True only on Vercel preview deploys — `vite.config` bakes
 * `import.meta.env.VITE_APP_ENV` from VERCEL_ENV (`'preview'`),
 * while production resolves to `'production'` and Android
 * builds to `'android[-debug]'`. Kept behind a function so
 * tests can mock it the same way as `isNativeApp`.
 */
export const isPreviewDeploy = (): boolean =>
  (import.meta.env.VITE_APP_ENV as string | undefined) ===
  'preview';
