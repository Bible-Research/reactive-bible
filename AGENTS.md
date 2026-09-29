# AGENTS.md — reactive-bible (React frontend)

Guidance for AI agents working in this repository. Trust the code
over docs that disagree — `CLAUDE.md` still lists components that
no longer exist (e.g. MyNavbar, PassageView, Verse, SearchModal,
TranslationSelector, AddTagNoteModal/EditNoteModal notes flow was
reworked).

## What this is

React 18 + TypeScript SPA (Vite + SWC, Mantine v6, Zustand, TipTap,
Howler). Deployed on Vercel; Capacitor wrapper for Android.
Talks to the `bible_research` Django API.

## Layout (actual)

- `src/api.tsx` — every backend call lives here (large module).
- `src/config.ts` — `API_BASE_URL` from `VITE_API_BASE_URL`, else
  the production App Engine host. ALWAYS use it; never hardcode
  the host. MSW handlers and tests derive from the same config.
- `src/store.tsx` — main persisted Zustand store (`bible-storage`,
  schema v3, custom `migratePersistedState` — bump version when
  persisted shape changes).
- `src/stores/authStore.tsx` — auth state (token, user, login,
  register, logout).
- `src/utils/apiClient.ts` — `publicFetch` (attaches token if
  present, never logs out on 401) vs `authenticatedFetch` (401 →
  logout + "session expired" notification). Both retry on network
  failure.
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
- Backend errors carry `error`/`error_code`/`message`; api.tsx maps
  them to `RateLimitError`/`ProviderError`. Preserve this — do not
  silently swallow provider failures into empty verse lists.

## Behavior notes

- Cache-first everywhere; prefetch adjacent chapters silently.
- `showAudioPlayer` is intentionally NOT persisted.
- Auth: token persisted via authStore; `authenticatedFetch` is for
  user-owned resources (notes, tags, comments), `publicFetch` for
  bible content.
- Keyboard: `/` opens search, `Escape` closes modals.

## Commands

```bash
npm run dev      # dev server :5173
npm run build    # tsc + vite build
npm run lint     # ESLint (aim for zero new warnings)
npm test -- --run  # vitest headless (389 tests, ~85s)
```

## Conventions / rules

- Max 79 chars per line — every file type. Verify with
  `awk 'length > 79 {print FNR}' file`.
- Commit format `Type: Capitalized message`; never commit to `main`;
  stage only files you changed.
- Components PascalCase, utils camelCase, constants UPPER_SNAKE.
- Zustand: select narrowly (`state => state.x`) to avoid rerenders.
- Test hooks: `title="nav-book-{code}"`, `title="nav-chapter-{n}"`,
  `title="passage-verse-{chapter}-{n}"`.

## Known gaps (do NOT "fix" without asking)

- Backend image-upload + reading-positions endpoints are NOT
  consumed yet — intentional, pending design.
- KJV audio is fetched from wordpocket.org directly, not the API.
