import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { API_BASE_URL } from './config'
import { initGlobalErrorHandlers } from './utils/errorReporter'
import { sentryBeforeSend } from './utils/sentry'

// Sentry stays a complete no-op unless a DSN is provided:
// tests, `npm run dev`, and preview builds without
// VITE_SENTRY_DSN send nothing.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as
  string | undefined
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
