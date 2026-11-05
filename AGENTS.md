# AGENTS.md — reactive-bible (React frontend)

Guidance for AI agents working in this repository. Trust the code
over docs that disagree — `DEVELOPER_GUIDE.md` still lists
components that no longer exist (e.g. MyNavbar, PassageView,
Verse, SearchModal, TranslationSelector, AddTagNoteModal/
EditNoteModal notes flow was reworked).

## What this is

React 18 + TypeScript SPA (Vite + SWC, Mantine v6, Zustand, TipTap,
Howler). Deployed on Vercel; Capacitor wrapper for Android.
Talks to the `bible_research` Django API.

## Layout (actual)

- `src/api/` — every backend call lives here, split by domain
  (`errors`, `structure`, `verses`, `audio`, `translations`,
  `notes`, `tags`, `comments`, `search`, `readingPositions`);
  `index.ts` is the barrel — always import from `'../api'`,
  never a leaf, so `vi.mock('../api')` keeps intercepting.
- `src/config.ts` — `API_BASE_URL` from `VITE_API_BASE_URL`, else
  the production App Engine host. ALWAYS use it; never hardcode
  the host. MSW handlers and tests derive from the same config.
- `src/store.ts` — main persisted Zustand store (`bible-storage`,
  schema v5, custom `migratePersistedState` — bump version when
  persisted shape changes). Composition root; notes
  orchestration in `src/stores/bibleStore/notesSlice.ts`,
  partialize/migration in `src/stores/bibleStore/persistence.ts`.
- `src/stores/authStore.ts` — auth state (token, user, login,
  register, logout).
- `src/utils/apiClient.ts` — `publicFetch` (attaches token if
  present; a 401 retries once anonymously — a stale token must
  not break public content — and never logs out) vs
  `authenticatedFetch` (401 → logout + "session expired"
  notification). Network-failure retry only fires for
  idempotent methods (GET/HEAD/OPTIONS).
- `src/utils/cacheManager.ts` — 3-tier localStorage cache: verses
  (LRU, 500 cap for copyright), audio URLs (CloudFront expiry
  parsing), translations (per language).
- `src/utils/bibleUtils.ts` — USFM book metadata, testament lookup
  (drives ESV audio fileset choice: `ENGESVO1DA`/`ENGESVN1DA`).
- `src/hooks/` — audio playlist, media session, keep-alive,
  verse highlighter.
- `src/routes/` — React Router routes; canonical Bible URL is
  `/bible/JHN.3.16-18` (USFM refs, also legacy `/bible/:book/...`
  redirect).
- `src/mocks/` + `setupTests.ts` — MSW server for tests.

## Data model contracts

- Books are identified by USFM codes (`GEN`, `JHN`) internally;
  `book_name` is display-only. `toBookName()` maps id → name for
  the backend's `passage` param.
- `fileset_id` selects the provider server-side: `ENGKJV` (bundled
  `src/assets/kjv.json`, offline, audio from wordpocket.org),
  `ENGESV_API`, `LVSGLU8`/`LVSGLU8C1DA`, others → DBT.
- Verse selection is scoped: `{ scope: 'bible' | 'note:<id>',
  refs: VerseRef[] }` — a `VerseRef` is `{ bookId, chapter, verse }`.
- Backend errors carry `error`/`error_code`/`message`;
  `src/api/errors.ts` maps them to `RateLimitError`/
  `ClientInputError`/`ProviderError`/`BookNotInFilesetError`
  (coded HTTP 400 bodies -> `ClientInputError`, deliberately
  not a `ProviderError`). Preserve this — do not
  silently swallow provider failures into empty verse lists.

## Behavior notes

- Cache-first everywhere; prefetch adjacent chapters silently.
- `showAudioPlayer` is intentionally NOT persisted.
- Auth: token persisted via authStore; `authenticatedFetch` is for
  user-owned resources (notes, tags, comments), `publicFetch` for
  bible content.
- Keyboard: `/` opens search, `Escape` closes modals.

## Sentry event-stream contract

`reactive-bible-web` routes every event into one of four
streams; **`is:unresolved level:error environment:production`
is the agent-fixable bug queue** — anything else is deliberate:

- (no `reportType`) — exception events, level error. Real bugs;
  agents may fix and resolve.
- `reportType: resource-load` — warning `captureMessage` from
  `errorReporter.tsx` (missing hashed assets, dead signed
  URLs). Low-priority; usually self-healing noise.
- `reportType: user-report` — info `captureMessage` +
  `captureFeedback` from "Report a problem" (`userReport.ts`).
  Not an error queue item; investigated separately via the
  fix-sentry-issue skill.
- `reportType: media-debug` — info snapshot from the
  media-debug APK flow. Diagnostics only, read-only.
- `reportType: app-update` — info events from the APK's
  sideload updater (`src/utils/updateTelemetry.ts`):
  `updateStep: download-opened` (user tapped Update) and
  `updateStep: installed` (app started on a higher
  versionCode). Read-only diagnostics.
- `errorKind: network` — tag (not a stream) set by
  `sentryBeforeSend` on `TypeError` network failures
  ('Failed to fetch', 'Load failed', 'NetworkError…'); kept
  reportable but routable.

APK builds report too: `android-release.yml` passes the
`VITE_SENTRY_DSN` Actions secret to `npm run build` with
`VITE_APP_ENV=android` (main / `v*` release APKs) or
`android-debug` (other refs) and release
`android-<versionCode>`; events also carry a `versionCode`
tag. The web bug queue filter (`environment:production`)
therefore excludes the APK — use `environment:android` for it.

