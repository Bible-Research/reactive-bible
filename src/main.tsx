import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { API_BASE_URL } from './config'
import { initGlobalErrorHandlers } from './utils/errorReporter'
import {
  initMediaDebug,
  isMediaDebugEnabled,
} from './utils/mediaDebug'
import { isNativeApp } from './utils/platform'
import { sentryBeforeSend } from './utils/sentry'

// Sentry stays a complete no-op unless a DSN is provided:
// tests, `npm run dev`, and preview builds without
// VITE_SENTRY_DSN send nothing.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as
  string | undefined
// Set by the Android workflow (commit sha). Vercel builds leave
// it unset so the sourcemap plugin's injected release wins.
const sentryRelease = import.meta.env.VITE_APP_RELEASE as
  string | undefined
const mediaDebug = isMediaDebugEnabled()
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    ...(sentryRelease ? { release: sentryRelease } : {}),
    initialScope: {
      tags: { platform: isNativeApp() ? 'native' : 'web' },
    },
    // Media-debug builds keep a long lock-screen trail and queue
    // events in IndexedDB while the locked phone is offline.
    ...(mediaDebug
      ? {
          maxBreadcrumbs: 300,
          transport: Sentry.makeBrowserOfflineTransport(
            Sentry.makeFetchTransport,
          ),
        }
      : {}),
    // vite.config.ts bakes Vercel's VERCEL_ENV into
    // VITE_APP_ENV at build time ('' when unset, e.g. local
    // builds) — `||`, not `??`, so the empty string falls back
    // to Vite's MODE ('development' locally, 'production' for
    // non-Vercel prod builds).
    environment:
      (import.meta.env.VITE_APP_ENV as string | undefined) ||
      import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Free tier ~= 50 replays/mo: record only sessions that hit
      // an error (0 ambient sampling, 1.0 on-error). Text and
      // media are masked — verse text and notes are user content.
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    tracePropagationTargets: [API_BASE_URL],
    tracesSampleRate: 0.1,
    beforeSend: sentryBeforeSend,
  })
}

initGlobalErrorHandlers()
initMediaDebug()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
