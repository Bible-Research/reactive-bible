# AGENTS.md — reactive-bible (React SPA + Android app)

Agent guide for the Bible Research frontend. `CLAUDE.md` is an
older, shorter guide (partly stale — it lists components that no
longer exist, e.g. `MyNavbar`, `SearchModal`). `DEVELOPER_GUIDE.md`
has the long-form architecture doc but is also behind the code.
Trust the code; update the guide after behavior changes.

A `vercel-react-best-practices` skill lives in
`.devin/skills/` (rules in `.agents/skills/`) — consult it when
writing/refactoring React for performance.

## What this app is

- React 18 + TypeScript + Vite (SWC) SPA, Mantine v6 UI, Zustand
  state, TipTap notes editor, Howler.js audio, react-router-dom v7.
- Also ships as an Android app via Capacitor
  (`capacitor.config.ts`, `android/`, `utils/nativeAudio.ts`).
- Deployed on Vercel; talks to the Django API (`bible_research`
  repo). Default API host is the App Engine URL in
  `src/config.ts`; override with `VITE_API_BASE_URL`.

## Commands

```bash
npm run dev       # vite dev server :5173
npm run build     # tsc + vite build (typecheck gate)
npm run lint      # eslint, --max-warnings 0 (zero warnings allowed)
npm test          # vitest run — already headless/CI, exits once
npm run coverage  # vitest run --coverage
```

`npm test` already runs `vitest run` (no watch). Do not use
`npm run test:ui` in automation — it opens an interactive UI.

## Layout

```
src/
├── api.tsx             # all backend calls + local KJV data helpers
├── store.tsx           # useBibleStore (Zustand, persisted v3)
├── stores/authStore.tsx# useAuthStore (token auth, persisted)
├── config.ts           # API_BASE_URL (VITE_API_BASE_URL)
├── types.ts            # Note, Tag, Comment, VerseRef, PlaylistItem…
├── routes/             # route components + index.tsx
├── components/         # ~45 components (see below)
├── extensions/         # scriptureMention TipTap extension
├── hooks/              # useAudioPlaylist, useMediaSession,
│                       # useVerseHighlighter, useAudioKeepAlive
├── utils/              # apiClient, cacheManager, bibleUtils,
│                       # scriptureRef/linkify/mention, commentTree…
├── mocks/              # msw server + handlers for tests
└── assets/kjv.json     # full KJV text, bundled (offline)
```

## Domain model — read before editing

**Book identity is USFM codes.** `activeBookId`/`VerseRef.bookId`
are codes like `JHN`, `1CO`. Display names via `toBookName`,
parsing via `toUsfmCode`/`parseBibleRef` (all in
`utils/bibleUtils.ts`). The backend's `passage` param wants a book
NAME, so API calls convert code→name first.

**fileset_id selects the provider** (mirrors backend routing):
- `ENGKJV` → local `kjv.json`, no network; audio from
  `wordpocket.org` by book index.
- `ENGESV_API` → ESV via backend→api.esv.org (has headings).
- `LVSGLU8` (+`LVSGLU8C1DA` audio) → Latvian Glück via SWORD/GCS
  TTS; audio for ungenerated chapters comes back 404.
- anything else → DBT fileset ids (`ENGESV`, `ENGESVN1DA`…).
  Testament-specific audio ids use `…O1DA`/`…N1DA` —
  `filesetCoversTestament`, `findTestamentFallback`,
  `resolveTimestampsFilesetId`, `adjustTimestampsForENGESV` handle
  the quirks.

**Verse selection is scoped**: `verseSelection = {scope, refs}`
where scope is `'bible'` (PassageView) or a note id (selection
inside a NoteCard). Shift+click = range via `selectVerseRange`
(same book+chapter only). Bible-scope selection is mirrored into
the URL (`/bible/JHN.3.16-18`).

**Canonical URLs**: `/bible/{USFM}.{chapter}[.{verses}]` e.g.
`/bible/JHN.3.16-18` — build with `buildBiblePath`, parse with
`parseBibleRef`. `/bible/:book/:chapterVerse` is a legacy
redirect. Other routes: `/notes`, `/notes/:noteId`,
`/notes/tag/:tagId`, `/tags`, `/search`, `/login`, `/register`.
`/` key opens `/search`.

