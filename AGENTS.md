# AGENTS.md — reactive-bible (React frontend)

Guidance for AI agents working in this repository. Trust the code
over docs that disagree — `DEVELOPER_GUIDE.md` is a detailed
reference updated alongside features, but code is the source of
truth wherever they drift.
Cross-repo contracts are spec'd in the workspace-level `openspec/`
(see workspace AGENTS.md).

## What this is

React 18 + TypeScript SPA (Vite + SWC, Mantine v6, Zustand, TipTap,
Howler). Deployed on Vercel; Capacitor wrapper for Android.
Talks to the `bible_research` Django API.

## Git workflow — staging-first

`main` is production (`bibleresearch.vercel.app`); `staging`
is the integration branch — every push auto-deploys as a
Vercel preview (`bible-research-git-staging-<team>.vercel.app`
— unless the dashboard Ignored Build Step cancels it; see
"Deployment / Vercel").
The invariant is **`main` ⊆ `staging`**: production only
receives code that has already soaked on staging. The
`staging-first` required check
(`.github/workflows/require-staging.yml`) fails `main` PRs
whose head SHA was never merged into `staging`, and the
`main` ruleset allows squash merges only.

- **Features/fixes**: branch off `origin/main` — never
  `staging`; the branch must carry no unverified staging
  noise. Open the PR with `--base staging`, then
  squash-merge once checks are green and the reviewer loop
  is clean — agents merge into `staging` without asking.
  GitHub auto-deletes the head branch on merge; expected.
