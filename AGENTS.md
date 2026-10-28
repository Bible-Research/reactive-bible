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
- `errorKind: network` — tag (not a stream) set by
  `sentryBeforeSend` on `TypeError` network failures
  ('Failed to fetch', 'Load failed', 'NetworkError…'); kept
  reportable but routable.

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
