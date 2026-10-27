# Reactive Bible - Developer Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Development Setup](#development-setup)
3. [Architecture](#architecture)
4. [Client-Side Routing](#client-side-routing)
5. [State Management](#state-management)
6. [Types & Interfaces](#types--interfaces)
7. [Testing Guidelines](#testing-guidelines)
8. [Bible Utilities](#bible-utilities)
9. [Core Functionalities](#core-functionalities)
10. [Data Flow](#data-flow)
11. [Component Structure](#component-structure)
12. [API Integration](#api-integration)
13. [Caching System](#caching-system)
14. [Code Style Guidelines](#code-style-guidelines)
15. [Keeping Documentation Updated](#keeping-documentation-updated)
16. [Browser Compatibility](#browser-compatibility)
17. [Performance Considerations](#performance-considerations)
18. [Android App & Release Channels](#android-app--release-channels)

---

## Project Overview

**Reactive Bible** is a modern Bible reading application built with 
React, TypeScript, and Vite. It provides offline Bible reading 
(KJV stored locally), online Bible translations (ESV via API), 
audio playback, verse tagging, and advanced search capabilities.

### Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (Rolldown) + SWC
- **UI Library**: Mantine v6
- **Routing**: React Router v6
- **State Management**: Zustand with localStorage persistence
- **Rich Text**: TipTap / ProseMirror (note editor)
- **Drag & Drop**: dnd-kit (note reordering)
- **Audio**: Howler.js
- **Testing**: Vitest + React Testing Library + MSW
- **Mobile Shell**: Capacitor (Android)
- **Icons**: Tabler Icons
- **Analytics**: Vercel Analytics
- **Performance Monitoring**: Vercel Speed Insights

---

## Development Setup

### Prerequisites
- **Node.js**: v16 or higher
- **npm**: v7 or higher (comes with Node.js)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd reactive-bible
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (`tsc` typecheck + Vite build)
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint (`--max-warnings 0`: 0 errors and
  0 warnings required)
- `npm test` - Run tests once, headless (CI mode)
- `npm run test:ui` - Run tests with the interactive Vitest UI
- `npm run coverage` - Generate a test coverage report

### Project Structure

```
reactive-bible/
├── src/
│   ├── components/      # React components (co-located tests)
│   ├── routes/          # React Router routes + lazy boundaries
│   ├── hooks/           # Shared hooks (audio engine, note
│   │                    #   editor, media session, etc.)
│   ├── utils/           # Utility modules (co-located tests)
│   │   ├── apiClient.ts     # publicFetch / authenticatedFetch /
│   │                    #   fetchJson
│   │   ├── bibleUtils.ts    # Bible book/testament helpers
│   │   ├── filesetGroups.ts # Fileset grouping + resolution
│   │   ├── verseRefs.ts     # USFM verse-ref parsing/formatting
│   │   ├── errorReporter.tsx# Global error → notification
│   │   └── cacheManager.ts  # Caching logic
│   ├── assets/         # Static assets
│   │   ├── kjv.json    # KJV verse text (lazy-loaded chunk)
│   │   └── bibleStructure.json  # Book/chapter metadata (bundled)
│   ├── api/            # API modules split by domain
│   │                    #   (index.ts barrel — always import
│   │                    #   via '../api')
│   ├── stores/         # authStore + bibleStore/ slices
│   ├── store.ts        # Zustand composition root
│   ├── types.ts        # TypeScript interfaces
│   ├── mocks/          # MSW handlers + server for tests
│   ├── __tests__/      # Shared test infra + integration/
│   │                    #   regression tests
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── setupTests.ts   # Test configuration (MSW + resets)
├── public/             # Public assets
├── dist/               # Build output (generated)
├── vite.config.ts      # Vite + Vitest configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

### Environment Variables

Optional: `VITE_API_BASE_URL` in a local `.env` overrides the
default backend host — `src/config.ts` exports `API_BASE_URL`
and falls back to the production App Engine host; always use
it, never hardcode the URL. `VITE_SENTRY_DSN` (also optional)
enables Sentry error monitoring — see "Error Reporting &
Monitoring". The app uses:
- **Local KJV data**: `src/assets/kjv.json`, lazy-loaded on demand
  via `src/utils/kjvDataLoader.ts` (emitted as a separate bundle
  chunk). `src/assets/bibleStructure.json` holds book/chapter/verse
  metadata bundled in the entry chunk for synchronous navigation.
- **Bible Research API**: public content needs no auth; notes,
  tags, comments, and reading positions use token auth.

### Deployment

The app is configured for deployment on **Vercel**:

1. **Connect repository** to Vercel
2. **Build settings** (auto-detected):
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. **Deploy** - Vercel will automatically deploy on push to main branch

**Analytics & Monitoring**:
- Vercel Analytics and Speed Insights are automatically enabled in production
- No configuration needed - data appears in Vercel dashboard
- Sentry error monitoring activates when `VITE_SENTRY_DSN` is
  set per-environment; sourcemap upload needs the `SENTRY_*`
  build env vars (see "Error Reporting & Monitoring")

---

## Architecture

### High-Level Structure
```
src/
├── components/          # React components
├── utils/              # Utility functions (caching, bible utils)
├── assets/             # Static assets (kjv.json, bibleStructure)
├── api/                # API functions and data access
├── store.ts           # Zustand state management
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

### Design Patterns
- **Component-Based Architecture**: Modular, reusable components in
  `src/components`.
- **Centralized State**: A single Zustand store (`src/store.ts` —
  composition root; the notes orchestration lives in
  `src/stores/bibleStore/notesSlice.ts`, persistence/migration
  in `src/stores/bibleStore/persistence.ts`) for global state,
  with persistence to `localStorage`.
- **API Layer Separation**: All external data fetching and business logic is
  handled in `src/api/`.
- **Cache-First Strategy**: A multi-level caching system
  (`src/utils/cacheManager.ts`) minimizes API calls and improves speed.
- **Persistent State**: User preferences (like theme and translation choice)
  are saved across sessions.
- **URL-Based Routing**: React Router v6 for client-side navigation with
  URL/store synchronization.

---

## Client-Side Routing

**Status**: ✅ Implemented
**Library**: React Router v6
**Config**: `src/routes/index.tsx`

The application uses React Router for client-side navigation, enabling
shareable URLs, browser history support, and deep linking. Canonical
Bible URLs use USFM refs — `/bible/JHN.3.16-18` selects John 3:16–18;
`/bible/JHN.3` opens the chapter. Non-bible routes are lazy-loaded via
`React.lazy` in `index.tsx`; `BibleRoute` and `LegacyBibleRedirect`
stay eager because they serve the landing path.

### Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Redirect | Redirects to `/bible` |
| `/bible` | `BibleRoute` | → `/bible/{bookId}.{chapter}` |
| `/bible/:ref` | `BibleRoute` | USFM chapter or verse ref |
| `/bible/:book/:chapterVerse` | `LegacyBibleRedirect` | → canonical ref |
| `/search` | `SearchRoute` | Search (`?q=`) |
| `/notes` | `NotesRoute` | → default tag |
| `/notes/tag/:tagId` | `TagNotesRoute` | Tag notes (`untagged`) |
| `/notes/:noteId` | `NoteDetailRoute` | Note detail (public) |
| `/tags` | `ProtectedRoute`→`TagManagementRoute` | Tag CRUD |
| `/login`, `/register` | `LoginPage`, `RegisterPage` | Auth |
| `*` | Redirect | → `/bible` |

### Route Components

**Location**: `src/routes/` (tests co-located)

```
src/routes/
├── index.tsx              # Route table + lazy boundaries
├── BibleRoute.tsx         # USFM ref parsing → store sync
├── LegacyBibleRedirect.tsx# /bible/:book/:chapterVerse → canonical
├── NotesRoute.tsx         # Tag load + redirect
├── TagNotesRoute.tsx      # Tag notes list (pagination, reorder)
├── NoteDetailRoute.tsx    # Single note view
├── TagManagementRoute.tsx # Tag CRUD
├── SearchRoute.tsx        # Book-grouped search results
└── LoginPage / RegisterPage (in src/components/)
```

### URL/Store Synchronization

The routing system maintains sync between URL params and the Zustand
store inside `BibleRoute.tsx`:

**URL → Store** (one-way sync):
```typescript
// BibleRoute.tsx — `ref` is the USFM param (e.g. "JHN.3.16-18"),
// `parsed` comes from the ref parser.
useEffect(() => {
  setShowNotes(false);
  setVersesFolded(false);

  if (ref === undefined) {
    void navigate(`/bible/${activeBookId}.${activeChapter}`,
      { replace: true });
    return;
  }
  if (!parsed) {
    void navigate('/bible', { replace: true });
    return;
  }
  if (parsed.needsRedirect) {
    void navigate(`/bible/${parsed.canonical}`, { replace: true });
    return;
  }
  if (
    parsed.bookId !== activeBookId ||
    parsed.chapter !== activeChapter
  ) {
    setActiveBookAndChapter(parsed.bookId, parsed.chapter);
  }
}, [ref, parsed, activeBookId, activeChapter]);
```

**Key Principle**: the URL is the single source of truth. Navigation
components call `navigate()` with a canonical USFM ref; `BibleRoute`
parses it, canonicalizes it (lowercase codes, book names, and missing
chapters redirect to `parsed.canonical`), and syncs the store.

### Navigation Pattern

**All navigation components use `useNavigate()`:**

```typescript
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

// Navigate to a chapter (USFM code + chapter)
void navigate(`/bible/${bookId}.${chapter}`);
// With a verse range
void navigate(`/bible/${bookId}.${chapter}.${from}-${to}`);
```

**Navigation components**:
- `BibleSelector.tsx` - Book/chapter/verse sidebar picker
- `BottomNav.tsx` - Footer prev/next arrows + title
- `Verse.tsx` - Verse click writes a USFM ref to the URL
- `PassagePicker.tsx` - Note-modal passage selection

**Pattern**:
```typescript
// ❌ OLD: Direct store updates (pre-USFM routing)
setActiveBook('Matthew');
setActiveChapter(5);

// ✅ CURRENT: URL-based navigation (USFM ref)
void navigate('/bible/MAT.5');
// BibleRoute parses and syncs to the store
```

### Features

✅ **Direct URL Access**: Type `/bible/JHN.3` in the browser
✅ **Browser Navigation**: Back/forward buttons work
✅ **Page Refresh**: Maintains current location
✅ **Shareable URLs**: `/bible/JHN.3.16-18` shares a verse range
✅ **Deep Linking**: Bookmark any passage
✅ **Legacy Redirects**: `/bible/John/3` → `/bible/JHN.3`

### Testing

**Test Setup**: Route tests are co-located
(`src/routes/BibleRoute.test.tsx`) and use `MemoryRouter`.

```typescript
import { MemoryRouter, Route, Routes } from 'react-router-dom';

render(
  <MemoryRouter initialEntries={['/bible/JHN.1']}>
    <Routes>
      <Route path="/bible/:ref" element={<BibleRoute />} />
    </Routes>
  </MemoryRouter>
);
```

**Test Coverage**:
- ✅ USFM ref parsing, canonicalization redirects
- ✅ Store updates
- ✅ Verse-range selection from the URL
- ✅ No infinite loops

**Run Tests**:
```bash
npm test -- src/routes/BibleRoute.test.tsx
```

### Implemented Routes

**Bible Routes** (✅ Implemented):
- `/` - Redirects to `/bible`
- `/bible` - Redirects to `/bible/{activeBookId}.{activeChapter}`
- `/bible/:ref` - USFM chapter or verse-range ref
- `/bible/:book/:chapterVerse` - Legacy redirect
- `*` (catch-all) - Redirects to `/bible`

**Notes Routes** (✅ Implemented):
- `/notes` - Auto-redirects to the last/first tag; shows a
  real empty state when the user has no tags and an
  error + retry state when tag loading fails; anonymous
  visitors are redirected to `/bible`
- `/notes/tag/:tagId` - Displays notes filtered by specific tag;
  `/notes/tag/untagged` shows notes with no tag. Public for
  sharing — write affordances are `isAuthenticated`-gated
- `/notes/:noteId` - Single note detail view; public for sharing

**Tag Routes** (✅ Implemented):
- `/tags` - Tag management; wrapped in `ProtectedRoute`
  (anonymous visitors redirect to `/login`)

**Auth Routes** (✅ Implemented):
- `/login`, `/register`

**Search Routes** (✅ Implemented):
- `/search?q=<query>` - Book-grouped search results

**Components**:
- `BibleRoute` - USFM ref parsing, canonicalization, URL→store sync
- `LegacyBibleRedirect` - Legacy `/bible/:book/:chapterVerse` → USFM
- `NotesRoute` - Loads tags and redirects to the default tag
- `TagNotesRoute` - Notes for a tag with pagination/reorder
- `NoteDetailRoute` - Single note detail view
- `TagManagementRoute` - Tag CRUD behind `ProtectedRoute`
- `SearchRoute` - Book-grouped search results accordion

### Route Implementation Details

**NotesRoute** (`src/routes/NotesRoute.tsx`):
- Fetches all tags from API (authenticated users only —
  anonymous visitors are redirected to `/bible`)
- Automatically redirects to `/notes/tag/:tagId` — the tag
  choice is `defaultTagId` in `src/utils/defaultTag.ts`:
  the last-viewed tag if it still exists, else the
  alphabetically first tag
- A zero-tag user sees an empty state ("Create your first
  tag") and a failed tag fetch an error + retry state —
  neither spins on the loader forever
- Minimal component - main logic in TagNotesRoute

**TagNotesRoute** (`src/routes/TagNotesRoute.tsx`):
- Fetches notes for specific tag via API
- Displays tag selector dropdown (searchable); a separate
  "Untagged" section at the bottom lists notes with no tag
  (`tag_id=untagged` API sentinel). Custom-sort reordering and
  the order menu are disabled there — reorder endpoints need a
  real tag id
- Shows note count
- Provides full CRUD operations:
  - View note in Bible passage
  - Edit note (opens modal)
  - Delete note (with confirmation; the card is removed from
    state as soon as the DELETE resolves, then the current page
    is refetched to backfill the latest server state)
- Handles "View in Bible" navigation
- Updates URL when switching tags
- Sort order comes from the `?sort=` URL param; writing the
  param is the only fetch trigger (the load effect owns it),
  and re-sorts use the in-page spinner, not the full loader
- Write affordances (drag handles, edit/delete, order badge)
  require **ownership**, not just login: the tag must appear
  in the authenticated user's own tag list, or every visible
  note must report `is_owner === true`, so logged-in viewers
  of someone else's public tag get a read-only page
- Play-from-note indexes into the filtered playlist of notes
  that actually have verses; a note spanning several
  book/chapter blocks produces one playlist item per block
- In custom sort on an owned tag, each note card shows a
  `#k` order badge (`NoteOrderMenu`) that opens a dropdown
  of every note in the tag and the list is dnd-kit
  reorderable — see "Note order badges & moves"
  under Note Taking & Tagging. Reorder UI additionally
  requires tag ownership (`isTagOwner`: the viewed tag is in
  the caller's own list, or every loaded note reports
  `is_owner === true`) — shared/public tag pages hide it for
  non-owners (the backend rejects foreign moves with 400/409
  anyway)
- The route is thin view wiring over three hooks +
  `TagNotesToolbar`: `useTagNotesData` (load/pagination/
  refresh/delete orchestration), `useNoteOrderMenu` (order
  index + moves), `useNotePlaylist` (audio playlist assembly —
  one item per book+chapter block; its play-from index
  addresses the verse-filtered playlist array by `scope`)
- The filter/sort toolbar rides on `headerVisible`: it
  collapses (`Collapse`, aria-hidden) whenever MyHeader
  slides away on a downward scroll and the notes list
  flex-grows into the freed space

**Navigation Pattern**:
```typescript
// User clicks "View Notes" in menu
navigate('/notes');
// → NotesRoute loads tags
// → Auto-redirects to /notes/tag/:firstTagId
// → TagNotesRoute displays notes for that tag

// User selects different tag
navigate('/notes/tag/:newTagId');
// → TagNotesRoute fetches and displays new notes
```

### Future Routes (Planned)

- `/notes/new` - Create new note (today creation happens via
  `AddTagNoteModal`/`AddStandaloneNoteModal`)
- `/notes/:noteId/edit` - Edit note (today editing happens via
  `EditNoteModal`)

---

## State Management

**Location**: `src/store.ts` (composition root) +
`src/stores/bibleStore/` (notesSlice, persistence) +
`src/stores/authStore.ts` (auth: token, user, login/register/
logout)

The application uses Zustand for lightweight, centralized state
management. The main store (`bible-storage`, schema v5 with a
custom `migratePersistedState`) is persisted to `localStorage`;
auth lives in a separate persisted `authStore`.

### State Shape (`BibleState`)

**Navigation State**:
- `activeBookId: string` - Current book's USFM code (e.g., `JHN`)
- `activeChapter: number` - Current chapter number
- `verseSelection: VerseSelection | null` - Selected verses as
  `{ scope, refs }`; `scope` is `'bible'` for the chapter view or
  `note:<id>` inside a `NoteCard`, and each `ref` is a
  `{ bookId, chapter, verse }` USFM `VerseRef`
- `pendingScrollVerse: VerseRef | null` - Transient (not
  persisted) scroll target queued by reading-position restores

**Translation State**:
- `bibleVersion: string` - Display abbreviation (e.g., "KJV")
- `translations: Translation[]` - Available translations,
  accumulated per language
- `activeTextFilesetId: string | null` - Stored text id (product
  or member; resolve via `resolveTextFileset` before use)
- `activeAudioFilesetId: string | null` - Stored audio id
  (`{abbr}:{kind}:{n}` product or member)

**UI State**:
- `showAudioPlayer: boolean` - Audio player visibility (NOT
  persisted)
- `showNotes: boolean` - Toggles between Bible view and Notes
  view inside `Passage`
- `versesFolded: boolean` - Collapses long chapter ranges
- `headerVisible: boolean` - Auto-hiding header state

**Notes State** (orchestrated in
`src/stores/bibleStore/notesSlice.ts`):
- `tags: Tag[]`, `notes: Note[]`, `allNotesFetched: boolean`
- Pagination: `notesCount`, `notesPage`, `notesPageSize`,
  `notesHasMore`, `notesOrdering`
- `lastSelectedTagId: string | null` - remembered for the
  `/notes` redirect

**Audio Playlist State**:
- `audioPlaylistItems: PlaylistItem[] | null` - flattened play
  list (notes, search results, chapters)
- `audioPlaylistStartIndex: number | null`
- `audioActiveVerse: AudioActiveVerse | null` - verse currently
  being played (drives highlighting)

**Reading Positions**:
- `readingPositions: Record<string, ReadingPositionValue | null>`
  - persisted per-book cache keyed by USFM code (see "Reading
  Position Functions")

### Actions (Setters)

**Navigation Actions**:
- `setActiveBookAndChapter(bookId, chapter)` - Canonical setter
  used by `BibleRoute`'s URL sync
- `setActiveChapter(chapter)` - Chapter-only update
- `setVerseSelection(selection)` - Replace the scoped selection
- `toggleVerseRef(scope, ref)` - Toggle one `VerseRef` in/out of
  a scope's selection
- `selectVerseRange(scope, refs)` - Shift-click range selection
- `prepareBookSwitch(bookId)` - Resolves the saved reading
  position, queues `pendingScrollVerse`, and returns the target
  chapter — does NOT write `activeBookId`/`activeChapter` (the
  caller navigates and `BibleRoute`'s URL sync owns the book).
  Returns a bare `number` when the position is known locally
  (cached map / anonymous / offline) so the caller can navigate
  in the same commit; a `Promise` only when an authenticated
  fetch is required
- `syncReadingPosition(bookId, chapter, verse)` - Local cache +
  API push when authenticated
- `prefetchReadingPositions()` - Bulk fetch on app load

**Translation Actions**:
- `setBibleVersion`, `setTranslations`,
  `setActiveTextFilesetId`, `setActiveAudioFilesetId`

**UI Actions**:
- `setShowAudioPlayer`, `setShowNotes`, `setVersesFolded`,
  `setHeaderVisible`, `setPendingScrollVerse`

**Notes Actions**:
- `fetchNotes(tagId?, options?)` - Paginated per-tag fetch with
  cache (see notesSlice)
- `getTags(forceRefresh?)`, `deleteNote`, `reorderNotes`,
  `moveNoteAfter`, `setNotesPage`, `setNotesPageSize`,
  `setLastSelectedTagId`

**Audio Actions**:
- `setAudioPlaylistItems`, `setAudioPlaylistStartIndex`,
  `setAudioActiveVerse`

### Auto-Scroll Behavior

Scroll-to-verse is handled inside `Verse.tsx`: when a verse's
`isActive` flag flips (via `verseSelection`), the component calls
`ref.scrollIntoView({ block: 'center', behavior: 'smooth' })`.
Position-restore scrolls use the `pendingScrollVerse` queue.

### Persistence

`persist()` from `zustand/middleware` wraps the store:

```typescript
persist(
  (set, get) => ({ /* state and actions */ }),
  {
    name: 'bible-storage',
    version: 5,
    storage: createJSONStorage(() => localStorage),
    partialize: /* in stores/bibleStore/persistence.ts */,
    migrate: migratePersistedState,
  }
)
```

`showAudioPlayer`, `pendingScrollVerse`, and the audio-playlist
fields are intentionally NOT persisted. Bump `version` and extend
`migratePersistedState` whenever the persisted shape changes.

**Usage in Components**:
```typescript
// Subscribe narrowly to avoid rerenders
const activeBookId = useBibleStore((state) => state.activeBookId);
const setActiveChapter =
  useBibleStore((state) => state.setActiveChapter);
```

---

## Types & Interfaces

**Location**: `src/types.ts` (all shared interfaces),
`src/api/` (response-shaping helpers)

### Core Types (`src/types.ts`)

#### `Tag`
Represents a tag for organizing notes.

```typescript
export interface Tag {
  id: string;
  name: string;
  parent_tag: string | null;  // For hierarchical tags
  created_at: string;
  updated_at: string;
}
```

#### `Verse` / `Note`
`Verse` is the backend verse object (`book` is a title-cased
display name, e.g. "John" — not a USFM code). `Note` adds
ownership, ordering, and optional per-note provider errors:

```typescript
export interface Verse {
  book: string;      // display name, e.g. "John"
  chapter: number;
  verse: number;
  text: string;
}

export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag | null;           // null = untagged note
  verses: Verse[];
  headings?: SectionHeading[];
  tag_position: number | null;
  error?: string;            // provider failed to resolve text
  error_code?: string;       // 'rate_limited' | 'provider_error'
}
```

#### `VerseRef` / `VerseSelection`
USFM-keyed selection model shared by `PassageView` and note
cards:

```typescript
export interface VerseRef {
  bookId: string;   // USFM code, e.g. "JHN"
  chapter: number;
  verse: number;
}

/** 'bible' = PassageView chapter; a note id = inside that
 *  NoteCard. */
export type VerseScope = string;

export interface VerseSelection {
  scope: VerseScope;
  refs: VerseRef[];
}
```

#### `Fileset` / `Translation`

```typescript
export interface Fileset {
  id: string;  // e.g., "ENGKJV", "ENGESVN1DA"
  type: "text_plain" | "audio" | "audio_drama";
  size: string;  // e.g., "NT", "OT", "C" (complete)
  codec: "mp3" | "opus" | null;
  bitrate: string | null;
}

export interface Translation {
  abbr: string;
  name: string;
  language: string;
  language_iso: string;
  filesets: Fileset[];
  audio_options?: unknown[];  // backend-normalized options
  text_options?: unknown[];   // (take precedence over grouping)
}
```

#### `KjvBook`
Represents a verse from the local KJV JSON file.

```typescript
export interface KjvBook {
  chapter: number;
  verse: number;
  text: string;
  translation_id: string;
  book_id: string;    // USFM-style code
  book_name: string;  // Full name
}
```

#### `AudioApiResponse` (`src/api/audio.ts`)
Raw response from the Bible Research audio endpoint — note the
loose error fields; `src/api/errors.ts` maps them to typed
errors:

```typescript
interface AudioApiResponse {
  error?: string | { message?: string };
  error_code?: unknown;
  audio_url?: unknown;
  duration_seconds?: number;
  file_size_bytes?: number;
  meta?: unknown;
}
```

### Bible Utility Types (`src/utils/bibleUtils.ts`)

#### `Testament`
Old or New Testament identifier.

```typescript
export type Testament = 'OT' | 'NT';
```

#### `BibleBook`
Represents a Bible book with metadata.

```typescript
export interface BibleBook {
  name: string;      // Lowercase full name (e.g., "genesis")
  code: string;      // 3-letter uppercase code (e.g., "GEN")
  testament: Testament;
}
```

---

## Testing Guidelines

This project uses **Vitest** and **React Testing Library** for unit and
integration testing. We follow React community best practices for test
organization and implementation.

### Test Organization

We follow a **co-location** strategy for our tests. This means that test files
are placed directly next to the source code they are testing. This makes it
easier to find and maintain tests.

**Example Structure**:
```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx      ✅ Co-located
├── utils/
│   ├── format.ts
│   └── format.test.ts       ✅ Co-located
├── api/
├── api.test.ts              ✅ Co-located
├── store.ts
└── store.test.ts            ✅ Co-located
```

**Shared Test Infra & Regression Tests**:

`src/__tests__/` holds shared test infrastructure plus
app-level integration/regression tests — unit tests stay
co-located, so only suites exercising the whole app (or a
cross-component bug) live here. Regression files are named
`<behavior-slug>[-#issue].test.tsx` with a mandatory header
comment linking the GitHub issue or explaining context:

```
src/__tests__/
├── helpers.tsx          # renderWithProviders, resetStore
├── helpers/             # factories + performance helpers
├── mocks/               # shared doubles (FakeHowl) + fixtures
├── integration/         # multi-route integration tests
├── audio-stop-on-chapter-switch-62.test.tsx   # issue #62
├── chapter-scroll-reset-63.test.tsx           # issue #63
├── bottomnav-title-sync-95.test.tsx           # issue #95
├── chapter-response-race-110.test.tsx         # issue #110
├── multi-verse-selection.test.tsx             # selection flows
├── shift-click-range-selection.test.tsx       #   (no issue # —
├── note-card-verse-selection.test.tsx         #   see headers)
└── SKIPPED_TESTS.md     # policy: zero skipped tests
```

### Running Tests

**ALWAYS run tests in headless CI mode**. This ensures that tests execute once
and exit without watching for changes, which is critical for both local
development and CI environments.

```bash
# Run the full test suite in headless CI mode
npm test

# Run a specific test file
npm test -- src/components/Button.test.tsx --run

# Run tests with a coverage report
npm test -- --run --coverage
```

**⚠️ IMPORTANT**: Use `npm run test:ui` to run tests in watch mode with the
interactive UI. Use `npm test` for a single, headless run, which is suitable
for CI environments.

### Test Configuration

Test configuration is managed in `vite.config.ts`:

```typescript
test: {
  globals: true,
  environment: 'happy-dom', // Fast, but less complete than jsdom
  setupFiles: 'src/setupTests.ts',
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  testTimeout: 30000,
  // Serial on purpose: suites mounting the full <App/> tree
  // eagerly bundle kjv.json's ~31k verses; parallel workers
  // peak past the default heap and die with
  // ERR_WORKER_OUT_OF_MEMORY.
  fileParallelism: false,
}
```

`src/setupTests.ts` starts the MSW server with
`onUnhandledRequest: 'error'` (unexpected requests fail loudly
instead of reaching a real backend) and resets shared state before
every test: both Zustand stores, the cache manager's in-memory
Map, `localStorage`, and `globalThis.fetch` (restoring the
MSW-intercepted fetch after tests that stub it). Store resets use
dynamic imports inside `beforeEach` so per-file `vi.mock()`
declarations still intercept the app modules.

### Test Helpers

A comprehensive set of test helpers is available in
`src/__tests__/helpers.tsx`. The most important helper is
`renderWithProviders`, which wraps components with the necessary providers
(Zustand store, etc.) for testing.

**Example Usage**:
```typescript
import { renderWithProviders } from '../__tests__/helpers';

it('should render correctly', () => {
  renderWithProviders(<MyComponent />);
  // ... assertions
});

// With store overrides
it('should show disabled state', () => {
  renderWithProviders(<MyComponent />, {
    storeOverrides: { someValue: false },
  });
  // ... assertions
});
```

### Async Testing Best Practices

When testing asynchronous behavior in React components, follow these guidelines
to write clean, reliable tests:

#### 1. Use `findBy*` Queries for Async Elements

**✅ CORRECT** - `findBy*` queries wait for elements to appear:
```typescript
it('should display loaded data', async () => {
  renderWithProviders(<MyComponent />);
  
  // findBy* automatically waits (up to 1000ms by default)
  const element = await screen.findByText('Loaded content');
  expect(element).toBeInTheDocument();
});
```

**❌ INCORRECT** - Don't use `getBy*` for async content:
```typescript
it('should display loaded data', () => {
  renderWithProviders(<MyComponent />);
  
  // This will fail - element doesn't exist yet!
  const element = screen.getByText('Loaded content');
  expect(element).toBeInTheDocument();
});
```

#### 2. Avoid Redundant `waitFor()` Wrappers

**✅ CORRECT** - Use `findBy*` directly:
```typescript
it('should show error message', async () => {
  renderWithProviders(<MyComponent />);
  
  const error = await screen.findByText('Error occurred');
  expect(error).toBeInTheDocument();
});
```

**❌ INCORRECT** - Unnecessary `waitFor()` wrapper:
```typescript
it('should show error message', async () => {
  renderWithProviders(<MyComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });
});
```

#### 3. Don't Wrap `userEvent` in `act()`

**✅ CORRECT** - `userEvent` already wraps actions in `act()`:
```typescript
it('should handle button click', async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyComponent />);
  
  await user.click(screen.getByRole('button'));
  expect(screen.getByText('Clicked')).toBeInTheDocument();
});
```

**❌ INCORRECT** - Redundant `act()` wrapper:
```typescript
it('should handle button click', async () => {
  const user = userEvent.setup();
  renderWithProviders(<MyComponent />);
  
  await act(async () => {
    await user.click(screen.getByRole('button'));
  });
  expect(screen.getByText('Clicked')).toBeInTheDocument();
});
```

#### 4. Use `waitFor()` Only When Necessary

Use `waitFor()` when you need to wait for a condition that isn't a DOM query:

**✅ CORRECT** - Waiting for a callback to be called:
```typescript
it('should call callback after delay', async () => {
  const callback = vi.fn();
  renderWithProviders(<MyComponent onComplete={callback} />);
  
  await waitFor(() => {
    expect(callback).toHaveBeenCalled();
  });
});
```

**✅ CORRECT** - Waiting for element to disappear:
```typescript
it('should hide loading spinner', async () => {
  renderWithProviders(<MyComponent />);
  
  await waitFor(() => {
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
```

#### 5. Testing Loading States

**✅ CORRECT** - Test both loading and loaded states:
```typescript
it('should show loading then content', async () => {
  renderWithProviders(<MyComponent />);
  
  // Check loading state appears immediately
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  
  // Wait for content to load
  const content = await screen.findByText('Loaded content');
  expect(content).toBeInTheDocument();
  
  // Verify loading state is gone
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
```

#### 6. Handling API Mocks

Use MSW (Mock Service Worker) for API mocking instead of `vi.mock()`:

**✅ CORRECT** - Use MSW handlers (derive URLs from `API_BASE_URL` —
never hardcode a host):
```typescript
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import { http, HttpResponse } from 'msw';

it('should fetch and display data', async () => {
  server.use(
    http.get(`${API_BASE_URL}/api/v1/data`, () => {
      return HttpResponse.json({ message: 'Hello' });
    })
  );

  renderWithProviders(<MyComponent />);

  const message = await screen.findByText('Hello');
  expect(message).toBeInTheDocument();
});
```

The default handlers live in `src/mocks/handlers.ts`; `server.use`
overrides them per test and `server.resetHandlers()` runs in
`afterEach`. Because the server errors on unhandled requests, any
new endpoint the app calls needs a default handler.

**Mocking Howler**: audio tests share one fake —
`src/__tests__/mocks/FakeHowl.ts`. It implements an `instances[]`
registry, a `'loading' → 'loaded'` lifecycle, real `seek`
position tracking, constructor `on*` callbacks, deferred `'play'`
with `playerror`-on-teardown, and an `<audio>` node stub for
`getHtml5AudioNode`. Drive state with the test-only
`emit(event, ...)` helper and clear the registry with
`FakeHowl.reset()` in `beforeEach`:

```typescript
import { FakeHowl } from '../__tests__/mocks/FakeHowl';

vi.mock('howler', async () => {
  const { FakeHowl } = await import('../__tests__/mocks/FakeHowl');
  return { Howl: FakeHowl };
});

beforeEach(() => FakeHowl.reset());
```

**❌ INCORRECT** - Module-level mocking:
```typescript
vi.mock('../api', () => ({
  fetchData: vi.fn().mockResolvedValue({ message: 'Hello' }),
}));

it('should fetch and display data', async () => {
  renderWithProviders(<MyComponent />);
  // ...
});
```

#### 7. Common Async Patterns

**Pattern: Wait for multiple elements**
```typescript
it('should display all items', async () => {
  renderWithProviders(<ItemList />);
  
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(3);
});
```

**Pattern: Wait with custom timeout**
```typescript
it('should handle slow operation', async () => {
  renderWithProviders(<MyComponent />);
  
  const result = await screen.findByText(
    'Completed',
    {},
    { timeout: 5000 } // Wait up to 5 seconds
  );
  expect(result).toBeInTheDocument();
});
```

**Pattern: Test error handling**
```typescript
it('should display error on API failure', async () => {
  server.use(
    http.get('/api/data', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );
  
  renderWithProviders(<MyComponent />);
  
  const error = await screen.findByText('Failed to load');
  expect(error).toBeInTheDocument();
});
```

### Performance Testing

Performance tests ensure that components render efficiently and don't cause
performance regressions. We use custom performance testing utilities located in
`src/__tests__/helpers/performanceUtils.ts` (non-component helpers) and
`src/__tests__/helpers/performance.tsx` (`RenderCounter` only).

#### When to Add Performance Tests

Add performance tests for:
- Components that render large lists or datasets
- Components with complex rendering logic
- Components that re-render frequently
- Critical user-facing components (e.g., PassageView)
- Components with memoization or optimization

#### Performance Testing Utilities

**Available Utilities**:
```typescript
import {
  measureRenderTime,
  createLargeVerseData,
  CacheMetrics,
  useRenderCount,
  waitForNextFrame,
} from '../__tests__/helpers/performanceUtils';
import { RenderCounter } from '../__tests__/helpers/performance';
```

#### Performance Test Examples

**1. Measure Render Time**
```typescript
import { measureRenderTime }
  from '../__tests__/helpers/performanceUtils';

it('should render quickly', () => {
  const renderFn = () => {
    render(<MyComponent />);
  };
  
  const avgTime = measureRenderTime(renderFn, 100);
  
  // Should render in less than 10ms on average
  expect(avgTime).toBeLessThan(10);
  
  console.log(`Avg render time: ${avgTime.toFixed(2)}ms`);
});
```

**2. Test Large Data Handling**
```typescript
import { createLargeVerseData }
  from '../__tests__/helpers/performanceUtils';

it('should handle 200 verses efficiently', async () => {
  const verses = createLargeVerseData(200);
  mockGetVersesInChapter.mockResolvedValue(verses);
  
  const start = performance.now();
  
  const { container } = render(<PassageView />);
  
  await waitFor(() => {
    expect(container.querySelector('[title="passage-verse-1-1"]'))
      .toBeInTheDocument();
  });
  
  const duration = performance.now() - start;
  
  // Should render in less than 1 second
  expect(duration).toBeLessThan(1000);
  
  console.log(`Rendered 200 verses in ${duration.toFixed(2)}ms`);
});
```

**3. Test Re-render Performance**
```typescript
it('should minimize re-renders', () => {
  const { rerender } = render(<MyComponent />);
  
  const start = performance.now();
  
  // Simulate 50 re-renders
  for (let i = 0; i < 50; i++) {
    rerender(<MyComponent />);
  }
  
  const duration = performance.now() - start;
  
  // Should complete quickly
  expect(duration).toBeLessThan(200);
  
  console.log(`50 re-renders in ${duration.toFixed(2)}ms`);
});
```

**4. Test Cache Performance**
```typescript
import { CacheMetrics }
  from '../__tests__/helpers/performanceUtils';

it('should achieve high cache hit rate', () => {
  const metrics = new CacheMetrics();
  
  // Populate cache
  for (let i = 1; i <= 10; i++) {
    cacheVerses('Genesis', i, 'KJV', verses);
  }
  
  // Access cached items
  for (let i = 1; i <= 10; i++) {
    const result = getCachedVerses('Genesis', i, 'KJV');
    if (result) {
      metrics.recordHit();
    } else {
      metrics.recordMiss();
    }
  }
  
  const stats = metrics.getStats();
  expect(stats.hitRate).toBeGreaterThan(0.95); // 95%+ hit rate
});
```

**5. Test Memory Efficiency**
```typescript
it('should not leak memory with repeated renders', () => {
  const iterations = 100;
  
  for (let i = 0; i < iterations; i++) {
    const { unmount } = render(<MyComponent />);
    unmount();
  }
  
  // Test should complete without hanging or crashing
  expect(true).toBe(true);
});
```

#### Performance Test File Naming

Performance tests should be named with the `.performance.test.tsx` suffix:
```
src/components/
├── PassageView.tsx
├── PassageView.test.tsx              # Unit tests
└── PassageView.performance.test.tsx  # Performance tests
```

#### Performance Benchmarks

**Target Metrics**:
- **Small components** (< 10 elements): < 10ms render time
- **Medium components** (10-50 elements): < 50ms render time
- **Large components** (50-200 elements): < 500ms render time
- **Re-renders**: < 5ms per re-render
- **Cache hit rate**: > 95% for repeated access
- **Memory**: No leaks with 100+ mount/unmount cycles

#### Running Performance Tests

```bash
# Run all performance tests
npm test -- --run **/*.performance.test.tsx

# Run specific performance test
npm test -- --run src/components/PassageView.performance.test.tsx

# Run with performance logging
npm test -- --run --reporter=verbose **/*.performance.test.tsx
```

---

## Bible Utilities

**Location**: `src/utils/bibleUtils.ts`

This module provides constants and helper functions for working with Bible
books, testaments, and their various identifiers.

### Data Structures

The file exports several pre-computed data structures for efficient lookups:

- **`BIBLE_BOOKS`**: The source of truth. An array of all 66 Bible books, each
  with its full name, 3-letter code, and testament ('OT' or 'NT').
  ```typescript
  interface BibleBook {
    name: string;
    code: string;
    testament: 'OT' | 'NT';
  }
  ```

- **`BOOK_NAME_TO_CODE`**: A map from a book's full name to its 3-letter code.
  - Example: `BOOK_NAME_TO_CODE['genesis']` returns `'GEN'`.

- **`BOOK_CODE_TO_TESTAMENT`**: A map from a book's 3-letter code to its
  testament.
  - Example: `BOOK_CODE_TO_TESTAMENT['MAT']` returns `'NT'`.

- **`OLD_TESTAMENT_BOOKS`**: A `Set` containing the 3-letter codes of all Old
  Testament books for fast lookups.

- **`NEW_TESTAMENT_BOOKS`**: A `Set` containing the 3-letter codes of all New
  Testament books.

### Helper Functions

#### `getTestament()`

Determines the testament of a given Bible book code.

```typescript
/**
 * @param bookCode - The 3-letter code for the Bible book (e.g., 'GEN').
 * @returns The testament ('OT' or 'NT') or null if not found.
 */
export const getTestament = (bookCode: string): Testament | null => { ... };

// Example Usage
getTestament('JHN'); // 'NT'
getTestament('EXO'); // 'OT'
getTestament('XYZ'); // null
```

## Core Functionalities

### 1. Bible Reading & Navigation

**Location**: `src/components/BibleSelector.tsx`,
`src/components/Passage.tsx`, `src/components/PassageView.tsx`,
`src/components/Verse.tsx`, `src/components/BottomNav.tsx`

The app provides three-level navigation:
- **Books**: 66 books of the Bible (Genesis to Revelation)
- **Chapters**: Dynamic chapter list per book
- **Verses**: Individual verse navigation and selection

**Key Features**:
- Sidebar book/chapter/verse picker (`BibleSelector`)
- Bottom prev/next chapter bar (`BottomNav`) with the current
  book/chapter title kept in sync
- Active state highlighting
- Smooth scroll-to-view for selected verses
- Responsive design (collapsible on mobile)

**API Functions**:
```typescript
getBooks(): { book_name: string; book_id: string }[]
getChapters(book: string): number[]
getVerses(book: string, chapter: number): number[]
```

### 2. Multi-Translation Support

**Location**: `src/api/translations.ts`,
`src/components/TranslationSelector.tsx`

Provides dynamic, API-driven support for multiple Bible translations, including
different text and audio formats for each.

**Key Features**:
- **Dynamic Translation Loading**: Fetches available translations from the
  backend API.
- **Text & Audio Selection**: Users can select preferred text and audio
  filesets independently.
- **Flexible Audio Options**: Supports multiple audio types (e.g., `audio`,
  `audio_drama`) and formats (e.g., `mp3`, `opus`).
- **State-Driven**: Selections are stored in the global Zustand store and
  persisted in localStorage.

**Implementation**:
- A `TranslationSelector` modal allows users to browse and select versions.
- The language tab bar offers English, Latvian, Russian, and an
  **Other** tab: a debounced (300 ms, ≥2 chars) language search
  backed by `GET /api/v1/bible/languages/` (the backend proxies
  DBT's `/languages`). Picking a language fetches its
  translations like any fixed tab; the tab relabels to
  `Other: <name>` and a stored non-listed iso re-seeds Other on
  reopen. A language whose DBT-wide `bibles` count is non-zero
  but which returns no versions for our API key shows a "No
  versions available for this language" empty state.
- The tab bar is wrapped in a `ScrollArea` (`min-width:
  max-content`, `white-space: nowrap` labels) so the four tabs
  scroll horizontally on narrow screens; a no-op on desktop.
- All data fetching is now driven by a `filesetId` instead of a simple version
  string.

```typescript
// Fetches available translations for a language
getAvailableTranslations(languageIso: string): Promise<Translation[]>

// Searches the DBT language catalog (Other tab); `limit` is
// forwarded to the backend (DBT clamps to ~150/page). Results
// are cached per `search:page:limit` in
// `bible_language_cache` — error bodies and empty pages are
// never cached (no TTL or forceRefresh escape hatch)
searchLanguages(
  search: string, page = 1, limit?: number
): Promise<LanguageResult[]>

// Fetches verse content based on a specific fileset ID
getVersesInChapter(
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]>
```

**Data Flow**:
1. `TranslationSelector` fetches available translations for the
   selected language and merges them by `abbr` into the Zustand
   store (per-language lists accumulate — stored product ids may
   reference translations outside the active language tab).
2. User picks a version; its filesets are grouped into
   product-like options (see below). The text fileset is
   auto-resolved per testament — no picker; audio is offered as
   product radios ("Read aloud", "Dramatized", "Generated
   voice", or None). A collapsed "Advanced" section exposes raw
   fileset ids for debugging (opus16 codec variants are hidden —
   opus16 is the default and mp3 the automatic fallback).
3. Selections are saved to the Zustand store —
   `activeAudioFilesetId` stores the product id (e.g.
   `ENGESV:audio:0`), `activeTextFilesetId` the text product or a
   member id; the resolvers below accept either form, so legacy
   persisted ids keep working.
4. Components like `PassageView` and `Audio` react to state
   changes, resolving the stored id to the concrete fileset that
   covers each book's testament.

**Audio-only versions**: when a version has no text option and
the active text fileset belongs to another language, the
selector auto-selects a same-language text version (preferring
full coverage) and shows a "Text: {name} — auto-selected" note.
If the active text is already same-language it is kept; if no
same-language text exists the current text is kept with an info
note.

**Audio default**: picking a version keeps the stored audio
product when the version owns it, otherwise defaults to the
first audio option (preferring a real option over None) —
audio-only versions behave the same. Reopening the modal on the
current selection restores the stored value verbatim, so a
saved "None" is shown as None rather than re-defaulting.

**Fileset groups & resolution** (`src/utils/filesetGroups.ts`):

A translation's raw `filesets` are normalized into product-like
options: `groupFilesets(translation)` merges opus16/mp3 codec
pairs and testament-split members into `FilesetOption`s
(`byTestament[OT|NT][codec] -> concrete fileset id`, kind
`audio`/`audio_drama`/`generated`/`text`). Backend-provided
`audio_options`/`text_options` take precedence when present.

- `resolveTextFileset(storedId, bookId, translations)` resolves
  a stored id (product or member) to the concrete `text_plain`
  fileset covering the book's testament — `_ET` splits are
  handled transparently; unknown ids pass through.
- `resolveAudioFileset(storedId, bookId, translations)` returns
  `{ filesetId, codec, alternates }`: opus16 is preferred, and
  `alternates` is ordered mp3 sibling → other-testament member →
  same-kind options → any audio option. Playback walks this list
  on `BookNotInFilesetError` or Howler load/play errors before
  notifying.
- `preferTimestampedAudio(filesetId, translations)` swaps a
  resolved audio fileset for the timestamp-backed sibling
  recording in `TIMESTAMP_BACKED_AUDIO` (`bibleUtils.ts`) —
  `ENGESHO1DA` has no DBT verse timestamps while `ENGESVO1DA`
  does — but only when the replacement id exists among the
  loaded translations. Both `useAudioPlaylist` and `Audio.tsx`
  apply it to the primary candidate (keeping the resolved id as
  a fallback) so verse seeks/bounds always match the playing
  recording. When a recording still has no timestamps, the
  playlist degrades to whole-chapter playback with a one-time
  notification.
- A stored `{abbr}:{kind}:{n}` product id that matches neither a
  product id nor a member falls back to the nth option of that
  kind owned by that translation — covers the 0-based
  (client-minted) vs 1-based (backend-minted) index drift across
  the backend `audio_options`/`text_options` rollout. Callers
  must resolve stored ids before sending them as `fileset_id`
  (SearchRoute, AddTagNoteModal, notes fetching, etc.).
- Coverage comes from `sizeToCoverage(size)` in `bibleUtils.ts`
  (`C`, `NT`/`OT`, partial `NTP`/`OTP`/`NTPOTP`, `NT1`-style).
- Special ids: `ENGKJV` (local text bundle + wordpocket audio),
  `LVSGLU8C1DA` (generated SWORD TTS), `ENGESV_API` (esv.org
  proxy) — each a single-variant option.
- `getAvailableTranslations` injects the `ENGKJV` text/audio
  pseudo-filesets into the ENGKJV translation so the bundled KJV
  stays selectable.

### 3. Advanced Search

**Location**: `src/routes/SearchRoute.tsx`

Full-text search across the Bible via the backend
`/api/v1/bible/search/` endpoint with `group_by=book`.

**Features**:
- Searches the active text fileset via `searchBibleGrouped()`
- Results arrive grouped by book in canonical order
- Each book is an accordion group (open by default) showing
  up to 3 verse previews, expandable via "Show N more verses"
- No pagination - the backend returns all matches
- Dimmed "Showing first N of M results" notice when the
  backend reports `meta.truncated`
- Backend failures (`error`/`error_code`/`message`, including
  provider errors wrapped in a 200 body) surface as typed
  `RateLimitError`/`ClientInputError`/`ProviderError` and
  render in red rather than showing "No results"
- Per-verse play button feeds a flattened playlist of all
  results into the audio player

**Implementation**:
```typescript
const res = await searchBibleGrouped(
  query,
  filesetId,
  signal,
);
// res.groups: [{ book_id, count, verses: SearchVerse[] }]
// res.meta:   { total: number, truncated: boolean }
```

### 4. Audio Bible Playback

**Location**: `src/components/Audio.tsx` (container —
playlist orchestration, media-session wiring, JSX),
`src/hooks/useChapterAudio.ts` (chapter-mode engine),
`src/components/AudioPlayer.tsx`

Streams audio Bible chapters with full playback controls.

**Features**:
- Play/Pause controls
- Progress bar with seek functionality
- Skip forward/backward (±10 seconds)
- Auto-advance to next chapter
- Loop current chapter infinitely
- Starts at the earliest selected verse's timestamp when verses
  are selected in the chapter (bible scope only; KJV audio and
  missing timestamps start at 0)
- Smart prefetching system:
  - Current chapter audio URL
  - Adjacent chapters (previous/next) verses + audio
- Media Session API integration (hardware controls)
- Loading states and error handling
- Persistent audio player UI

**Hardware controls** (car stereo / headphone buttons, wired in
`Audio.tsx` via `useMediaSession`):
- Play/Pause/Stop: control the current Howl
- Seek Forward/Backward: ±10 seconds (or the OS-provided offset)
- Next Track: seek to the next verse's start from the chapter's
  verse timestamps; past the last verse, advances to the next
  chapter
- Previous Track: restarts the current verse when more than 2s
  into it, otherwise jumps to the previous verse's start; at
  verse 1, goes to the previous chapter
- When no verse timestamps are available (e.g. KJV), Next/
  Previous Track fall back to a ±10 second seek

**Audio Sources**:
- **KJV**: wordpocket.org (direct URL generation)
- **ESV**: Bible Research API (CloudFront URLs) with dynamic `fileset_id` based
  on the testament (Old or New).

**Implementation Details**:
```typescript
// Audio state management
const [audio, setAudio] = useState<Howl | null>(null);
const [isPlaying, setIsPlaying] = useState(false);

// Howler.js audio instance
const audioHowl = new Howl({
  src: [audioUrl],
  html5: true,
  onplay: () => setIsPlaying(true),
  onend: () => goToNextChapter(),
  onloaderror: (_, err) => handleError(err),
});

// Media Session API for hardware controls
const translationName =
  translations.find(
    t => t.filesets.some(f => f.id === activeTextFilesetId)
  )?.name || 'Unknown';
navigator.mediaSession.metadata = new MediaMetadata({
  // activeBookId is a USFM code; toBookName gives the
  // display name
  title:
    `${toBookName(activeBookId) ?? activeBookId} ` +
    `${activeChapter}`,
  artist: translationName,
});
```

**Smart Prefetching System**:
When user navigates to a chapter, the app automatically prefetches:
1. **Current chapter**: Audio URL
2. **Previous chapter**: Verses + Audio URL
3. **Next chapter**: Verses + Audio URL

All prefetching happens silently in the background.

**Benefits**:
- ✅ Instant playback (no loading delay)
- ✅ Seamless chapter navigation
- ✅ Instant auto-advance to next chapter
- ✅ Smooth backward navigation
- ✅ Silent background operation

**Auto-Advance Logic**:
1. When chapter audio ends, check if loop is enabled
2. If looping: Howler.js restarts audio automatically
3. If not looping: Find next chapter in passage list
4. Update active book/chapter in state
5. New audio loads automatically via useEffect
6. Playback continues seamlessly

**Concurrency & mode invariants** (easy to regress — preserve):
- `loadSeqRef` (Audio.tsx) and `playSeqRef`
  (useAudioPlaylist) are generation counters: bumping them
  invalidates any in-flight load, so a superseded coroutine can
  never materialize a Howl that would play over current audio.
- Chapter playback and playlist playback are mutually
  exclusive: entering playlist mode disposes the chapter Howl
  and forces chapter `isPlaying` off.
- Chapter adjacency (next/previous, auto-advance, fallback
  re-arm) is derived from `audioChapterKeyRef` — the chapter
  actually playing — not the store, which can lag a commit
  behind during URL->store sync.
- Off the `/bible` route (search, notes) a chapter advance
  updates `activeBookId`/`activeChapter` in the store directly
  via `setActiveBookAndChapter` instead of navigating, so
  playback continues without yanking the user back.
- `disposeHowl` (`src/utils/howlUtils.ts`) is the shared
  teardown: `stop()` → `off()` → `volume(0)` → `unload()`,
  so pooled `<audio>` nodes never keep playing and listeners
  (bounds poll, `timeupdate`) are released.
- ENGKJV audio has no verse timestamps; playlist items play
  their whole chapter and the user is notified once per
  playlist.

**Hardware Controls**:
- **Play/Pause**: Works on all devices (headphones, car)
- **Seek Forward/Backward**: Skips ±10 seconds (headphones)
- **Next/Previous Track**: Skips ±10 seconds (car stereo)
- **Seek To**: Direct time seeking (car stereo fallback)
- **Lock Screen**: Shows chapter info and controls (mobile)

**ESV Audio `fileset_id`**:

The `getBibleAudioUrl` function now dynamically determines the `fileset_id` for
ESV audio requests based on the book's testament:
- **Old Testament**: `ENGESVO1DA`
- **New Testament**: `ENGESVN1DA`

This logic is handled internally using the `getTestament` utility from
`src/utils/bibleUtils.ts`.

**Note**: Different controls have different skip amounts:
- Headphone seek buttons: ±10 seconds (fine control)
- Car stereo next/prev: ±10 seconds (easier while driving)
- To change chapters: Use auto-advance or navigate in app

### 5. Verse Selection & Highlighting

**Location**: `src/components/Verse.tsx`,
`src/utils/verseRefs.ts`, `src/utils/findVersesInBetween.ts`

Interactive, scoped verse selection with visual feedback.
Selection state lives in the store as a single
`verseSelection: { scope, refs }` — scope `'bible'` for the
chapter view, `note:<id>` inside a `NoteCard` — so bible- and
note-scope selections never collide.

**Features**:
- Click verse to toggle it in the scope's `refs`
- Shift-click selects a contiguous range
  (`findVersesInBetween`)
- Multi-verse selection across chapters (USFM refs)
- Highlighted background for selected verses
- Auto-scroll to newly selected verse (handled in `Verse.tsx`)
- Stable DOM hooks (`title="passage-verse-{chapter}-{n}"`)

**Implementation**:
```typescript
// Verse.tsx — isActive derives from the scoped selection
const isActive = useBibleStore((state) =>
  refsInclude(
    state.verseSelection?.scope === scope
      ? state.verseSelection.refs
      : EMPTY,
    thisRef
  )
);
const toggleVerseRef =
  useBibleStore((state) => state.toggleVerseRef);

const handleVerseClick = () => {
  if (shiftKey) {
    selectVerseRange(scope, findVersesInBetween(...));
  } else {
    toggleVerseRef(scope, thisRef);
  }
};

// Auto-scroll on selection
useEffect(() => {
  if (isActive && !userClickedRef.current) {
    ref.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }
}, [isActive]);
```

### 6. Note Taking & Tagging

**Location**: `src/components/NotesView.tsx`, 
`src/components/AddTagNoteModal.tsx`

Create and organize notes with tags for Bible verses.

**Features**:
- Tag-based organization
- Filter notes by tag
- Lazy loading: notes fetched per-tag (not all at once)
- View notes with verse references
- Navigate to verse from note
- API integration for persistence
- Auto-clear selected verses after note creation
- Linked notes: the creation modal shows a count of existing
  notes on the selected verses and lists them at the bottom
- Optional "Auto save" checkbox in note editors: saves every
  5s (first tick creates the note, later ticks PATCH it) and
  flashes a green checkmark at the top-right corner for 0.5s
  after each successful save. Ticks skip tagless selections
  and contentless drafts — a note needs text or at least one
  linked verse, so a verse-linked note may save with empty
  text. Ticks share a write lock with Submit, and failures
  surface as notifications. The save contract lives in
  `src/hooks/useNoteEditor.ts` — shared by all three note
  modals: it guards tagless/contentless writes, serializes
  saves through a draft queue (a pending autosave can never
  race a submit into a duplicate POST), keeps the draft
  (note id + live text) in module state keyed by user +
  selection so it survives the modal's unmount and a reopen
  resumes the same note, and flushes the unsaved tail on
  close. Edit mode also
  sends the picker's CURRENT `verse_references` with every
  save and refetches the tag page the route is viewing at its
  current page/ordering after submit or a post-unmount save.
- `VerseTextGroups.tsx` renders the shared verse-preview
  grouping (book/chapter divider + numbered verses) used by
  the add/edit modals; grouping itself is `groupVerseTexts`
  in `src/hooks/useVerseTexts.ts`.
- `NoteCard` headings (`src/utils/noteHeading.ts`): verse-less
  notes show the tag name; notes spanning chapters render a
  cross-chapter range (e.g. `John 3:16–5:1`) — never a
  synthetic `… 1:1`
- Edit/delete controls on note cards (`NoteCardActions`)
  require the tag-owner context (`isTagOwner`) or
  `note.is_owner === true`; clipboard share falls back to
  `execCommand` on non-secure contexts
  (`src/utils/clipboard.ts`)

**Workflow**:
1. User selects one or more verses by clicking them
2. User clicks "Add Note" button
3. User selects a tag; note text is optional when the note
   links verses
4. On submit, note is saved to API
5. Selected verses are automatically cleared
6. Modal closes

**Note Loading Optimization**:
- On initial load, only notes for the first tag (alphabetically) are fetched
- When user selects a different tag, notes for that tag are fetched
- This prevents loading all notes at once, improving performance
- Refresh button re-fetches notes for the currently selected tag

**API Functions**:
```typescript
// Fetch notes (optionally filtered by tag)
getNotes(tagId?: string): Promise<Note[]>

// Create new note with tag
addTagNote(
  tagId: string,
  noteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[]
)

// Fetch the user's notes linked to any of the given verses
// (POST /api/v1/notes/linked/)
getLinkedNotes(
  verseReferences: { book: string; chapter: number; verse: number }[],
  filesetId?: string
): Promise<LinkedNotesResponse>

// Compact index of every note in a tag, canonical ascending
// order (GET /api/v1/notes/order-index/?tag_id=…)
getNoteOrderIndex(tagId: string): Promise<NoteOrderIndexEntry[]>

// Move a single note before/after another in canonical order
// (POST /api/v1/notes/move/ — returns 200, not 204)
moveNote(
  tagId: string,
  noteId: string,
  targetNoteId: string,
  placement: 'before' | 'after'
): Promise<MoveNoteResponse> // {note_id, tag_position, rebalanced}
```

**Note order badges & moves** (`NoteOrderMenu.tsx`):
- In `custom_asc`/`custom_desc` + authenticated + owned notes
  (every loaded note reports `is_owner`; the gate lives in
  `useNoteOrderMenu`), each `NoteCard` renders a `#k` badge
  where `k` is the note's 1-based rank in the canonical
  ascending order (same IDs in both sort directions —
  `custom_desc` only reverses display).
- Clicking the badge opens a dropdown listing **all** notes
  in the tag (`#k — Book C:V[-V]`, or `#k — no passage`), with
  a filter input and a "Move to top" item — built for tags
  with up to ~2000 notes.
- Picking an entry moves the note just after it in *display*
  order; the route translates to canonical placement
  (`custom_asc` → `after`, `custom_desc` → `before`).
- The order index is fetched per tag via `getNoteOrderIndex`,
  kept in `useNoteOrderMenu` state (never persisted), and
  refetched after every move; `moveNoteAfter` in the store
  patches
  `tag_position` locally for instant feedback, then always
  refetches the current page (cross-page moves change page
  membership).
- Pre-existing quirk: notes with `null` `tag_position` sort
  first client-side (`sortedNotes` `?? 0`) but last in the
  backend order index (highest order IDs).
- The badge/menu is threaded as a single `orderMenu` prop
  (`NoteOrderMenuData`) through `TagSection` →
  `SortableNoteCard`/`NoteCard`; it is opt-in, so
  `NoteDetailRoute` and non-custom sorts are unaffected, and
  the dnd-kit `DragOverlay` card deliberately gets no badge.

**Implementation Details**:
```typescript
// In useNoteEditor.ts - create-mode submit builds USFM
// verse_references from the store's scoped selection
const refs = verseSelection?.refs ?? [];
const verseReferences = refs.map((r) => ({
  book: toBookName(r.bookId),  // backend wants display names
  chapter: r.chapter,
  verse: r.verse,
}));

await addTagNote(selectedTagId, tagNoteText, verseReferences);
setVerseSelection(null); // Clear selected verses
onClose();

// In useTagNotesData.ts (TagNotesRoute) - paginated per-tag
// loading; switching tag or page refetches that slice
const load = async () => {
  await fetchNotes(tagId, {
    ordering,
    page: notesPage,
    pageSize: notesPageSize,
    filesetId,
  });
};
```

### 7. Theme System

**Location**: `src/App.tsx`

Light/Dark mode with persistent preference.

**Implementation**:
```typescript
// Mantine ColorSchemeProvider + localStorage
const [colorScheme, setColorScheme] = 
  useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });

const toggleColorScheme = () =>
  setColorScheme(current => 
    current === "dark" ? "light" : "dark"
  );
```

### 8. Analytics

**Location**: `src/App.tsx`

Vercel Analytics integration for tracking page views and user 
interactions.

**Features**:
- Automatic page view tracking
- Privacy-friendly (no cookies)
- Real-time visitor analytics
- Performance metrics

**Implementation**:
```typescript
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <MantineProvider>
      {/* App content */}
      <Analytics />
    </MantineProvider>
  );
}
```

**Note**: Analytics data is only collected in production 
deployments on Vercel. No data is tracked during local 
development. `<Analytics />` and `<SpeedInsights />` are not
rendered inside the Capacitor Android shell — their `/_vercel/*`
scripts only exist on the Vercel deployment and would 404 on the
WebView's `https://localhost` origin (see `isNativeApp()` in
`src/utils/platform.ts`).

### 9. Global Error Reporting

**Location**: `src/utils/errorReporter.tsx`,
`src/utils/errorReportDetails.ts`,
`src/components/ErrorNotificationContent.tsx`,
`src/components/ErrorBoundary.tsx`

Uncaught errors surface a persistent Mantine notification with a
"Copy error details" button that produces a markdown report for
pasting into a GitHub issue.

**Coverage**:
- **Uncaught exceptions**: `window` `error` listener installed in
  the capture phase, so resource load failures (img, script,
  link) are reported in addition to script errors. Audio/video
  element failures are excluded — the app's own fallback chains
  retry them, so reporting them would surface expected noise.
  Resource failures for `/_vercel/*` URLs (Vercel telemetry) are
  also ignored — ad blockers and non-Vercel hosts make them fail
  routinely. So are `blob:` URLs: staged comment-image previews
  are transient object URLs whose load failures are handled
  locally (placeholder thumbnail), never fatal.
- **Unhandled promise rejections**: `unhandledrejection`
  listener; `AbortError` rejections are ignored (routine
  fetch cancellations on navigation races).
- **React render errors**: `ErrorBoundary` wraps the routed
  content in `App.tsx` and reports through the same path; its
  fallback UI also offers "Copy error details".

**Implementation**:
```typescript
// main.tsx - installed once before the app renders;
// idempotent (safe under Vite HMR re-execution)
initGlobalErrorHandlers();
```

`reportError()` normalizes any thrown value to an `Error` and
shows a red, non-dismissible notification (`autoClose: false`).
A shared notification id (`unhandled-error`) makes repeated
errors replace the existing notification instead of stacking.
The notification body (`ErrorNotificationContent`) renders the
message plus the "Copy error details" button.

`copyErrorDetails()` builds the markdown report - error name,
message, optional context label, page URL, timestamp, user
agent, and stack trace - and writes it to the clipboard.
Reporting never throws: failures inside the handler are logged,
not re-raised.

---

## Data Flow

### Reading Flow
```
User Action (Click Book/Chapter/Verse)
    ↓
Update Zustand Store
    ↓
Components Re-render (via subscription)
    ↓
API Call (getVersesInChapter)
    ↓
Check Cache (cacheManager)
    ↓
Return Cached Data OR Fetch from API/JSON
    ↓
Update Cache (if fetched)
    ↓
Display Verses
```

### Audio Flow
```
User Clicks Play
    ↓
Set isPlaying = true
    ↓
useEffect Triggers
    ↓
Check if audio exists
    ↓
If not, fetch audio URL (with cache check)
    ↓
Create Howl instance
    ↓
Play audio
    ↓
On end → Auto-advance to next chapter
```

### Search Flow
```
User submits query on /search
    ↓
searchBibleGrouped(query, filesetId) hits
/api/v1/bible/search/?group_by=book
    ↓
Render accordion: one group per book (canonical order),
3-verse preview each, "Show N more verses" expands
    ↓
All results flattened into audioPlaylistItems
    ↓
User clicks verse → navigate to /bible/{USFM ref}
or clicks play → playlist starts at that verse
```

### Note Creation Flow
```
User Selects Verses (click on verses)
    ↓
Refs added to the scoped verseSelection ('bible' scope)
    ↓
User Clicks "Add Note" (VerseActionToolbar)
    ↓
AddTagNoteModal opens
    ↓
User enters note text (TipTap editor)
    ↓
User selects tag
    ↓
User submits form
    ↓
API Call: addTagNote(tagId, text, verseReferences)
    ↓
Note created in backend
    ↓
Clear verseSelection (auto-clear)
    ↓
Close modal
    ↓
Refresh notes list (optional)
```

### Translation Switching Flow
```
User Opens TranslationSelector
    ↓
Fetch available translations (cached)
    ↓
User selects language (eng/lvs/rus, or Other → search DBT
languages → pick an iso)
    ↓
Fetch translations for language
    ↓
User selects translation (e.g., ESV)
    ↓
Text fileset auto-resolves per testament (no picker)
    ↓
User selects audio product (Read aloud / Dramatized /
Generated voice) or None — Advanced section offers raw
fileset ids for debugging
    ↓
User clicks Save
    ↓
Update Zustand store:
  - setActiveTextFilesetId
  - setActiveAudioFilesetId
    ↓
Components re-render
    ↓
PassageView fetches verses with new filesetId
    ↓
Audio component resets (unload old audio)
    ↓
New translation displayed
```

### Prefetching Flow
```
User Navigates to Chapter
    ↓
PassageView renders
    ↓
Trigger: prefetchAdjacentChapters(book, chapter, filesetId)
    ↓
Get adjacent chapters (previous/next)
    ↓
Background Tasks (parallel):
  ├─ Prefetch previous chapter verses
  ├─ Prefetch next chapter verses
  ├─ Prefetch previous chapter audio
  └─ Prefetch next chapter audio
    ↓
Cache results in localStorage
    ↓
User navigates to next/previous chapter
    ↓
Instant load (from cache)
```

---

## Component Structure

**Total Components**: ~46 source files in `src/components/` —
each with its unit test co-located (`Foo.test.tsx` beside
`Foo.tsx`). This section documents the significant ones; it is
illustrative, not exhaustive.

### Main Application Components

#### `App.tsx`
Main application shell with theme provider and layout.

**Responsibilities**:
- Theme management (light/dark mode) with localStorage persistence
- Keyboard shortcuts (`/` for search, `Escape` to close modals)
- Layout structure using Mantine AppShell (navbar + header + main)
- Cache cleanup on mount (expired audio URLs)
- Vercel Analytics and Speed Insights integration

**Key Features**:
- ColorSchemeProvider for theme switching
- Global keyboard event listeners
- AppShell layout with responsive navbar

---

### Navigation Components

#### `BibleSelector.tsx`
Drawer panel for Books → Chapters → Verses navigation.

**Responsibilities**:
- List all 66 Bible books (test-hook title `nav-book-{USFM}`)
- List chapters (`nav-chapter-{n}`) and verses for the current
  book
- Navigate via `useNavigate()` to canonical USFM refs
- Highlight active selections

#### `BottomNav.tsx`
Footer bar for prev/next chapter navigation plus the current
book/chapter title (kept in sync with the route — regression
test `bottomnav-title-sync-95.test.tsx`).

#### `MainMenu.tsx`
App drawer menu (opened from the header burger): navigation,
auth rows, "Check for updates" (native shell only), sharing.
"View Notes", "New Note", and "Tag Management" only render for
authenticated users — `/notes` redirects anonymous visitors to
`/bible`, so the menu must not offer a dead-end link.

#### `MyHeader.tsx`
Top header bar with controls.

**Responsibilities**:
- Display burger menu for `MainMenu`
- Search button (`navigate('/search')`)
- Audio controls (`Audio`)
- Auto-hide on scroll: a capture-phase `window` scroll listener
  watches inner scroll containers (scroll events do not bubble).
  The header slides up after ~150px of accumulated downward scroll
  and slides back after ~150px of accumulated upward scroll; it is
  shown again on every route change and whenever the scroller
  reaches the bottom of its content (within 24px), so the chapter
  navigation is always reachable at the end of a chapter
  (`headerVisible` in the store).
- The same `headerVisible` store flag also gates `BottomNav`
  (slides below the viewport on hide) and the AppShell's
  reserved footer padding, so both bars move together.

---

### Content Display Components

#### `Passage.tsx`
Main content container that switches between Bible view and Notes view.

**Responsibilities**:
- Toggle between `PassageView` and `NotesView` via the store's
  `showNotes` flag
- "View in Bible" from notes clears `showNotes` and navigates

**Layout**: Centered flex container with 80vh height

#### `PassageView.tsx`
Displays Bible verses for the current chapter.

**Responsibilities**:
- Fetch verses using `getVersesInChapter()`
- Handle loading and error states
- Render Verse components in a list
- Display translation name

#### `Verse.tsx`
Individual verse component with click-to-select.

**Responsibilities**:
- Display verse number (bold) and text
- Handle click to toggle selection
- Visual highlighting for active verses
- Auto-scroll to view when selected
- Prevent text selection on long-press (mobile)
- Prevent context menu

**Styling**:
- Hover effect with background color change
- Active state with persistent background
- User-select disabled for better mobile UX

#### `VerseActionToolbar.tsx`
Floating toolbar shown when `verseSelection` is non-empty —
the entry point for "Add Note" and other per-selection actions
(rendered by `App.tsx`).

---

### Audio Components

#### `Audio.tsx`
Audio playback logic and play button.

**Responsibilities**:
- Fetch audio URLs (KJV from Wordpocket, others from Bible Research API)
- Create and manage Howler.js audio instance
- Handle play/pause state
- Auto-advance to next chapter on audio end
- Loop functionality
- Media Session API integration for hardware controls
- Error handling with user-friendly messages
- Loading states

**Hardware Controls Support**:
- Play/Pause (all devices)
- Seek Forward/Backward ±10s (headphones)
- Next/Previous Track ±10s (car stereo)
- Lock screen controls (mobile)

#### `AudioPlayer.tsx`
Floating audio player UI at bottom of screen.

**Responsibilities**:
- Display playback controls (play/pause, skip ±5s, loop)
- Show progress slider with seek functionality
- Display current time / total duration
- Show current book and chapter
- Close button to hide player
- Fixed position at bottom of viewport

**UI Elements**:
- Skip backward 5s button
- Play/Pause button (large, blue)
- Skip forward 5s button
- Loop toggle button
- Progress slider
- Time display

---

### Search Components

#### `SearchRoute.tsx` (`src/routes/`)
Search results page at `/search?q=<query>`.

**Responsibilities**:
- Call `searchBibleGrouped()` on query/fileset change
- Render book-grouped accordion results (3-verse preview,
  expandable per book, all groups open by default)
- Show truncated notice when backend caps results
- Feed flattened results into `audioPlaylistItems`
- Navigate to `/bible/{ref}` on verse click

#### `MyHeader.tsx` search icon
Search button in the header.

**Responsibilities**:
- Navigate to `/search`
- Display search icon

---

### Notes Components

#### `NotesView.tsx`
Notes display with tag filtering.

**Responsibilities**:
- Fetch notes from API using `getNotes()`
- Group notes by tag
- Display tag selector
- Filter notes by selected tag
- Render NoteCard components
- Handle "View in Bible" callback
- Loading and error states

#### `NoteCard.tsx`
Individual note display card.

**Responsibilities**:
- Display note text
- Show associated verses with references
- Display tag name
- Show created/updated timestamps
- Edit and delete buttons
- "View in Bible" button

Note verses are capped at 500 displayed verses
(`visibleNoteVerses` in `src/utils/noteVerses.ts`) because
Bible providers limit passage text to 500 verses for
copyright compliance. Verses beyond the limit arrive with
empty text, so a red notice ("Cannot display more than 500
verses of the Bible due to copyright restrictions.") is
rendered in place of the truncated tail.

#### `NoteForm.tsx`
Form for creating/editing notes.

**Responsibilities**:
- Rich text editor (TipTap)
- Tag selection (Select keyed by tag id, not name)
- Verse reference display
- Form validation
- Submit handler — serialized against in-flight autosaves so
  a submit can never race a tick into a duplicate POST; a
  resolved `false` marks the submit rejected and leaves the
  text eligible for the unmount flush
- Optional autosave interval (`onAutoSave`): fires every 5s,
  skips unchanged/tagless/contentless drafts (empty text is
  fine when `allowEmptyText` is set — i.e. the note links
  verses), and on unmount flushes the last unsaved contents
  (`onUnmountedSave` runs after a tail save resolves)
- `onDraftChange` reports live contents so the editor hook's
  draft store can restore an in-progress note after reopen

Typing `@` in the editor opens a passage picker that inserts a
`@USFM.C.V[-E]` reference token. Clicking a complete token once
opens the passage in a floating popover anchored under the ref —
a portal-mounted `ScripturePassagePopover` containing
`ScripturePassage` (the note is NOT linked to it); a second
click reopens the picker to edit the reference. The same popover
serves note cards and comments (`RichTextView`/`linkifyScripture`
anchors), driven by `useScriptureRefPreview` (parse + same-ref
toggle); only one preview is open app-wide — opening one
broadcasts an event that closes the others. The panel tracks
its anchor on scroll/resize and on its own size changes (the
passage loads async), dismisses on an outside tap or `Escape`
(capture-phase, so the enclosing modal stays open), and closes
when the anchor leaves the layout — a deleted token's rect
collapses to zero on the next reposition. A "View in Bible"
header action navigates to the passage in the Bible reader
(`buildBiblePath`), closing the panel.

Pasted clipboard text is normalized before ProseMirror parses it
(`src/utils/clipboardSanitize.ts`, wired as `transformPastedText`
+ `transformPasted` in `RichTextEditor`): non-ASCII space
variants (NBSP, en/em/ideographic spaces) fold to ' ',
line/paragraph separators become real newlines, and zero-width,
directional and control characters are stripped — mobile
keyboards and rich-text sources otherwise inject invisible
characters that defeat the '#', '-', '>' markdown input rules
and '@…' mention matching. ZWJ/ZWNJ are kept where they carry
meaning (emoji sequences, cursive scripts); text pasted into
code blocks or inline code stays verbatim. `transformPasted`
also closes slice edges around structural nodes — ProseMirror
otherwise merges a pasted first heading/list into the cursor's
paragraph and loses its type — and repairs list artifacts on
the HTML path (rich-text copies skip `clipboardTextParser`
entirely): same-kind sibling lists split by rendered blank
lines rejoin, empty '<li>'/'<p>' spacer nodes inside lists are
dropped, and a slice made only of unformatted paragraphs whose
lines carry block markdown markers is reparsed through the
same block parser — that covers raw markdown pasted as HTML
text. '•', '◦' and '▪' bullet glyphs count as list markers for
plain text copied from Word/Outlook.

Block-level markdown in pasted plain text is converted by
`clipboardTextParser` (`src/utils/markdownPaste.ts`): headings,
rules, fenced code, blockquotes and (nested) bullet/ordered
lists. The gate only fires when a line carries a markdown block
token — ordinary prose keeps the default line-per-paragraph
paste, and shift-paste ('paste as plain text') skips conversion.
Blank lines between items keep the list together (loose lists);
a marker-type switch at the same indent ('1.' then '-') closes
the current list and starts a sibling. Inline markdown marks
(**bold**, *italic*, `code`, ~~strike~~, links) are handled by
TipTap's own extension paste rules.

#### `AddTagNoteModal.tsx`
Modal for creating new notes from selected verses.

**Responsibilities**:
- Display NoteForm in modal
- All save/submit/draft logic delegated to `useNoteEditor`
  (create mode, draft keyed by the verse selection) — see
  "Note Taking & Tagging" above for the shared contract
- Auto-clear selected verses after successful creation
- Close modal on success or cancel

**Workflow**:
1. User selects verses
2. Clicks "Add Note" button
3. Modal opens with NoteForm
4. User selects a tag; note text is optional — the linked
   verses alone can be the note's content
5. Submits form
6. Note created via API
7. Selected verses cleared automatically
8. Modal closes

#### `EditNoteModal.tsx`
Modal for editing existing notes.

**Responsibilities**:
- Display NoteForm pre-filled with note data
- All save/submit/refetch logic delegated to `useNoteEditor`
  (edit mode) — every autosave/submit PATCH includes the
  picker's CURRENT `verse_references`, and closing after any
  save refetches the note's own tag at the route's current
  page/ordering (untagged notes refetch the `untagged`
  sentinel view)
- Edit the note's verse links via an embedded PassagePicker
  (click toggles a verse, shift-click extends a range)
- Preview the selected verses' text via `useVerseTexts` +
  `VerseTextGroups`
- Close modal on success or cancel
- Show at most 500 verse previews (same
  `visibleNoteVerses` copyright cap as NoteCard)

#### `TagSection.tsx`
Tag management UI.

**Responsibilities**:
- Display available tags
- Tag selection for filtering
- Create new tags
- Hierarchical tag display (parent/child)

---

### Translation Components

#### `TranslationSelector.tsx`
Modal for selecting Bible translations.

**Responsibilities**:
- Fetch available translations from API
- Language selector (English, Latvian, Russian, Other — the
  Other tab is a debounced DBT language search; the tab bar is
  horizontally scrollable on narrow screens via ScrollArea)
- Version dropdown (searchable, capability chips: "Audio",
  "Text only", "Audio only")
- Text auto-resolution per testament (dimmed info line; no
  picker) with same-language fallback for audio-only versions
- Audio product selection (radio buttons, including "None")
- Collapsed Advanced section with raw fileset radios
  (debugging; opus16 variants hidden)
- Save selections to Zustand store (product ids)

**Features**:
- Segmented control for language switching
- Groups filesets via `groupFilesets` — codec pairs and
  testament splits collapse into one product each
- Shows audio kind ("Read aloud" / "Dramatized" /
  "Generated voice") and coverage label
- Cancel and Save buttons

---

### Other Notable Components

- `ProtectedRoute.tsx` - wraps `/tags`; redirects anonymous
  visitors to `/login`
- `LoginPage.tsx` / `RegisterPage.tsx` - auth forms
- `UserMenu.tsx` - account dropdown (logout, profile)
- `PassagePicker.tsx` - book/chapter/verse picker embedded in
  note modals (click toggles, shift-click ranges)
- `ScripturePassage.tsx` - renders `@USFM.C.V` mention previews
- `RichTextEditor.tsx` / `RichTextView.tsx` - TipTap editor and
  read-only rendering (lazy chunk)
- `CommentThread.tsx` + `CommentNode.tsx` + `CommentForm.tsx` +
  `CommentActions.tsx` + `CommentImageGrid.tsx` +
  `Lightbox.tsx` - threaded comments with image upload
- `NoteForm.tsx` + `useNoteEditor` +
  `hooks/useStagedImages.ts` - note editing with staged image
  attachments (uploaded after the note's first save);
  `NoteCard` renders them via `CommentImageGrid` + `Lightbox`
- `NoteVerseList.tsx` / `NoteCardActions.tsx` /
  `SortableNoteCard.tsx` / `TagNotesToolbar.tsx` /
  `TagTree.tsx` / `Pagination.tsx` - note-list pieces
- `ErrorBoundary.tsx` + `ErrorNotificationContent.tsx` - render
  errors + "Copy error details" (see Global Error Reporting)
- `CopyrightNotice.tsx` / `SectionHeading.tsx` /
  `VerseTextGroups.tsx` / `AddStandaloneNoteModal.tsx` -
  supporting pieces

Loading indicators use Mantine `Loader` directly — there is no
shared spinner wrapper.

---

## API Integration

### Local Data

#### KJV Bible JSON
**Location**: `src/assets/kjv.json`

Contains the complete King James Version Bible text stored locally
for offline access. It is **lazy-loaded** via
`src/utils/kjvDataLoader.ts` (`import('../assets/kjv.json')`), so
Vite emits it as a separate `kjv-*.js` chunk that is only fetched
when verse text is requested. Book/chapter/verse-count metadata
needed for navigation lives in `src/assets/bibleStructure.json`
(bundled in the entry chunk), so helpers like `getBooks`,
`getChapters`, `getVerses`, `getChapterList`,
`getAdjacentChapters`, and `getKjvAudioUrl` stay synchronous.

**Structure**:
```typescript
[
  {
    "chapter": 1,
    "verse": 1,
    "text": "In the beginning...",
    "translation_id": "kjv",
    "book_id": "Gen",
    "book_name": "Genesis"
  },
  // ... 31,102 verses total
]
```

### External APIs

#### Bible Research API
**Base URL**: `${API_BASE_URL}/api/v1` — `API_BASE_URL` comes
from `src/config.ts` (`VITE_API_BASE_URL`, defaulting to the
production App Engine host)

**Endpoints**:

1. **Get Bible Verses**
   ```
   GET /bible?passage={book} {chapter}&fileset_id={fileset_id}
   Response: { verses: [{ verse: number, text: string }] }
   ```

2. **Get Audio**
   ```
   GET /bible/audio?passage={book} {chapter}&fileset_id={fileset_id}
   Response: { 
     audio_url: string, 
     duration_seconds: number,
     file_size_bytes: number,
     format: string
   }
   ```

3. **Get Available Translations**
   ```
   GET /bibles?language_iso={language_iso}
   Response: Translation[]
   ```

4. **Get Notes**
   ```
   GET /notes/
   GET /notes/?tag_id={tag_id}&ordering={o}&page={p}
   Response: PaginatedNotesResponse
     { count, next, previous, results: Note[] }
   ```

5. **Create Note**
   ```
   POST /notes/
   Body: { 
     tag: string, 
     note_text: string, 
     verse_references: [
       { book: string, chapter: number, verse: number }
     ]
   }
   Response: Note
   ```

6. **Edit Note**
   ```
   PATCH /notes/{noteId}/
   Body: { 
     tag: string, 
     note_text: string,
     verse_references: [         // optional; replaces links
       { book: string, chapter: number, verse: number }
     ]
   }
   Response: Note
   ```

7. **Get Tags**
   ```
   GET /tags/
   Response: Tag[]
   ```

8. **Comments**
   ```
   GET    /notes/{noteId}/comments/
   POST   /notes/{noteId}/comments/
   PATCH  /notes/{noteId}/comments/{commentId}/
   DELETE /notes/{noteId}/comments/{commentId}/
   GET    /comments/counts/
   Response: Comment[]  // threaded via `replies`, `images` embedded
   ```

9. **Comment Images**
   ```
   POST   /notes/{noteId}/comments/{commentId}/images/
   // multipart form field "file"; ≤5 images, ≤10 MiB each
   GET    /notes/{noteId}/comments/{commentId}/images/
   DELETE /images/{imageId}/
   Response: CommentImage { id, storage_url, signed_url|null,
     content_type, size_bytes, uploaded_by, created_at }
   // signed_url is short-lived; img onError triggers a targeted
   // refetch (bounded per image set — a refresh that mints new
   // URLs resets the budget), see CommentThread.
   // Staged (pre-upload) thumbnails use blob: object URLs whose
   // revocation is deferred past unmount; a failed preview
   // renders a photo-icon placeholder.
   ```

10. **Get Reading Positions**
    ```
    GET /reading-positions/
    GET /reading-positions/?book={book name}  // filtered list
    Response: ReadingPosition[]
    ```
    Authenticated only. `book` is a display name (e.g. "John"),
    not a USFM code — the backend validates it via
    `get_dbt_book_id`.

11. **Upsert Reading Position**
    ```
    POST /reading-positions/
    Body: { book: string, chapter: number, verse: number }
    Response: ReadingPosition
    ```

12. **Bulk Reading Positions**
    ```
    POST /reading-positions/bulk/
    Body: { books: string[] }  // book names
    Response: { [book name]: { chapter, verse } | null }
    ```

13. **Note Images**
    ```
    POST   /notes/{noteId}/images/
    // multipart form field "file"; ≤10 images, ≤10 MiB each
    GET    /notes/{noteId}/images/
    DELETE /images/{imageId}/          // shared with comments
    Response: NoteImage — identical shape to CommentImage
      (one backend ImageSerializer serves both)
    // The note must exist before upload — there is no
    // pre-upload endpoint — so create-mode modals stage
    // File[] locally (src/hooks/useStagedImages.ts), carry
    // them in the useNoteEditor draft (pendingFiles +
    // uploadedFiles, a signature-keyed Map<File→NoteImage>
    // so a re-selected file dedups by content, not File
    // identity), and upload sequentially after the first
    // save produces savedNoteId. Removing a thumb whose
    // file already uploaded calls DELETE /images/{id};
    // draft.stagedFiles re-stages uploaded files on reopen
    // so attached images stay visible and removable.
    // EditNoteModal uploads immediately on select (with a
    // per-session signature→imageId map against
    // re-selects — the signature is claimed before the
    // upload resolves and freed when the image is
    // deleted, so deleting a thumb un-blocks a
    // re-select of the same file) and
    // refetches the image list single-flight +
    // budgeted (3) when a signed_url fails to load.
    // Images are NOT embedded in note payloads. Each mounted
    // NoteCard lazy-fetches GET /notes/{noteId}/images/ once
    // it nears the viewport (useIntersection, 200 px
    // rootMargin, latched; no IntersectionObserver -> fetch
    // on mount). Fetched lists live in the session-scoped
    // useNoteImages store (module Map keyed by note id,
    // single-flight dedup, mutateNoteImages write path for
    // upload append / delete filter, signature-keyed
    // MAX_IMAGE_REFRESHES=3 budget for signed-URL expiry)
    // — shared by the grid card, the DragOverlay's second
    // card, and EditNoteModal, so one fetch serves all.
    // A failed fetch leaves the entry 'error'; the next
    // mount retries it once with a re-armed budget.
    ```

#### Wordpocket Audio API
**Base URL**: `https://wordpocket.org/bibles/app/audio/1`

**Pattern**: `/{bookIndex}/{chapter}.mp3`

**Example**: 
`https://wordpocket.org/bibles/app/audio/1/1/1.mp3` 
(Genesis Chapter 1)

#### Vercel Services

**Vercel Analytics**
- Tracks page views and user interactions
- Automatically enabled in production deployments
- Component: `<Analytics />` in `App.tsx`
- Package: `@vercel/analytics`

**Vercel Speed Insights**
- Monitors Core Web Vitals and performance metrics
- Tracks: LCP, FID, CLS, TTFB, FCP
- Component: `<SpeedInsights />` in `App.tsx`
- Package: `@vercel/speed-insights`
- Data visible in Vercel dashboard after deployment
- Both components are skipped in the Capacitor Android shell
  (`isNativeApp()`), where their `/_vercel/*` scripts 404.

---

### API Functions (`src/api/`)

All backend calls live in `src/api/`, split by domain
(`errors`, `structure`, `verses`, `audio`, `translations`,
`notes`, `tags`, `comments`, `search`, `readingPositions`) and
re-exported through the `index.ts` barrel — always import via
`import { x } from '../api'`, never a leaf module, so
`vi.mock('../api')` keeps intercepting in tests.

**Fetch helpers** (`src/utils/apiClient.ts`):
- `publicFetch(url, options?, retries?)` — attaches the token
  when present; a 401 retries once anonymously and never logs
  the user out (a stale token must not break public content).
- `authenticatedFetch(url, options?, retries?)` — a valid 401
  logs out and shows a "session expired" notification. For
  user-owned resources (notes, tags, comments, reading
  positions).
- `authenticatedUpload(url, formData)` — multipart variant for
  image uploads (comment and note attachments).
- `fetchJson<T>(fetcher, url, fallbackMessage, options?)` —
  shared fetch→JSON boilerplate for endpoints whose error
  handling is just "throw on `!ok`, log, rethrow". Endpoints
  with richer contracts (typed provider errors via
  `api/errors.ts`, 409 bodies, 204 no-content, swallowed
  failures) keep their own `try/catch`.
- `sendRequest` — the shared core both fetchers delegate to;
  network-failure retry fires only for idempotent methods
  (GET/HEAD/OPTIONS).

**Error policy**: `showNotification` (from
`@mantine/notifications`) is for expected, contextual failures
handled at the call site. `reportError`
(`src/utils/errorReporter.tsx`) is for unexpected/unhandled
errors and is only called by the global handlers and
`ErrorBoundary` — routine catch blocks should never call it.

**Typed errors** (`src/api/errors.ts`):
`throwFromErrorBody` maps a failed response's
`{error, error_code, detail}` body onto, in order:
`BookNotInFilesetError` (`book_not_in_fileset`),
`RateLimitError` (`rate_limited` or a rate-limit-shaped
message), `ClientInputError` (`missing_parameter`,
`invalid_parameter`, or any other coded HTTP 400 body — the
request itself was bad), `ProviderError` (any other coded
failure), or a plain `Error`. `ClientInputError` extends
`Error`, not `ProviderError`, so `instanceof ProviderError`
branches keep rendering provider failures only.

#### Bible Data Functions

**`getBooks()`**

Returns list of all Bible books from `bibleStructure.json`
(synchronous; does not load verse text).

```typescript
getBooks(): { book_name: string; book_id: string }[]
```

**`getChapters(thebook: string)`**

Returns chapter numbers for a given book.

```typescript
getChapters(thebook: string): number[]
```

**`getVerses(thebook: string, thechapter: number)`**

Returns verse numbers for a given chapter.

```typescript
getVerses(thebook: string, thechapter: number): number[]
```

**`getVersesInChapter(bookId, thechapter, filesetId)`**

Fetches verse text for a chapter. Routes to lazy-loaded KJV data
or API based on filesetId.

```typescript
getVersesInChapter(
  bookId: string,
  thechapter: number,
  filesetId: string
): Promise<{ verses: { verse: number; text: string }[];
            headings: SectionHeading[] }>
```

- If `filesetId === 'ENGKJV'`: Lazy-loads the `kjv.json` chunk
  (via `kjvDataLoader.loadKjvData()`) and filters locally
- Otherwise: Fetches from Bible Research API with caching

**`getVersesInKjvChapter(bookId, thechapter)`**

Returns KJV verses from the lazily imported `kjv.json` chunk.
KJV has no section headings, so `headings` is always `[]`.

```typescript
getVersesInKjvChapter(
  bookId: string,
  thechapter: number
): Promise<{ verses: { verse: number; text: string }[];
            headings: SectionHeading[] }>
```

**`getVersesFromApi(thebook, thechapter, filesetId)`**

Fetches verses from Bible Research API with cache-first strategy.

```typescript
getVersesFromApi(
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]>
```

**`getChapterList()`**

Returns all book/chapter combinations for navigation.

```typescript
getChapterList(): {
  book_name: string;
  book_id: string;
  chapter: number;
}[]
```

#### Translation Functions

**`getAvailableTranslations(languageIso)`**

Fetches available Bible translations from API with caching.

```typescript
getAvailableTranslations(
  languageIso = "eng"
): Promise<Translation[]>
```

- Checks cache first
- Falls back to API if not cached
- Caches result for future use — a failed (`!response.ok`)
  response is never written to the cache
- Throws on fetch failure; `TranslationSelector` catches at
  the UI layer (warns, and notifies on refresh failure)

#### Audio Functions

**`getBibleAudioUrl(book, chapter, filesetId)`**

Fetches audio URL from Bible Research API with caching.

```typescript
getBibleAudioUrl(
  book: string,
  chapter: number,
  filesetId: string
): Promise<string>
```

- Cache-first strategy
- Parses CloudFront URL expiration
- Caches with expiration timestamp

**`getKjvAudioUrl(book, chapter)`**

Generates KJV audio URL from Wordpocket (no API call needed).

```typescript
getKjvAudioUrl(book: string, chapter: number): string
```

**`getAdjacentChapters(book, chapter)`**

Returns previous and next chapter info for navigation.

```typescript
getAdjacentChapters(
  book: string,
  chapter: number
): {
  previous: { book: string; chapter: number } | null;
  next: { book: string; chapter: number } | null;
}
```

**`prefetchAudioUrl(book, chapter, filesetId)`**

Background prefetch of audio URL (silent, non-blocking).

```typescript
prefetchAudioUrl(
  book: string,
  chapter: number,
  filesetId: string | null
): Promise<void>
```

- Checks cache first
- KJV URLs are instant (no API call)
- Other versions fetch from API
- Silent failure (logs warning, doesn't throw)

**`prefetchAdjacentChapters(book, chapter, filesetId)`**

Prefetches verses and audio for previous/next chapters.

```typescript
prefetchAdjacentChapters(
  book: string,
  chapter: number,
  filesetId: string
): Promise<void>
```

- Improves navigation performance
- Runs in background
- Silent failure

#### Notes Functions

**`addTagNote(tagId, tagNoteText, verseReferences)`**

Creates a new note with tag and verse references.

```typescript
addTagNote(
  tagId: string,
  tagNoteText: string,
  verseReferences: {
    book: string;
    chapter: number;
    verse: number;
  }[]
): Promise<Note>
```

**`editNote(noteId, tagId, noteText, verseReferences?)`**

Updates an existing note. When `verseReferences` is provided it is
sent as `verse_references` and replaces the note's verse links.

```typescript
editNote(
  noteId: string,
  tagId: string,
  noteText: string,
  verseReferences?: {
    book: string;
    chapter: number;
    verse: number;
  }[]
): Promise<Note>
```

**`getNotes(tagId?, options?)`**

Fetches a paginated page of notes from the API (optionally
filtered by tag; `ordering`, `page`, `pageSize`, and
`filesetId` map to query params). `filesetId` is resolved
before the call so verse text uses the active translation.

```typescript
getNotes(
  tagId?: string,
  options?: {
    ordering?: string;
    page?: number;
    pageSize?: number;
    filesetId?: string;
  }
): Promise<PaginatedNotesResponse>
```

**`getTags()`**

Fetches all available tags from API.

```typescript
getTags(): Promise<Tag[]>
```

#### Reading Position Functions

Reading positions track the user's last location per book and
restore it on book switch. All functions take USFM book codes
and map to backend book names internally; all calls are gated
on `useAuthStore.getState().isAuthenticated` — the endpoints
require auth, so anonymous calls would 401.

**`getReadingPosition(bookId)`**

Fetches the saved position for one book (`?book=` is a filtered
list endpoint, not a single object).

```typescript
getReadingPosition(bookId: string): Promise<ReadingPosition | null>
```

**`updateReadingPosition(bookId, chapter, verse)`**

Upserts the position for a book.

```typescript
updateReadingPosition(
  bookId: string,
  chapter: number,
  verse?: number
): Promise<void>
```

**`getBulkReadingPositions(bookIds)`**

Bulk-fetches positions; returns a map keyed by USFM code with
explicit nulls for books that have no saved position (marks
them as checked so they are not refetched).

```typescript
getBulkReadingPositions(
  bookIds: string[]
): Promise<Record<string, { chapter: number; verse: number } | null>>
```

**Store integration** (`src/store.ts`):
- `readingPositions` — persisted per-book cache
  (`Record<bookId, { chapter, verse } | null>`)
- `prepareBookSwitch(bookId)` — resolves the saved chapter and
  queues scroll restoration via the transient, non-persisted
  `pendingScrollVerse`; returns the target chapter without
  writing `activeBookId`/`activeChapter` — the caller navigates
  and `BibleRoute`'s URL->store sync writes the book, so a stale
  URL can never revert the switch. The return is `number |
  Promise<number>`: a bare number for locally-known positions
  (cached/anonymous/offline) so the caller's `navigate()` lands
  in the same commit — awaiting it would reopen the stale-book
  gap where a rapid chapter pick acts on the old book
- `syncReadingPosition(bookId, chapter, verse)` — updates the
  local cache and pushes to the API when authenticated; driven
  by chapter loads and debounced first-verse-in-view scroll
  tracking in `PassageView`
- `prefetchReadingPositions()` — bulk-fetches all positions on
  app load for authenticated users (`App.tsx`)

---

## Caching System

### Overview
The app uses a sophisticated caching system to improve 
performance and reduce API calls.

**Location**: `src/utils/cacheManager.ts`

### Three-Tier Cache

#### 1. Verse Cache (LRU with 500-verse limit)
**Purpose**: Cache ESV verses to reduce API calls

**Features**:
- Maximum 500 verses (copyright compliance)
- LRU (Least Recently Used) eviction
- Access count tracking
- Timestamp tracking

**Storage Keys**:
- `bible_verse_cache`: Verse data
- `bible_verse_cache_metadata`: LRU queue and stats

**Cache Key Format**: 
`{filesetId}:{book}:{chapter}` (verses for the chapter are
stored under the chapter-level key)

**Note**: The cache key uses `filesetId` (e.g., `ENGESV`) not `version` (e.g.,
`ESV`).

**Implementation**:
```typescript
// Check cache
const cached = getCachedVerses(book, chapter, filesetId);
if (cached) return cached;

// Fetch from API
const verses = await fetchFromAPI();

// Cache for future use
cacheVerses(book, chapter, filesetId, verses);
```

**LRU Eviction**:
```typescript
// When adding new verses exceeds limit
if (newTotal > MAX_VERSES) {
  const versesToRemove = newTotal - MAX_VERSES;
  const keysToRemove = metadata.lruQueue.splice(0, versesToRemove);
  keysToRemove.forEach(key => delete cache[key]);
}
```

#### 2. Audio Cache (Unlimited with expiration)
**Purpose**: Cache audio URLs to avoid repeated API calls

**Features**:
- No size limit (URLs are small)
- Expiration-based eviction
- Parses CloudFront URL expiration
- Auto-cleanup on app load

**Storage Key**: `bible_audio_cache`

**Cache Key Format**: `{version}:{book}:{chapter}`

**Implementation**:
```typescript
// Check cache and expiration
const cached = getCachedAudioUrl(book, chapter, 'ESV');
if (cached && !isExpired(cached)) return cached;

// Fetch from API
const audioUrl = await fetchAudioURL();

// Parse expiration from CloudFront URL
const expiresAt = parseExpiration(audioUrl);

// Cache with expiration
cacheAudioUrl(book, chapter, 'ESV', audioUrl, expiresAt);
```

**Expiration Handling**:
```typescript
// On app load, remove expired URLs
clearExpiredAudioUrls();

// When retrieving, check expiration
if (Date.now() > audioData.expiresAt) {
  delete cache[cacheKey];
  return null;
}
```

#### 3. Notes Cache (Tag-based, scoped)
**Purpose**: Cache notes pages by tag to eliminate redundant API
calls

**Storage Key**: `bible_notes_cache_v2` — the v1 `tagId`-only
blob (`bible_notes_cache`) is dropped on load, not migrated.

**Features**:
- No size limit (notes are user-generated)
- Stores `{ notes, timestamp, count, hasMore }` so pagination
  metadata round-trips through the cache
- Selective invalidation: `clearNotesCache(tagId)` wipes all
  pages of one tag; `clearNotesCache()` wipes everything

**Cache Key Format**:
`{tagId}:{anon|auth}:fs:{filesetId}:ps:{pageSize}:page{n}:{ordering}`

**Implementation** (in `stores/bibleStore/notesSlice.ts`):
```typescript
fetchNotes: async (tagId, options) => {
  const scope = { filesetId, pageSize: notesPageSize,
                  authed: Boolean(token) };
  const cachedData = getCachedNotes(tagId, page, ordering,
                                    scope);
  if (cachedData) {
    set({ notes: cachedData.notes, notesCount: cachedData.count,
         notesHasMore: cachedData.hasMore, ... });
    return;
  }
  const response = await api.getNotes(tagId, options);
  cacheNotes(tagId, response.results, { count, hasMore, page,
                                      ordering, ...scope });
  set({ notes: response.results, ... });
}
```

The scope fields exist because the response depends on them:
- `anon|auth` — owners see private notes that anonymous callers
  must never be served from cache.
- `filesetId` — the backend fills `note.verses[].text` from the
  requested fileset, so switching text translations must miss.
- `pageSize` — page membership depends on it.

**Cache Invalidation**:
- `addTagNote`/`editNote`/`deleteNote`/`reorderNotes`/`moveNote`
  clear the affected tag's pages (`clearNotesCache(tagId)` is a
  prefix delete over every scoped page).
- A `useAuthStore.subscribe` watcher in `authStore.tsx` purges
  `notes`, `tags`, `readingPositions`, and the whole notes cache
  whenever the token is dropped or replaced — covers both manual
  logout and 401-driven logout, so a shared device can't expose
  the previous user's private notes. The bible store registers
  itself via `registerBibleStore()` at module scope rather than
  being imported by `authStore`, keeping the dependency one-way
  (a static `authStore → store` edge would close an
  `api → apiClient → authStore → store → api` cycle).
- The 409-conflict refresh clears the tag cache *before*
  refetching, so it can't read back the stale page it is trying
  to replace.

```typescript
// Clear all pages of one tag (any scope)
clearNotesCache('TAG123');

// Clear the entire notes cache
clearNotesCache();
```

**Performance Impact**:
- **First visit**: API call (200-500ms)
- **Return visit**: Cached (< 10ms) ✅

**When Cache Is Cleared**:
- ✅ Note create/edit/delete/move (tag-scoped or global)
- ✅ Token drop/replace (logout or 401) via the authStore
  watcher
- ✅ Manual clear via `clearNotesCache()`

**Fetch wrappers** (`src/utils/apiClient.ts`):
- `publicFetch` attaches the token when present but, on a 401,
  retries once **without** `Authorization` — DRF authenticates
  before `AllowAny` permission checks, so an expired token would
  otherwise poison public reads.
- `authenticatedFetch` keeps the 401 → logout + "session
  expired" behaviour; `TypeError` (network drop) retries are
  restricted to idempotent GET/HEAD so a lost POST response
  can't double-create a note/tag/comment.

#### 4. Translation Cache (Session-based)
**Purpose**: Cache translation lists to avoid refetching

**Features**:
- Simple key-value store
- No expiration
- Language-based organization

**Storage Key**: `bible_translation_cache`

**Cache Key Format**: `{languageIso}` (e.g., `"eng"`)

**Implementation**:
```typescript
// Check cache
const cached = getCachedTranslations('eng');
if (cached) return cached;

// Fetch from API
const translations = await fetchTranslations('eng');

// Cache for future use
cacheTranslations('eng', translations);
```

### Cache Statistics
```typescript
getCacheStats() // Returns usage info for debugging
```

---

### Code Style Guidelines

- **TypeScript**: Use strict typing, avoid `any` when possible
- **Components**: Functional components with hooks
- **State**: Use Zustand for global state, local state for 
  component-specific
- **Naming**: 
  - Components: PascalCase (`MyComponent.tsx`)
  - Functions: camelCase (`getBooks()`)
  - Constants: UPPER_SNAKE_CASE (`MAX_VERSES`)
- **File Organization**: Group related functionality together
- **Line length**: 79 characters max in every file type —
  enforced by `max-len` (ESLint) for `.ts`/`.tsx`; keep docs
  and comments within it too
- **Enforced lint rules** (`npm run lint`, `--max-warnings 0`):
  - `max-len: 79`
  - `react-hooks/exhaustive-deps`: error — fix the dep array
    rather than disabling; a disable needs a justification
    comment
  - `@typescript-eslint/no-floating-promises`: error — mark
    deliberate fire-and-forget calls with `void`
    (`void navigate(...)`, `void prefetch(...)`) or `await`
    them

### Testing Guidelines

- Write tests for new features
- Use React Testing Library for component tests
- Test user interactions, not implementation details
- Aim for meaningful test coverage

**Example Test**:
```typescript
it('should navigate to selected book', async () => {
  renderWithProviders(<App />);

  const johnLink = await screen.findByTitle('nav-book-JHN');
  await userEvent.click(johnLink);

  expect(useBibleStore.getState().activeBookId).toBe('JHN');
});
```

---

## Keeping Documentation Updated

### ⚠️ IMPORTANT: Update This Guide After Changes

Whenever you add, modify, or remove functionality in this project, **you MUST
update this DEVELOPER_GUIDE.md** to reflect those changes.

### When to Update Documentation

Update the guide when you:
- ✅ Add a new feature or component
- ✅ Modify existing functionality
- ✅ Change the API integration
- ✅ Update the state management structure
- ✅ Add or remove dependencies
- ✅ Change the caching strategy
- ✅ Modify the data flow
- ✅ Update external API endpoints

### What to Update

Depending on your changes, update the relevant sections:

1. **New Feature**: Add to [Core Functionalities](#core-functionalities)
2. **New Component**: Add to [Component Structure](#component-structure)
3. **API Changes**: Update [API Integration](#api-integration)
4. **State Changes**: Update [State Management](#state-management)
5. **Cache Changes**: Update [Caching System](#caching-system)
6. **Architecture Changes**: Update [Architecture](#architecture) and [Data
   Flow](#data-flow)

### Documentation Update Checklist

Before submitting a PR with functionality changes:

- [ ] Updated relevant sections in DEVELOPER_GUIDE.md
- [ ] Added code examples if introducing new patterns
- [ ] Updated data flow diagrams if applicable
- [ ] Added any new dependencies to Tech Stack section
- [ ] Updated API endpoints if changed
- [ ] Reviewed for accuracy and clarity

### For Windsurf AI Assistant

**🤖 AI Instruction**: When making code changes to this project:
1. After implementing any functionality update, automatically update the
   DEVELOPER_GUIDE.md
2. Ensure the documentation accurately reflects the new implementation
3. Add code examples for new patterns or features
4. Update the Table of Contents if adding new sections
5. Maintain consistent formatting and style with existing documentation

---

## Browser Compatibility

### Supported Browsers

The app is tested and works on:

- **Chrome/Edge**: v90+ (recommended)
- **Firefox**: v88+
- **Safari**: v14+
- **Mobile Safari (iOS)**: v14+
- **Chrome Mobile (Android)**: v90+

### Required Browser Features

#### Core Features (Required)
- **ES6+ JavaScript**: Arrow functions, async/await, modules
- **localStorage**: For state persistence and caching
- **Fetch API**: For API calls
- **CSS Flexbox/Grid**: For layout

#### Enhanced Features (Optional)
- **Media Session API**: For hardware audio controls
  - Supported: Chrome, Edge, Safari, Firefox
  - Fallback: Basic audio controls still work
- **Service Workers**: Not currently used, but could be added for PWA

### Media Session API Support

The app uses the Media Session API for hardware audio controls:

```typescript
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${toBookName(activeBookId)} ${activeChapter}`,
    artist: translationName,
    album: 'Bible Audio',
  });
  
  // Hardware control handlers
  navigator.mediaSession.setActionHandler('play', ...);
  navigator.mediaSession.setActionHandler('pause', ...);
  navigator.mediaSession.setActionHandler('seekforward', ...);
  // etc.
}
```

**Supported Controls**:
- ✅ Play/Pause (all platforms)
- ✅ Seek Forward/Backward (headphones, car stereo)
- ✅ Lock screen controls (mobile)
- ✅ Notification controls (desktop)

**Fallback**: If Media Session API is not available, audio still works with
on-screen controls.

### Mobile Considerations

#### Touch Interactions
- Verse selection optimized for touch (no text selection on long-press)
- Context menu disabled on verses
- Tap highlight removed for cleaner UX

#### Responsive Design
- Navbar collapses on mobile (`hiddenBreakpoint="sm"`)
- Burger menu for navigation
- Audio player fixed at bottom (mobile-friendly)

#### iOS Safari Specific
- Audio autoplay restrictions: User must initiate playback
- localStorage works correctly
- Smooth scrolling supported

### Known Limitations

1. **Audio Autoplay**: Most browsers block autoplay. User must click play
   button.
2. **localStorage Limits**: ~5-10MB per domain (sufficient for our caching
   needs)
3. **Offline Mode**: Only KJV is available offline. Other translations require
   internet.

---

## Performance Considerations

### Caching Strategy

#### Why 500 Verse Limit?

The verse cache is limited to 500 verses for **copyright compliance**:

- Most Bible translations have copyright restrictions
- Caching entire translations could violate terms of service
- 500 verses ≈ 10-15 chapters (reasonable for recent reading)
- LRU eviction ensures most-used content stays cached

#### Cache Breakdown

**Verse Cache** (`localStorage`):
- **Limit**: 500 verses (LRU eviction)
- **Key**: `{filesetId}:{book}:{chapter}`
- **Metadata**: Access count, timestamp, LRU queue
- **Purpose**: Reduce API calls, faster navigation

**Audio Cache** (`localStorage`):
- **Limit**: Unlimited (with expiration)
- **Key**: `{filesetId}:{book}:{chapter}`
- **Expiration**: Parsed from CloudFront URL (typically 24h)
- **Purpose**: Instant audio playback on revisit

**Translation Cache** (`localStorage`):
- **Limit**: Unlimited
- **Key**: `{languageIso}`
- **Purpose**: Avoid refetching translation list

### Prefetching Strategy

The app prefetches adjacent chapters for seamless navigation:

```typescript
// When user navigates to a chapter
prefetchAdjacentChapters(book, chapter, filesetId);

// Prefetches:
// - Previous chapter verses
// - Next chapter verses
// - Previous chapter audio (background)
// - Next chapter audio (background)
```

**Benefits**:
- Instant navigation to next/previous chapter
- No loading spinner for common navigation patterns
- Background prefetch doesn't block UI

**Trade-offs**:
- Extra API calls (minimal, cached)
- Slightly more localStorage usage

### Bundle Size Optimization

**Current Bundle** (approximate):
- **Entry chunk**: ~220KB raw / ~51KB gzipped
- **Vendor chunks** (`build.rolldownOptions.output.codeSplitting`
  in `vite.config.ts`): `vendor-mantine` ~399KB, `vendor-react`
  ~180KB, `vendor-howler` ~36KB — eagerly modulepreloaded by
  `index.html`. `vendor-dndkit` ~47KB is *not* preloaded; it is
  only referenced by the lazy `TagNotesRoute` chunk.
- **Eager JS total**: ~840KB raw / ~232KB gzipped (entry +
  modulepreloaded chunks)
- **TipTap/ProseMirror** (~373KB): no `vendor-tiptap` group on
  purpose — every importer is a lazy chunk (note modals,
  `NoteCard` → `CommentForm` → `RichTextEditor`), so rolldown
  keeps it inside the lazy `RichTextEditor` chunk. A manual
  group with the default `includeDependenciesRecursively`
  dragged the whole dep closure (react, @mantine/*) into a
  ~690KB chunk that `index.html` modulepreloaded eagerly.
  `vendor-mantine`'s test excludes `@mantine/tiptap` so it
  stays in the lazy editor graph.
- **KJV JSON**: ~4.5MB gzipped (lazy-loaded chunk)
- **Route chunks**: non-bible routes lazy via `React.lazy` in
  `src/routes/index.tsx`; `BibleRoute`/`LegacyBibleRedirect` stay
  eager (landing path)
- **Modal chunks**: `AddTagNoteModal`, `AddStandaloneNoteModal`,
  `EditNoteModal` lazy + gated on their open flag, keeping
  TipTap out of the entry graph entirely

**Optimizations**:
- Tree-shaking enabled (Vite)
- Route-level + vendor code splitting (above)
- KJV JSON loaded as separate chunk
- Production builds minified and compressed

### Performance Metrics

**Target Metrics** (Lighthouse):
- **Performance**: 90+
- **Accessibility**: 95+
- **Best Practices**: 90+
- **SEO**: 90+

**Core Web Vitals** (tracked by Speed Insights):
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

### Memory Management

**Audio Cleanup**:
```typescript
// Audio instances are unloaded when chapter changes
useEffect(() => {
  if (audio) {
    audio.unload();
    setAudio(null);
  }
}, [activeBookId, activeChapter, activeAudioFilesetId]);
```

**Cache Cleanup**:
```typescript
// Expired audio URLs cleaned on app mount
useEffect(() => {
  clearExpiredAudioUrls();
}, []);
```

### Optimization Opportunities

**Future Improvements**:
1. **Code Splitting**: Routes and modals are already lazy;
   further splitting has diminishing returns
2. **Virtual Scrolling**: For long chapters (e.g., Psalms 119)
3. **Service Worker**: For true offline support
4. **Image Optimization**: If images are added
5. **Debounced Search**: Search input on `/search` submits via
   the `?q=` param; `/` opens it from anywhere

---

## Android App & Release Channels

The Capacitor shell (`android/`, `webDir: 'dist'`) is distributed by
sideloading APKs from GitHub Releases — there is no Play Store
listing. `.github/workflows/android-release.yml` has three channels:

| Trigger              | Output                                        |
|----------------------|-----------------------------------------------|
| push `android`       | debug APK → workflow artifact (30 days)       |
| `workflow_dispatch`  | debug APK → workflow artifact                 |
| push `v*` tag        | signed APK → that tag's GitHub Release asset  |
| push `main`          | signed APK + `update.json` → rolling          |
|                      | `continuous` prerelease                       |

- Signing uses `ANDROID_KEYSTORE_BASE64`, `KEY_ALIAS`,
  `KEYSTORE_PASSWORD`, `KEY_PASSWORD` secrets. The same keystore
  must sign every build or sideloaded updates will fail to install.
- `versionCode` is always `github.run_number` (monotonic across all
  builds) so Android accepts every newer build as an in-place
  update. `versionName` is the tag name for `v*` builds and
  `0.0.<run_number>` on `main`.
- The `continuous` tag is force-moved to each `main` commit;
  `prerelease: true` + `make_latest: false` keep
  `releases/latest` pointing at real milestones.

### In-app update check

`src/utils/appUpdate.ts` + `src/hooks/useAppUpdate.tsx`: on app
start (native shell only, throttled to once per hour via the
`app_update_last_check` localStorage key) the app fetches
`releases/download/continuous/update.json` and compares
`versionCode` against `App.getInfo().build`. A newer build opens a
Mantine confirm modal whose "Update" button hands `apkUrl` to the
system browser — Android always requires user consent for
sideloaded installs. The MainMenu has a "Check for updates" row
(native only) that forces a check.

`update.json` schema (generated in-workflow):

```json
{
  "versionCode": 123,
  "versionName": "0.0.123",
  "apkUrl": "<.../releases/download/continuous/reactive-bible.apk>",
  "apkSha256": "<sha256 of the signed APK>",
  "minShellBuild": 123,
  "commitSha": "<commit the build was cut from>",
  "releasedAt": "<ISO-8601 UTC>"
}
```

`minShellBuild` is reserved for a future OTA web-bundle path — a
bundle may only be applied when `installedBuild >= minShellBuild`.

---

## Error Reporting & Monitoring

Sentry (`@sentry/react`, project `reactive-bible-web` in org
`bible-research`) sits underneath the existing in-app error
surface as the transport layer:

- `src/main.tsx` calls `Sentry.init` **only when**
  `VITE_SENTRY_DSN` is set — dev, tests, and preview builds
  without it send nothing (`captureException`/`captureMessage`
  are safe no-ops uninitialised).
- `src/utils/errorReporter.tsx` (`reportError`) forwards every
  surfaced fatal error as an exception tagged with its context
  string; resource-load failures go as `warning`-level messages
  with the query string stripped — signed-URL credentials never
  reach Sentry. `src/components/ErrorBoundary.tsx` captures
  render errors with `extra.componentStack` and the `context`
  tag on the first capture (the tagged re-capture is deduped).
- `src/utils/sentry.ts` exports `sentryBeforeSend`, which drops
  the handled taxonomy (`RateLimitError`,
  `BookNotInFilesetError`, `AbortError`, 'Session expired') so
  expected conditions don't burn quota. `ClientInputError` is
  deliberately NOT dropped — it means our own request was
  malformed, a bug worth reporting.
- **User reports:** the main menu's "Report a problem" row
  (always visible) opens `ReportProblemModal`, where the user
  describes the issue. `sendUserReport`
  (`src/utils/userReport.ts`) captures a `user report` message
  tagged `reportType: user-report` — the note, reporter's
  username (when logged in) and current passage
  (book/chapter/filesets) sit in the `userReport` context —
  plus a user-feedback event linked via `associatedEventId`,
  which also lists each report in Sentry's User Feedback view.
  Query: `message:"user report"` or `reportType:user-report`.
- Sampling (free-tier sizing): `tracesSampleRate` 0.1,
  `replaysSessionSampleRate` 0 + `replaysOnErrorSampleRate` 1.0
  (replays only for errored sessions, `maskAllText` +
  `blockAllMedia` on — verse text/notes are user content).
  `environment` comes from Vercel's `VERCEL_ENV`
  ('production' | 'preview' | 'development'), baked into
  `import.meta.env.VITE_APP_ENV` by `define` in
  `vite.config.ts` — unset locally (''), so the runtime falls
  back to Vite `MODE`. No Vercel-dashboard config needed.
  `tracePropagationTargets` is `API_BASE_URL`.
- Sourcemaps: `vite.config.ts` emits `hidden` maps and activates
  `@sentry/vite-plugin` only when `SENTRY_AUTH_TOKEN` +
  `SENTRY_ORG` + `SENTRY_PROJECT` are all present (CI/Vercel env,
  never `VITE_`-prefixed); without them no `.map` files ship.
  Release name comes from `VERCEL_GIT_COMMIT_SHA`, falling back
  to git auto-detection.
- Configure per-environment DSNs in the Vercel dashboard
  (Production + Preview); see `.env.example`. Backend-side
  setup is documented in `docs/plans/sentry-monitoring-plan.md`
  at the workspace root.

---

## Additional Resources

- **Mantine Docs**: https://mantine.dev/
- **Zustand Docs**: https://github.com/pmndrs/zustand
- **Howler.js Docs**: https://howlerjs.com/
- **Vite Docs**: https://vitejs.dev/
- **React Testing Library**: 
  https://testing-library.com/react

---

## Questions or Issues?

- Open an issue on GitHub
- Check existing issues for similar problems
- Provide detailed reproduction steps
- Include browser/OS information

---

**Happy Contributing! 🎉**