- **Staging fixes**: commit them on the ORIGINAL feature
  branch (push it again if auto-deleted — same SHAs are
  fine; after auto-delete, restore it with
  `git push origin <sha>:refs/heads/<branch>` where `<sha>`
  is the merged staging PR's `headRefOid`), then merge
  into `staging` via the still-open staging PR or a new
  one.
- **Promotion to `main`** — only when the user asks to
  release or merge to main. The `Promote to main` workflow
  (`.github/workflows/promote-to-main.yml`) automates it:
  `gh workflow run "Promote to main"` (or the Actions tab;
  `-f dry_run=true` lists pending promotions). It opens a
  `main` PR per staged branch — oldest staging-merge
  first, original title + body + a promotion footer —
  squash-merges each, then resets `staging` to `main`
  (skipped entirely if any promotion fails — staging then
  still holds unreleased work). Conflicting promotions are
  resolved from the staging squash commit's tree — the
  validated integration state, never guessed; a replay is
  only attempted while all earlier promotions succeeded,
  since a squash tree also carries their code. A branch
  whose remote tip moved past its staging merge is skipped
  — those commits were never staged. The scan covers the
  200 most recent merged staging PRs. Manual
  equivalent, per branch: re-push it if auto-deleted
  (`git push origin <headRefOid>:refs/heads/<branch>`),
  open a PR with `--base main` (same title + body — keep
  `Closes #<N>` links so issues auto-close, and end it
  with the ``_Promoted from `staging` (PR #<staging PR>)_``
  marker line the workflow emits — required whenever the
  head was renamed/recreated), then
  `gh pr merge <N> --squash --admin`; then reset staging
  (`git fetch origin && git push --force-with-lease origin
  origin/main:refs/heads/staging` — the only sanctioned
  force-push; the workflow does it via the refs API
  instead). NEVER open `staging`→`main` PRs — that drags
  integration noise into prod history. The reset discards
  anything still on `staging` that was not promoted —
  reset only once staging matches the release, and
  re-merge leftovers to `staging` afterwards (re-pushing
  the same SHAs still satisfies the check). The workflow
  needs the `AUTOMERGE_TOKEN` admin PAT (the same secret
  the dependabot automerge uses).
- **"Merge straight to main" / ad-hoc releases** — the
  default response when the user asks to deploy a single
  change to production (a hotfix, "deploy this to prod"):
  merge the branch into `staging` first anyway — the
  check blocks anything else, keeping `main` ⊆ `staging`
  even for urgent merges — then open a `main` PR from
  the SAME branch head (same title + body — keep
  `Closes #<N>` links) and squash-merge it autonomously
  once checks are green and the reviewer loop is clean
  (`gh pr merge <N> --squash --admin`). End the `main`
  PR body with the marker line
  ``_Promoted from `staging` (PR #<staging PR number>)_``
  — the marker the What's-on-staging checklist uses to
  drop the staged entry; it's the only link that survives
  a renamed or recreated promotion head. The staging merge
  auto-deletes the head branch — re-push it first
  (`git push origin <headRefOid>:refs/heads/<branch>`,
  same SHA is fine). `staging` is NOT reset — it keeps
  holding the rest of the queue. This solo path requires
  the `main` diff to carry the feature alone, which holds
  while the head stays clean of `origin/staging` merges:
  a staging PR whose conflicts forced
  `git merge origin/staging` into the branch makes the
  head carry the whole queue, so a `main` PR from it
  would drag every staged feature along — that branch can
  only reach `main` via the `Promote to main` train (or
  a hand-made cherry-pick shipping a combination that
  never soaked). Verify `git diff origin/main...<head>`
  shows the feature alone before opening the `main` PR.
  If the `main` PR's check already ran red before the
  staging merge, re-run the failed job after it
  (`gh run rerun <run-id> --failed` or a push). Never
  direct-push a hotfix to `main`: it breaks
  `main` ⊆ `staging` until the next train reset, and
  promotion conflict resolution pulls staging trees that
  lack the fix — it can silently revert it; if a manual
  push ever happens, apply the fix on both branches.
- **Dependabot** targets `staging` and auto-merges there;
  its branches promote to `main` like any feature branch.
- **Backend is unaffected** — `bible_research` keeps its
  trunk-based `main` flow.

## Layout (actual)

- `src/api/` — every backend call lives here, split by domain
  (`errors`, `structure`, `bibleStructure`, `verses`, `audio`,
  `translations`, `notes`, `tags`, `comments`, `search`,
  `readingPositions`, `sharing`, `bookmarks`); `index.ts`
  is the barrel — always
  import from `'../api'`, never a leaf, so
  `vi.mock('../api')` keeps intercepting.
  Note `structure.ts` is the bundled KJV verse-count lookup
  (sync, offline); `bibleStructure.ts` is the network client
  for `GET /api/v1/bible/structure/?fileset_id=`.
- `src/config.ts` — `API_BASE_URL` from `VITE_API_BASE_URL`, else
  the production App Engine host. ALWAYS use it; never hardcode
  the host. MSW handlers and tests derive from the same config.
- `src/store.ts` — main persisted Zustand store (`bible-storage`,
  schema v11, custom `migratePersistedState` — bump version when
  persisted shape changes). Composition root; notes
  orchestration in `src/stores/bibleStore/notesSlice.ts`,
  structure SWR in `src/stores/bibleStore/structureSlice.ts`
  (`structureByBible` + `loadStructure` — TRANSIENT, not in
  `partializeState`; durable copies live in the
  `bible_structure_cache` localStorage tier), partialize/
  migration in `src/stores/bibleStore/persistence.ts`.
- `src/stores/authStore.ts` — auth state (token, user, login,
  register, logout).
- `src/utils/apiClient.ts` — `publicFetch` (attaches token if
  present; a 401 retries once anonymously — a stale token must
  not break public content — and never logs out) vs
  `authenticatedFetch` (401 → logout + "session expired"
  notification). Network-failure retry only fires for
  idempotent methods (GET/HEAD/OPTIONS) — or for requests the
  caller marks `idempotent: true` (reads implemented as POST,
  e.g. `reading-positions/bulk/`).
- `src/utils/cacheManager.ts` — localStorage cache: verses
  (LRU, 500 cap for copyright), audio URLs (CloudFront expiry
  parsing), translations (per language), bible structures
  (per bible abbr, 24h TTL — the localStorage SWR tier).
- `src/utils/bibleUtils.ts` — USFM book metadata, testament lookup
  (drives ESV audio fileset choice: `ENGESVO1DA`/`ENGESVN1DA`).
  `toBookName`/`toUsfmCode` are CONTRACT identity (English);
  `localizedBookName` is the display name in the active
  structure's language.
- `src/utils/bookNameRegistry.ts` — module-level snapshot of the
  ACTIVE structure (localized name/short-name/coverage maps +
  additive localized name→code resolution). Sync readers only;
  the structure slice pushes updates. Reset via
  `resetActiveStructure()` between tests — async fetches
  otherwise leak state across specs.
- `src/i18n/` — UI localization (i18next + react-i18next):
  `index.ts` exports `initI18n` (awaited in `main.tsx` before
  first render), `changeUiLanguage`, `resolveUiLanguage`
  (persisted choice → `navigator.language` → `en`),
  `DEFAULT_TRANSLATION_BY_LOCALE` (first-run TEXT fileset:
  en→ENGESV_API, lv→LVSGLU8, ru→RUSSYN; never overrides a
  persisted selection) and the `UiLanguage` type.
  `locales/<lang>/{common,books}.json` — `en` is bundled and
  is the source catalog (`i18next.d.ts` types `t()` keys from
  it); `lv`/`ru` lazy-load per locale. `errorText.ts` maps
  `error_code`/typed API errors to `errors.*` keys.
- `src/hooks/useBookName.ts` — `useBookName`/`useActiveStructure`
  store subscriptions for the display-name layer.
- `src/hooks/` — audio playlist, media session, keep-alive,
  verse highlighter, `useNoteRefFilesetId` (the shared
  pinned-or-active fileset for note-reference surfaces).
- `src/routes/` — React Router routes; canonical Bible URL is
  `/bible/JHN.3.16-18` (USFM refs, also legacy `/bible/:book/...`
  redirect). `/explore` is the anonymous-safe published
  directory; `/shared` + `/bookmarks` are ProtectedRoutes.
  `/getting-started` and `/settings` are public
  document-style pages — their pathnames are whitelisted for
  `overflow: auto` in `App.tsx`. Settings holds device-local
  preferences (persisted store fields, no auth), reachable
  from the main menu for anonymous and signed-in users.
- `src/data/` — static typed content catalogues, e.g.
  `gettingStartedVideos.ts` (the /getting-started video list —
  a card renders only when `youtubeIds` resolves an id for the
  active UI language, falling back to English).
- `src/mocks/` + `setupTests.ts` — MSW server for tests.

## Data model contracts

- Books are identified by USFM codes (`GEN`, `JHN`) internally;
  `book_name` is display-only. `toBookName()` maps id → ENGLISH
  name for the backend's `passage` param, stored note `book`
  fields and external links — never localize those. Display
  labels use `localizedBookName`/`useBookName`; `toUsfmCode`
  resolves English + USFM + localized names additively.
- `GET /api/v1/bible/structure/?fileset_id=` returns the
  fileset's real book/chapter coverage with names localized to
  its language — PassagePicker greys uncovered books (still
  clickable → "… doesn't include {book}" notification, never
  the `disabled` attribute, which swallows the click).
  `loadStructure` sends the owner's concrete text member id
  (`ENGESV_API`), not the bare listing abbr (`ESV` 404s —
  registry providers only route by fileset id), and never a
  `:`-bearing product id.
- `fileset_id` selects the provider server-side: `ENGKJV` (bundled
  `src/assets/kjv.json`, offline, audio from wordpocket.org),
  `ENGESV_API`, `LVSGLU8`/`LVSGLU8C1DA`, others → DBT.
- Note-reference surfaces — `@…` previews in
  `ScripturePassage` and linked-verse text in the note
  dialogs (`useVerseTexts`) — resolve their text fileset via
  `useNoteRefFilesetId()`: the persisted `noteRefFilesetId`
  pin when set, else `activeTextFilesetId`. `ScripturePassage`
  then runs `resolveTextFileset(id, toUsfmCode(book) ?? book,
  translations)` — `reference.book` is a display name, so the
  USFM map keeps testament-split ids correct — with `ENGKJV`
  a bundled fast-path and `ENGESV_API` the last-resort
  fallback. `/settings` pins the override through
  `TranslationSelector`'s controlled `pickTextOnly` mode
  (`opened`/`onClose`/`seedFilesetId`/`onPickText`): it hides
  every audio control, seeds from `seedFilesetId` (falling
  back to the active text fileset), and never writes
  `activeTextFilesetId`/`activeAudioFilesetId`.
- Verse selection is scoped: `{ scope: 'bible' | 'note:<id>',
  refs: VerseRef[] }` — a `VerseRef` is `{ bookId, chapter, verse }`.
- Backend errors carry `error`/`error_code`/`message`;
  `src/api/errors.ts` maps them to `RateLimitError`/
  `ClientInputError`/`ProviderError`/`BookNotInFilesetError`/
  `SearchDisabledError` (coded HTTP 400 bodies ->
  `ClientInputError`, deliberately not a `ProviderError`;
  `search_disabled` 403s -> `SearchDisabledError`, a
  `ProviderError` subclass). Preserve this — do not
  silently swallow provider failures into empty verse lists.

## Behavior notes

- Cache-first everywhere; prefetch adjacent chapters silently.
- `showAudioPlayer` is intentionally NOT persisted.
- `BottomNav`'s passage title is two zones: the localized book
  name scrolls on a slow reveal-then-restart marquee
  (`src/components/Marquee.tsx`) only when it overflows; the
  chapter is pinned right (`flex: none`) and never moves.
  `bookTitleMarquee` (persisted, default on) and
  `prefers-reduced-motion` both collapse it to a clipped name —
  a future settings toggle only writes that one field.
- Auth: token persisted via authStore; `authenticatedFetch` is for
  user-owned resources (notes, tags, comments), `publicFetch` for
  bible content. Login/register/checkAuth then fetch
  `users/me/` for `id` + `can_publish` — publish UI only
  renders when that flag is true. The published-state lock
  on the public toggle is gated on it too: a non-publisher
  keeps the public control usable so clearing `public`
  still unlists (the server drops `published` with it).
- Sharing: `public` stays link visibility; `published` is
  the `/explore` directory flag (implies `public`, needs
  `can_publish`); `ShareModal` handles targeted username
  grants (silent resolution — never enumerate users);
  `/shared` and `/bookmarks` are ProtectedRoutes. The whole
  targeted-share/bookmark/copy surface is behind
  `isNoteSharingEnabled()` (`src/utils/platform.ts` = DEV ||
  preview) — the backend half (bible_research#163) is
  undeployed, so prod/Android builds hide it until it ships
  (Sentry REACTIVE-BIBLE-WEB-15).
- "What's on staging" (MainMenu) renders only on Vercel preview
  deploys — `isPreviewDeploy()` in `src/utils/platform.ts` gates
  on the build-time `VITE_APP_ENV`; `src/utils/stagingPrs.ts`
  computes the pending-promotion set (approximating
  `promote-to-main.yml`: head-branch keyed head-SHA /
  merged_at comparison, plus a `Promoted from staging
  (PR #N)` body-marker match — the only signal that survives
  a renamed promotion head, whose staged SHAs never enter
  the promotion PR's commit graph) from the
  unauthenticated GitHub pulls API, and `StagingChecklistModal`
  renders each PR's `## UI verification / QC` steps as
  session-local checkboxes.
- Keyboard: `/` opens search, `Escape` closes modals.

## Sentry event-stream contract

`reactive-bible-web` routes every event into tagged streams;
**`is:unresolved level:error environment:production`
is the agent-fixable bug queue** — anything else is deliberate:

- (no `reportType`) — exception events, level error. Real bugs;
  agents may fix and resolve.
- `reportType: handled-api` — level error, `context` tag set.
  `captureHandledError` events from catch sites that already
  degrade gracefully (chapter/audio fetches, notes, comments,
  tags, reading positions). Expected conditions still filtered
  by `beforeSend`; surviving events mean the graceful path
  itself is worth alerting on. Exception: `errorKind: network`
  failures here downgrade to warning — a handled connectivity
  failure is noise, not a defect in the graceful path.
- `reportType: media-failure` — warning `captureMessage` from
  the audio hooks' terminal failure paths (fileset + passage in
  extras). Warning-level: fallback chains make a single failure
  routine; a spike means a provider outage.
- `reportType: native-bridge` — warning `captureMessage` from
  Capacitor bridge calls (`nativeAudio.ts`, `useMediaSession`,
  `appUpdate.ts`). Expected on web (no bridge) — the plugins
  exist only inside the APK — so these stay out of the error
  queue.
- `reportType: resource-load` — warning `captureMessage` from
  `errorReporter.tsx` (missing hashed assets, dead signed
  URLs). Low-priority; usually self-healing noise — a failed
  same-origin `/assets/*` script/link triggers the guarded
  stale-chunk reload and is NOT reported while a reload is
  armed (the page is tearing down); it warns only when the
  guard refuses — guard spent or the tab is offline.
- `reportType: user-report` — info `captureMessage` +
  `captureFeedback` from "Contact developer" (`userReport.ts`,
  `ContactModal.tsx`). Every submission also carries
  `reportCategory: bug|feature|general`, and ALL categories
  feed the triage queue — bugs get fixed, feature requests
  get implemented (a huge/unreasonable one may be logged
  `declined` with reasoning), and general messages get
  triaged and answered. Anonymous senders may attach a
  reply `email` on the feedback entry. The event message
  embeds the category, passage and note so Sentry's built-in
  Dedupe integration cannot collapse consecutive distinct
  reports (all still group under one stream issue via the
  constant `user-report` fingerprint).
  `sentryBeforeSend` returns these early — the note text is
  user-controlled and must never hit the message-based noise
  filters — and each submission also opens a feedback issue —
  `issue.category:feedback` finds feature/general mail the
  legacy User Feedback list can miss. Not an error queue
  item; investigated separately via the fix-sentry-issue
  skill.
- `reportType: app-update` — info events from the APK's
  sideload updater (`src/utils/updateTelemetry.ts`):
  `updateStep: download-opened` (user tapped Update) and
  `updateStep: installed` (app started on a higher
  versionCode). Read-only diagnostics.
- `errorKind: network` — tag (not a stream) set by
  `sentryBeforeSend` on `TypeError` network failures
  ('Failed to fetch', 'Load failed', 'NetworkError…'); kept
  reportable but routable. On `handled-api` events the level
  drops to warning (client connectivity noise); unhandled
  network rejections stay error-level — reaching
  GlobalHandlers means a missing catch, still a bug.

Three reporting paths, all non-duplicating:

- `reportError(error, context?)` — fatal notification +
  Sentry exception. Reserved for global catch-alls
  (`initGlobalErrorHandlers`, ErrorBoundary, stale-chunk
  recovery) — never call it from an ordinary catch.
- `captureHandledError(error, context, extra?)` —
  Sentry exception tagged `reportType: handled-api`, NO
  notification. The standard call for handled catch sites.
- `captureHandledWarning(msg, reportType, extra?)` —
  warning-level `captureMessage` for `media-failure` /
  `native-bridge` streams.

Global window handlers are notify-only — Sentry's own
GlobalHandlers integration transports each uncaught error
exactly once; `beforeSend` re-adds the `context` tag on
surviving `onerror`/`onunhandledrejection` events.

APK builds report too: `android-release.yml` passes the
`VITE_SENTRY_DSN` Actions secret to `npm run build` with
`VITE_APP_ENV=android` (main / `v*` release APKs) or
`android-debug` (other refs) and release
`android-<versionCode>`; events also carry a `versionCode`
tag. The web bug queue filter (`environment:production`)
therefore excludes the APK — use `environment:android` for it.

`sentryBeforeSend` (`src/utils/sentry.ts`) drops expected
noise before it reaches Sentry: `RateLimitError`,
`BookNotInFilesetError`, `SearchDisabledError` (including
untyped errors carrying those `error_code`s), `AbortError`,
'Session expired',
`ChunkLoadError` / `Loading chunk N failed` / `Loading CSS
chunk` (stale tabs after a deploy — self-healed by the
guarded reload in `chunkLoadError.ts`, wired through
`lazyWithReload`, `kjvDataLoader`, and `errorReporter`'s
`vite:preloadError` / hashed-asset resource-error handlers),
and `ResizeObserver loop`. `ConflictError` and handled-api
network failures (`errorKind: network`) downgrade to
warning; `ProviderError` fingerprints by
`error_code`+endpoint. `ClientInputError` is deliberately
kept — a malformed request is a bug. Typed API errors
(`src/api/errors.ts`, `apiClient.ts`) carry `errorCode`,
`status`, and `endpoint` on the error object — preserve them
when wrapping errors.

`@sentry/capacitor` is deliberately NOT adopted: it adds
~50KB gz + a native-side init/proguard config step for
coverage we already get — every JS failure inside the APK's
WebView flows through the web SDK, and the app's only native
surface (bridge calls, updater, media session) already emits
`native-bridge`/`app-update` warnings. Revisit only if a gap
shows up in real `environment:android` events.

## Commands

```bash
npm run dev      # dev server :5173
npm run build    # tsc + vite build
npm run lint     # ESLint (must stay 0 errors, 0 warnings)
npm test -- --run  # vitest headless (98 files / 953 tests)
```

## Conventions / rules

Universal rules — follow exactly:

1. **Max 79 chars per line, every file type.** Verify:
   `awk 'length > 79 {print FILENAME":"NR}' <file>`. Fix
   violations you introduce plus long lines in files already
   being modified. Exempt: formatter output (e.g. Prettier at
   printWidth 80 may emit 80-char lines) and vendored upstream
   skill files under `.agents/skills/` and `.devin/skills/`
   (`openspec-*`, `vercel-react-best-practices/`) — refresh
   tools own them.
2. **Commit format** `Type: Capitalized message` —
   `Feat:`/`Fix:`/`Docs:`/`Refactor:`/`Test:`/`Chore:`.
3. **Commit on feature branches only, never `main`.**
   Name branches `<type>/<slug>` with the commit types
   (`feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`).
   Stage only files changed this session, by path — never
   `git add -A`, `git add .` or `git commit -a`; confirm the
   staged set with `git status` first; leave the user's own
   dirty files alone; never commit plan/scratch markdown.
4. **Dangerous commands — never run** the destructive/deploy
   commands listed under "Repo-specific rules" below; write
   the change and tell the user the command to run instead.
5. **Scoped verification** — run only the tests/checks for
   what you changed, not the whole suite.
6. **PR bodies go to a temp file** + `gh pr create
   --body-file`, never inline `--body`; delete the temp file
   after. See `.devin/skills/create-pr/`.
7. **Every PR body includes a UI verification / QC section** —
   concrete steps (pages, clicks, expected result) exercising
   the change end-to-end through the UI. Omit only when
   genuinely unreachable from the UI — then give an
   equivalent (curl command, log line, file to inspect).
8. **GitHub remote targeting**: when `origin` is the user's
   fork (an `upstream` remote exists), ALL GitHub operations
   — issues, PRs, comments, releases — target the fork via
   `--repo <owner>/<fork>`; never upstream unless asked.
   Otherwise `origin` is the target.
9. **No secrets in code.** Secrets live in gitignored local
   files / env vars / GCP Secret Manager. Never create new
   Secret Manager secrets — append KEY=VALUE lines to the
   shared `env-file` secret (each extra secret adds cost).
10. **Update docs after functionality changes** — this file
    and the repo's other contract docs (README /
    DEVELOPER_GUIDE / docs/*) — in the same change.
11. **`docs/plans/` is frozen** — existing files stay as
    history with their status headers (implemented / partial /
    in progress / not implemented / reverted); nothing new is
    added there or anywhere else — all new planning goes
    through OpenSpec (`openspec-propose` for changes,
    `openspec-explore`/change artifacts for investigations).
12. **This file is self-updating.** Missing tool → tell the
    user what to install instead of grinding through failing
    alternatives. Discovered flow/local quirk → write it into
    the relevant AGENTS.md and commit that doc update
    alongside the work that discovered it.

### Repo-specific rules

- **Dangerous commands — never run**: `vercel` CLI deploys
  (deploys are CI/Vercel-integration only); force-pushes,
  except the post-release `staging` reset documented in
  "Git workflow — staging-first" (`--force-with-lease`,
  `staging` only); pushing `v*`
  tags or moving the `continuous` release tag by hand (CI
  owns release publishing — the refs-API retag step in
  `android-release.yml` is not a manual flow); `gcloud`/
  `terraform` mutations (infra lives in `bible_research/`).
- **Remote layout**: `origin` = `Bible-Research/reactive-bible`
  (the user's org repo — all `gh` operations target it);
  `emmanz1995` is the upstream source the repo was forked
  from — never open PRs/issues there unless asked.
- **Test login**: shared UI account `Tester5` /
  `password123` (workspace AGENTS.md). `Tester5`/`Daniels`
  also exist on the staging backend's `stagingdb` database
  with their prod data (see `bible_research/AGENTS.md`
  "Databases") — run the app against the staging API
  deployment (`VITE_API_BASE_URL=<staging-api> npm run
  dev`; domain lives in the Vercel project dashboard) to
  exercise it.
- **OpenSpec lives at the workspace root** — never run
  `openspec init` in this repo; cross-repo contracts are
  spec'd there (see workspace AGENTS.md).
- **All implementation work happens in a git worktree**
  (`worktrees/<slug>` inside this repo — gitignored; cut
  from `origin/main`, needs its own `npm install`) — never
  the main checkout. Once the PR's checks are green, remove
  the worktree + local branch right away — don't wait for
  the merge (the PR lives on the remote branch). Full
  lifecycle: workspace `../AGENTS.md` "Repo-specific rules".
- Commit after each completed plan step.

Code conventions:

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
  just "throw on !ok" — a 429 throws `RateLimitError` so
  `sentryBeforeSend` drops it. Keep custom `try/catch` only
  where the endpoint has a richer contract (typed provider
  errors, 409 bodies, 204s, swallowed failures).
- Patched deps (`patches/`, applied by `postinstall`
  patch-package — bumping one requires regenerating its
  patch): `@anuradev/capacitor-background-mode` (Play Protect,
  see "Android / Play Protect") and `@mantine/hooks`
  (`createAriaHider` defers the sibling `aria-hidden` pass
  until the focus trap's own `setTimeout(0)` focus move has
  run, with a blur fallback — synchronous hiding landed the
  attribute on ancestors of `document.activeElement`, which
  is what Chrome's "Blocked aria-hidden on an element
  because its descendant retained focus" warning means).
- UI strings: no hardcoded English in components — every
  user-facing string (labels, aria-labels, notifications,
  placeholders, titles) goes through `t('section.key')` from
  `useTranslation()` (components) or `i18n.t()` from
  `src/i18n` (non-React code like stores/utils). English keys
  live in `src/i18n/locales/en/common.json`; add the lv/ru
  translations in the same change — `src/i18n/index.test.ts`
  fails on missing keys. Counts use `t(key, { count })`
  plural keys (`_one`/`_other`, plus `_zero` for lv and
  `_few`/`_many` for ru). Server-provided messages and
  contract text (book names for `passage=`, storage) are NOT
  translated.

## Known gaps (do NOT "fix" without asking)

- Comment image endpoints ARE consumed by
  `CommentThread`/`CommentForm`/`CommentNode`; reading positions
  are consumed too (book-name keyed, auth-gated; see
  `readingPositions` in `src/store.ts`).
- KJV audio is fetched from wordpocket.org directly, not the API.

## Deployment / Vercel

- `vercel.json` rewrites `/api/:path*` to the GAE backend
  (`bible-research-489314.ey.r.appspot.com`) BEFORE the SPA
  catch-all, so the app can call the API same-origin when
  `VITE_API_BASE_URL` is set to the Vercel domain — this kills
  CORS preflights and makes anonymous GETs edge-cacheable.
  Vercel's `:path*` does not match trailing-slash paths and
  every Django endpoint ends in `/`, so vercel.json ships BOTH
  `/api/:path*` and `/api/:path*/` rules — do not deduplicate.
  Two dashboard steps are manual (agent cannot do them): set
  `VITE_API_BASE_URL=https://bibleresearch.vercel.app` in the
  Production scope + redeploy, and enable "cache responses
  from external rewrites" in project settings (the project
  predates the default-on rollout).
- The `staging` branch deploys as a Vercel preview
  automatically (`bible-research-git-staging-<team>.vercel.app`).
  `git.deploymentEnabled` in `vercel.json`
  whitelists `main` + `staging` — `"**": false` matches
  EVERY other branch name (minimatch `**` covers
  slash-less names too — verified on v3 + v10), and any
  matching `true` rule enables the deploy per Vercel's
  docs (verified live: `staging` pushes pass this gate).
  It is read
  from the pushed commit's `vercel.json` (probed
  2026-11-19) and is a GIT-LEVEL gate: a blocked branch
  gets NO deployment and NO Vercel commit status.
  Separately, the project's dashboard-level Ignored
  Build Step can cancel an ALLOWED push later — those
  commits show a `success — Canceled by Ignored Build
  Step` Vercel status. That step — not this file —
  froze staging previews 2026-11-16→19 (configured
  after a "Deployment rate limited" episode; `staging`
  had passed `deploymentEnabled` the whole time). If
  previews go missing again, read the commit's Vercel
  status description BEFORE editing this file: no
  status = blocked here, "Canceled by Ignored Build
  Step" = the dashboard setting.
  Preview builds carry no `VITE_API_BASE_URL`, so
  `src/config.ts` resolves `API_BASE_URL` to `''` on
  `*.vercel.app` hosts — same-origin `/api` fetches hit
  the vercel.json rewrites on whichever alias is browsed
  (deployment URL, branch alias, custom domain). Never
  bake `VERCEL_URL` in: it is the immutable per-deployment
  URL and forced cross-origin calls that fail CORS
  preflight (#274). Sentry reports `environment:
  'preview'` via the baked `VERCEL_ENV` — no env-var
  changes needed.
- Requests carrying `Authorization` bypass the edge cache by
  design — authenticated traffic only gains preflight
  elimination.
- Hashed `/assets/*` get `Cache-Control: public,
  max-age=31536000, immutable`; `index.html` keeps default
  no-cache. No `CDN-Cache-Control` anywhere — licensed Bible
  content must not be CDN-cached.

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