**Notes**: rich text (TipTap) + verse refs + one tag + `public`
flag + `tag_position` ordering. Drag reorder → `POST
notes/reorder/`; 409 `ConflictError` means refresh from server.
`@`-mentions in the editor insert tokens like `@JHN.3.16-18`
(`extensions/scriptureMention.tsx`, rendered by
`ScripturePassage`/`scriptureLinkify`).

**Comments**: nested tree, soft-deleted as `[deleted]`; per-note
counts via `comments/counts` (chunked at 200 ids).

**Audio**: `Audio.tsx` + `useAudioPlaylist` drive Howler playback,
verse highlighting via `bible/timestamps`, Media Session for
hardware keys, `nativeAudio.ts` keeps the WebView alive on Android.
Errors: `RateLimitError`, `ProviderError` (from backend
`error_code` contract), `ConflictError`.

## State management

Two persisted Zustand stores in localStorage:
- `useBibleStore` (key `bible-storage`, **version 3** with
  `migratePersistedState` — bump version + add a migration step
  when changing persisted shape; `partialize` controls what's
  saved; `showAudioPlayer` is deliberately not persisted).
- `useAuthStore` (key `auth-storage`): token + user.

Use narrow selectors (`useBibleStore(s => s.x)`) or `shallow` —
never subscribe to the whole store.

## API layer conventions

- `utils/apiClient.ts`: `authenticatedFetch` adds
  `Authorization: Token <t>` (DRF "Token", not "Bearer") and
  **logs the user out on 401**; `publicFetch` sends the token but
  never logs out — use it for any endpoint readable anonymously.
- Backend contract: provider failures arrive as `{error,
  error_code}` with HTTP 429/502 — map to `RateLimitError`/
  `ProviderError`, never show empty verses silently.
- **Known inconsistency**: several functions in `api.tsx`
  (verses, audio, translations, headings) hardcode the production
  host instead of `API_BASE_URL` — copy the surrounding style when
  editing, but prefer `API_BASE_URL` for new code.
- Backend image-upload and reading-positions endpoints exist but
  are not yet consumed by this app.

## Caching (`utils/cacheManager.ts`)

localStorage with an in-memory `Map` read-through layer. Verse
cache is LRU capped at 500 verses (copyright compliance — do not
raise); audio cache parses URL expiry (CloudFront/GCS signed URLs)
and is cleaned on app mount; notes/tags/translations/timestamps/
copyright also cached. `CACHE_VERSION` bumps invalidate stale
formats.

## Testing

- Vitest + React Testing Library + happy-dom + msw
  (`src/mocks/`). `fileParallelism: false`, 30 s timeout.
- Test hooks: `title="nav-book-{name}"`, `title="nav-chapter-{n}"`,
  `title="passage-verse-{ch}-{v}"`, `data-verse-scope`,
  `id={verseDomId(scope, ref)}`.
- `src/__tests__/repro-*.test.tsx` are regression tests for past
  bugs — keep them; `SKIPPED_TESTS.md` explains intentional skips.
- `__tests__/helpers/` has factories and perf helpers; msw
  handlers stub the API.

## Conventions & rules

- **79-char max line length in every file** (TS/TSX/MD). Verify:
  `awk 'length > 79 {print FILENAME":"NR}' <file>`.
- Functional components only; strict TS (no `any`); PascalCase
  components, camelCase utils, UPPER_SNAKE constants.
- Commits: `Type: Capitalized message` (Feat/Fix/Docs/Refactor/
  Test/Chore). Never commit to `main`; PRs only. Write the PR body
  to a temp file and use `gh pr create --body-file` (see workspace
  `.devin/workflows/create-pr.md`).
- **Update `DEVELOPER_GUIDE.md` after any functionality change** —
  treated as the source of truth for the next agent.
- Prefetch failures are silent (log + continue); user-facing
  failures go through Mantine `showNotification`.
