# CLAUDE.md - Claude Code Project Guide

## Project Overview

**Reactive Bible** is a modern Bible reading and study application built with React 18 and TypeScript. It provides offline Bible reading (KJV stored locally), multi-translation support via API, audio playback with hardware controls, full-text search, and a note-taking system with tags.

**Live**: Deployed on Vercel with CI/CD

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18.2 + TypeScript 5.0 |
| Build | Vite 4.3 with SWC |
| UI | Mantine v6 (components, hooks, forms, modals, rich text) |
| State | Zustand 4.3 with localStorage persistence |
| Audio | Howler.js 2.2 + Media Session API |
| Rich Text | TipTap 2.0 |
| Testing | Vitest + React Testing Library + happy-dom |
| Analytics | Vercel Analytics & Speed Insights |

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # TypeScript check + production build
npm run lint      # ESLint (zero warnings policy)
npm run preview   # Preview production build
npm test          # Run tests with UI
npm run coverage  # Test coverage report
```

## Project Structure

```
src/
├── components/           # 18 React components
│   ├── App.tsx          # Main shell, theme, keyboard shortcuts
│   ├── MyNavbar.tsx     # 3-column nav (Books|Chapters|Verses)
│   ├── MyHeader.tsx     # Top header with controls
│   ├── Passage.tsx      # Main content (Bible/Notes toggle)
│   ├── PassageView.tsx  # Verse display with prefetching
│   ├── Verse.tsx        # Individual verse (click-to-select)
│   ├── Audio.tsx        # Playback logic, Howler, Media Session
│   ├── AudioPlayer.tsx  # Floating player UI
│   ├── SearchModal.tsx  # Full-text search with autocomplete
│   ├── TranslationSelector.tsx  # Multi-translation picker
│   ├── NotesView.tsx    # Notes with tag filtering
│   ├── NoteCard.tsx     # Individual note display
│   ├── NoteForm.tsx     # TipTap rich text editor
│   ├── AddTagNoteModal.tsx / EditNoteModal.tsx
│   └── TagSection.tsx   # Tag management
├── utils/
│   ├── cacheManager.ts  # 3-tier cache (verses/audio/translations)
│   └── bibleUtils.ts    # Book metadata, testament helpers
├── assets/
│   └── kjv.json         # Complete KJV Bible (31,102 verses)
├── api.tsx              # API functions, data fetching
├── store.tsx            # Zustand state management
├── types.ts             # TypeScript interfaces (Note, Tag)
└── main.tsx             # Entry point
```

## Architecture

### State Management (Zustand)

Store in `store.tsx`:
```typescript
interface BibleState {
  activeBook: string           // "Genesis"
  activeBookShort: string      // "Gen"
  activeChapter: number        // 1
  activeVerses: number[]       // [1, 2, 3]
  selectedVerses: number[]     // For note creation
  bibleVersion: string         // "KJV", "ESV"
  translations: Translation[]
  activeTextFilesetId: string | null
  activeAudioFilesetId: string | null
  notes: Note[]
  showAudioPlayer: boolean     // NOT persisted
}
```

**Usage pattern**:
```typescript
const activeBook = useBibleStore(state => state.activeBook)
const setActiveBook = useBibleStore(state => state.setActiveBook)
```

### Caching System (`utils/cacheManager.ts`)

Three-tier localStorage cache:

1. **Verse Cache**: LRU with 500-verse limit (copyright compliance)
   - Key: `{filesetId}:{book}:{chapter}:{verse}`

2. **Audio Cache**: Unlimited with CloudFront expiration parsing
   - Auto-cleanup on app mount

3. **Translation Cache**: Session-based by language ISO

### Data Flow

**Reading**: User selects book/chapter → Zustand updates → PassageView fetches verses (cache-first) → Prefetch adjacent chapters

**Audio**: Play button → Check fileset → Fetch/cache audio URL → Howler playback → Media Session for hardware controls → Auto-advance chapters

**Notes**: Select verses → Add Note modal → TipTap editor → API save → Clear selection

## External APIs

### Bible Research API
Base: `https://bibleresearchapi.vercel.app/api/v1`

| Endpoint | Purpose |
|----------|---------|
| `/bible?passage={}&fileset_id={}` | Fetch verse text |
| `/bible/audio?passage={}&fileset_id={}` | Fetch audio URL |
| `/bibles?language_iso={}` | List translations |
| `/notes/` | Notes CRUD |
| `/tags/` | Tag list |

### KJV Audio
`https://wordpocket.org/bibles/app/audio/1/{bookIndex}/{chapter}.mp3`

## Key Patterns

### Component Testing
```typescript
test("should load verses", async () => {
  render(<App />)
  fireEvent.click(screen.getByTitle("nav-book-John"))
  await waitFor(() => {
    expect(screen.getByTitle("passage-verse-16")).toBeInTheDocument()
  }, { timeout: 5000 })
})
```

**Test attributes**: `title="nav-book-{code}"`, `title="nav-chapter-{n}"`, `title="passage-verse-{n}"`

### Error Handling
- API calls: try-catch with fallbacks
- Prefetch: Silent failures (logged, not thrown)
- Cache: Returns null/empty on failure

### ESV Audio Filesets
- Old Testament: `ENGESVO1DA`
- New Testament: `ENGESVN1DA`
- Determined by `bibleUtils.ts` testament lookup

## Conventions

- **Files**: PascalCase components, camelCase utilities
- **Constants**: UPPER_SNAKE_CASE
- **Types**: Interfaces with PascalCase
- **Zustand**: Use specific selectors to prevent re-renders
- **No `any`**: Strict TypeScript mode enabled

## Important Notes

- KJV is bundled locally (`kjv.json`) - works offline
- Other translations require API (copyright compliance)
- Audio cache parses CloudFront expiration from URL
- 500-verse cache limit for non-KJV (copyright)
- Media Session API provides hardware controls (headphones, car stereo)
- Global keyboard: `/` opens search, `Escape` closes modals
