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

/**
 * Feature gate for the note-sharing surfaces (`/shared`,
 * `/bookmarks`, targeted share/copy/bookmark actions). The
 * UI reached `main` ahead of its backend — the endpoints it
 * calls (`/notes/shared-with-me/`, `/notes/bookmarks/`,
 * `/notes/<id>/share(s)/`, `…/copy/`) exist only on the
 * unmerged backend PR bible_research#163, so every call is a
 * guaranteed 404 on production and Android builds (Sentry
 * REACTIVE-BIBLE-WEB-15). Keep the surfaces visible in dev
 * and on Vercel previews where the feature is being
 * exercised; remove this gate once the backend ships and the
 * flag can go away entirely.
 */
export const isNoteSharingEnabled = (): boolean =>
  import.meta.env.DEV || isPreviewDeploy();