`sentryBeforeSend` (`src/utils/sentry.ts`) drops expected
noise before it reaches Sentry: `RateLimitError`,
`BookNotInFilesetError`, `AbortError`, 'Session expired',
`ChunkLoadError` / `Loading chunk N failed` / `Loading CSS
chunk` (stale tabs after a deploy), and `ResizeObserver loop`.
`ClientInputError` is deliberately kept — a malformed request
is a bug.

## Commands

```bash
# node/npm live in /opt/homebrew/bin on this machine — run
# `export PATH="/opt/homebrew/bin:$PATH"` before any npm command
npm run dev      # dev server :5173
npm run build    # tsc + vite build
npm run lint     # ESLint (must stay 0 errors, 0 warnings)
npm test -- --run  # vitest headless (98 files / 953 tests)
```

## Conventions / rules

- Max 79 chars per line — every file type. Verify with
  `awk 'length > 79 {print FNR}' file`.
- Commit format `Type: Capitalized message`; never commit to `main`;
  stage only files you changed.
- Components PascalCase, utils camelCase, constants UPPER_SNAKE.
- Functional components + hooks only (no classes); `const` over
  `let`; strict TypeScript — no `any`.
- Zustand: select narrowly (`state => state.x`) to avoid rerenders.
- Test hooks: `title="nav-book-{code}"`, `title="nav-chapter-{n}"`,
  `title="passage-verse-{chapter}-{n}"`.
- Error reporting: `showNotification` is for EXPECTED,
  contextual failures you handle (save failed, session
  expired, audio unavailable, copy succeeded). `reportError`
  (`src/utils/errorReporter.tsx`) is for UNEXPECTED/unhandled
  errors — wired globally in `main.tsx` plus `ErrorBoundary`;
  call it directly only from another global catch-all, never
  from routine catch blocks.
- Deliberate fire-and-forget promises are prefixed `void`
  (`void navigate(...)`, `void prefetch(...)`) — enforced by
  `@typescript-eslint/no-floating-promises`. If a floating
  promise is a bug, `await` it instead.
- `fetchJson` (`src/utils/apiClient.ts`) is the shared
  fetch→JSON helper for endpoints whose error handling is
  just "throw on !ok". Keep custom `try/catch` only where the
  endpoint has a richer contract (typed provider errors, 409
  bodies, 204s, swallowed failures).
- Commit after each completed plan step; update
  `DEVELOPER_GUIDE.md` after functionality changes.

## Known gaps (do NOT "fix" without asking)

- Comment image endpoints ARE consumed by
  `CommentThread`/`CommentForm`/`CommentNode`; reading positions
  are consumed too (book-name keyed, auth-gated; see
  `readingPositions` in `src/store.ts`).
- KJV audio is fetched from wordpocket.org directly, not the API.

## Android / Play Protect

- `@anuradev/capacitor-background-mode` is patched via
  `patch-package` (`patches/`, `postinstall`) and pinned to
  exactly `8.1.0`. Its stock manifest (`specialUse|microphone`
  FGS, SIP-call justification, battery-exemption permission)
  got sideloaded APK updates blocked as "harmful" by Play
  Protect. Never re-add a battery-optimization prompt. When
  bumping the plugin, regenerate the patch. CI fails on red-flag
  permissions — see `DEVELOPER_GUIDE.md` "Play Protect hygiene".
- Inspect a built APK's manifest without the Android SDK: use
  `unzip -p x.apk AndroidManifest.xml` and decode the binary
  XML. Check signing certs with
  `unzip -p x.apk META-INF/*.RSA | openssl pkcs7 -inform DER
  -print_certs`. Local `java`/`keytool` are macOS stubs, so
  there are no local Gradle builds; build via the
  `Android APK` workflow (`gh workflow run "Android APK"
  --ref <branch>` gives a debug APK artifact).
- `update.json`'s `apkUrl` points at a per-build
  `reactive-bible-<run_number>.apk` asset, never the reused
  `reactive-bible.apk`: overwriting a fixed-name asset deletes
  it first, so phones polling mid-publish downloaded a 404 page
  / truncated file and Android said "problem parsing the
  package". The workflow uploads APKs first and `update.json`
  in a later step, then prunes all but the newest 5 versioned
  APKs. Keep that ordering.
- **Dynamic install evidence comes from CI emulators** (no local
  Android SDK). `gh workflow run "Android install test" -R
  Bible-Research/reactive-bible [-f apk_url=<url>]` installs the
  APK fresh, as an update over v1.0.0, via the PackageInstaller
  UI and via a real Chrome download, on API 24/33/35/36; read
  `install-test-api<N>/results.txt` + logcat artifacts. Main
  builds only publish to `continuous` after this passes
  (`install-test` job in `android-release.yml`). Details in
  `DEVELOPER_GUIDE.md` "Emulator install test".
- "There was a problem parsing the package" on a phone while
  the emulator test passes means the phone opened a bad file
  (partial download, a stale `reactive-bible (1).apk`, a 404
  page saved during a publish) — not a broken APK. v97 was
  verified installing/updating on API 24-36 (2026-10-29); a
  truncated APK reproduces the exact dialog
  (`INSTALL_PARSE_FAILED_NOT_APK`).
- The `continuous` tag is moved with the refs API
  (`gh api -X PATCH …/git/refs/tags/continuous`), not
  `git push -f`: GITHUB_TOKEN pushes were rejected for lacking
  the `workflows` permission once the commit touched workflows
  (run 40890986153). The retag step is non-fatal.
