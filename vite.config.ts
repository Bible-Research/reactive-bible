/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Sourcemap upload is enabled only when CI (Vercel) provides all
// three Sentry env vars — they are secrets, never VITE_-prefixed.
// Local and CI builds without them produce identical output.
const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
);

// TEMPORARY diagnostic: print which Sentry env vars this build
// environment provides — presence only, never values. import.
// meta.env.VITE_* is populated from process.env AND .env files,
// so both sources are checked. Remove once the Vercel env
// wiring is verified end-to-end.
const fileEnv = {
  ...loadEnv('production', process.cwd(), 'VITE_'),
  ...loadEnv('development', process.cwd(), 'VITE_'),
};
console.log('[sentry-env-debug]', {
  'process.env.VITE_SENTRY_DSN': Boolean(
    process.env.VITE_SENTRY_DSN
  ),
  'env-file VITE_SENTRY_DSN': Boolean(fileEnv.VITE_SENTRY_DSN),
  VERCEL_ENV: process.env.VERCEL_ENV ?? '(unset)',
  VERCEL_GIT_COMMIT_SHA: Boolean(
    process.env.VERCEL_GIT_COMMIT_SHA
  ),
  SENTRY_AUTH_TOKEN: Boolean(process.env.SENTRY_AUTH_TOKEN),
  SENTRY_ORG: process.env.SENTRY_ORG ?? '(unset)',
  SENTRY_PROJECT: process.env.SENTRY_PROJECT ?? '(unset)',
  sentryUploadEnabled,
});

const sentryPlugins = sentryUploadEnabled
  ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          // Vercel exposes the deployed commit; without it the
          // plugin falls back to git auto-detection.
          name: process.env.VERCEL_GIT_COMMIT_SHA,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
    ]
  : [];

export default defineConfig({
  plugins: [react(), ...sentryPlugins],
  define: {
    // Vercel exposes VERCEL_ENV ('production' | 'preview' |
    // 'development') to the build env; baking it into the
    // bundle makes preview deploys report Sentry environment
    // 'preview' with zero Vercel-dashboard config. A manually
    // set VITE_APP_ENV takes precedence (e.g. a 'staging' label
    // on a non-Vercel deploy). Both unset locally, so this
    // defines '' and the runtime falls back to Vite's MODE.
    'import.meta.env.VITE_APP_ENV': JSON.stringify(
      process.env.VITE_APP_ENV ?? process.env.VERCEL_ENV ?? ''
    ),
    // Vercel exposes VERCEL_GIT_COMMIT_SHA to the build env;
    // baking it into the bundle lets main.tsx set Sentry's
    // `release` even when the vite plugin's release upload is
    // disabled (no SENTRY_AUTH_TOKEN), so every event maps to a
    // commit. A manually set VITE_APP_RELEASE takes precedence.
    'import.meta.env.VITE_APP_RELEASE': JSON.stringify(
      process.env.VITE_APP_RELEASE ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        ''
    ),
  },
  build: {
    // 'hidden': maps are emitted for Sentry's upload but not
    // linked from the bundle, so browsers never fetch them.
    // Only worth emitting when upload actually runs — with no
    // SENTRY_* vars the .map files would ship publicly.
    sourcemap: sentryUploadEnabled ? 'hidden' : false,
    // rolldown-vite: `manualChunks`/`advancedChunks` are
    // deprecated; codeSplitting.groups is the supported API.
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Deliberately no vendor-tiptap group: TipTap +
          // ProseMirror are only reachable from lazy chunks
          // (note modals, note routes), so automatic
          // splitting already keeps them lazy. A manual group
          // with the default includeDependenciesRecursively
          // dragged their whole dep closure (react,
          // @mantine/*, ~690KB) into a chunk that index.html
          // modulepreloaded — defeating the lazy-modal work.
          groups: [
            {
              // Declared before vendor-mantine so react —
              // a dependency of every @mantine package —
              // lands here instead of being captured by
              // vendor-mantine's recursive dep inclusion.
              name: 'vendor-react',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(react|react-dom|scheduler|' +
                  'react-router-dom|react-router)[\\\\/]'
              ),
            },
            {
              // @mantine/tiptap is excluded (negative
              // lookahead) — it belongs to the lazy editor
              // graph; capturing it here would pull all of
              // TipTap into this eagerly loaded chunk.
              name: 'vendor-mantine',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(?!@mantine[\\\\/]tiptap)' +
                  '(@mantine|@emotion|@floating-ui)[\\\\/]'
              ),
            },
            {
              name: 'vendor-howler',
              test: /node_modules[\\/]howler[\\/]/,
            },
            {
              name: 'vendor-dndkit',
              test: /node_modules[\\/]@dnd-kit[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 30000,
    // Files run sequentially on purpose: several suites mount the
    // full <App/> tree (which eagerly bundles kjv.json's ~31k
    // verses), so parallel workers peak well past the default heap
    // and die with ERR_WORKER_OUT_OF_MEMORY. Serial execution keeps
    // peak memory in bounds at the cost of wall-clock time.
    fileParallelism: false,
  },
});
