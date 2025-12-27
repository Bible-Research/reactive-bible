# Reactive Bible - Developer Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Core Functionalities](#core-functionalities)
4. [State Management](#state-management)
5. [Data Flow](#data-flow)
6. [Component Structure](#component-structure)
7. [API Integration](#api-integration)
8. [Caching System](#caching-system)
9. [Contributing Guidelines](#contributing-guidelines)
10. [Keeping Documentation Updated](#keeping-documentation-updated)

---

## Project Overview

**Reactive Bible** is a modern Bible reading application built with 
React, TypeScript, and Vite. It provides offline Bible reading 
(KJV stored locally), online Bible translations (ESV via API), 
audio playback, verse tagging, and advanced search capabilities.

### Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Mantine v6
- **State Management**: Zustand with localStorage persistence
- **Audio**: Howler.js
- **Testing**: Vitest + React Testing Library
- **Icons**: Tabler Icons

---

## Architecture

### High-Level Structure
```
src/
├── components/          # React components
├── utils/              # Utility functions (caching)
├── assets/             # Static assets (kjv.json)
├── api.tsx             # API functions and data access
├── store.tsx           # Zustand state management
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

### Design Patterns
- **Component-Based Architecture**: Modular, reusable components
- **Centralized State**: Zustand store for global state
- **API Layer Separation**: All data fetching in `api.tsx`
- **Cache-First Strategy**: LocalStorage caching for performance
- **Persistent State**: User preferences saved across sessions

---

## Core Functionalities

### 1. Bible Reading & Navigation

**Location**: `src/components/MyNavbar.tsx`, `src/components/Passage.tsx`

The app provides three-level navigation:
- **Books**: 66 books of the Bible (Genesis to Revelation)
- **Chapters**: Dynamic chapter list per book
- **Verses**: Individual verse navigation and selection

**Key Features**:
- Three-column sidebar navigation (Book | Chapter | Verse)
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

**Location**: `src/api.tsx`, `src/components/BibleVersionToggle.tsx`

Supports multiple Bible translations:
- **KJV (King James Version)**: Stored locally in `kjv.json`
- **ESV (English Standard Version)**: Fetched from external API

**Implementation**:
```typescript
// Main function that routes to correct translation
getVersesInChapter(
  book: string, 
  chapter: number, 
  bibleVersion: string
): Promise<{ verse: number; text: string }[]>

// KJV: Direct JSON access (instant)
getVersesInKjvChapter(book: string, chapter: number)

// ESV: API fetch with caching
getVersesInEsvChapter(book: string, chapter: number)
```

**Data Flow**:
1. User selects translation via toggle
2. State updates in Zustand store
3. Component re-renders with new translation
4. API fetches data (with cache check first)

### 3. Advanced Search

**Location**: `src/components/SearchModal.tsx`

Full-text search across the entire Bible with autocomplete.

**Features**:
- Real-time search as you type
- Searches verse text across all books
- Displays verse reference (Book Chapter:Verse)
- Keyboard shortcuts: `/` to open, `Escape` to close
- Limit of 7 results shown at once

**Implementation**:
```typescript
// Search data prepared at module load
const searchData = data.map((book: KjvBook) => 
  ({ ...book, value: book.text })
);

// Mantine Autocomplete component handles fuzzy matching
<Autocomplete
  data={searchData}
  onItemSubmit={(item) => {
    // Navigate to selected verse
    setActiveBook(item.book_name);
    setActiveChapter(item.chapter);
    setActiveVerses([item.verse]);
  }}
/>
```

### 4. Audio Bible Playback

**Location**: `src/components/Audio.tsx`, 
`src/components/AudioPlayer.tsx`

Streams audio Bible chapters with full playback controls.

**Features**:
- Play/Pause controls
- Progress bar with seek functionality
- Auto-advance to next chapter
- Media Session API integration (hardware controls)
- Loading states and error handling
- Persistent audio player UI

**Audio Sources**:
- **KJV**: wordpocket.org (direct URL generation)
- **Other translations**: Bible Research API (CloudFront URLs)

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
navigator.mediaSession.metadata = new MediaMetadata({
  title: `${activeBook} ${activeChapter}`,
  artist: bibleVersion,
});
```

**Auto-Advance Logic**:
1. When chapter audio ends, find next chapter in passage list
2. Update active book/chapter in state
3. New audio loads automatically via useEffect
4. Playback continues seamlessly

### 5. Verse Selection & Highlighting

**Location**: `src/components/Verse.tsx`

Interactive verse selection with visual feedback.

**Features**:
- Click verse to select/deselect
- Multiple verse selection support
- Highlighted background for selected verses
- Auto-scroll to selected verse
- Unique ID for each verse (`verse-{number}`)

**Implementation**:
```typescript
const handleVerseClick = () => {
  if (isActive) {
    // Remove from selection
    setActiveVerses(activeVerses.filter(v => v !== verse));
  } else {
    // Add to selection
    setActiveVerses([...activeVerses, verse]);
  }
};

// Auto-scroll on selection
useEffect(() => {
  if (isActive) {
    ref.current?.scrollIntoView({ 
      block: "center", 
      behavior: "smooth" 
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
- View notes with verse references
- Navigate to verse from note
- API integration for persistence

**API Functions**:
```typescript
// Fetch all notes
getNotes(): Promise<Note[]>

// Create new note with tag
addTagNote(
  tagId: string,
  noteText: string,
  verseReferences: { book: string; chapter: number; verse: number }[]
)
```

**Note Structure**:
```typescript
interface Note {
  id: string;
  note_text: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: NoteVerse[];
}
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

---

## State Management

### Zustand Store (`src/store.tsx`)

Centralized state with localStorage persistence.

**State Shape**:
```typescript
interface BibleState {
  // Current reading position
  activeBook: string;           // e.g., "Genesis"
  activeBookShort: string;       // e.g., "Gen"
  activeChapter: number;         // e.g., 1
  activeVerses: number[];        // e.g., [1, 2, 3]
  selectedVerses: number[];      // For multi-select
  
  // Settings
  bibleVersion: string;          // "KJV" | "ESV"
  showAudioPlayer: boolean;      // Audio player visibility
  
  // Actions
  setActiveBook: (book: string) => void;
  setActiveBookOnly: (book: string) => void;
  setActiveBookShort: (short: string) => void;
  setActiveChapter: (chapter: number) => void;
  setActiveVerses: (verses: number[]) => void;
  setBibleVersion: (version: string) => void;
  setShowAudioPlayer: (show: boolean) => void;
}
```

**Persistence Strategy**:
```typescript
persist(
  (set) => ({ /* state and actions */ }),
  {
    name: "bible-storage",
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      // Only persist these fields
      activeBook: state.activeBook,
      activeBookShort: state.activeBookShort,
      activeChapter: state.activeChapter,
      activeVerses: state.activeVerses,
      selectedVerses: state.selectedVerses,
      bibleVersion: state.bibleVersion,
      // showAudioPlayer is NOT persisted
    }),
  }
)
```

**Usage in Components**:
```typescript
// Subscribe to specific state
const activeBook = useBibleStore(state => state.activeBook);
const setActiveBook = useBibleStore(state => state.setActiveBook);

// Update state
setActiveBook("Exodus");
```

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
User Types in Search
    ↓
Autocomplete filters searchData
    ↓
Display matching verses
    ↓
User selects result
    ↓
Update Zustand store (book, chapter, verse)
    ↓
Navigate to verse
    ↓
Close modal
```

---

## Component Structure

### Core Components

#### `App.tsx`
Main application shell with theme provider and layout.

**Responsibilities**:
- Theme management (light/dark mode)
- Keyboard shortcuts (`/` for search, `Escape` to close)
- Layout structure (AppShell with navbar and header)
- Cache cleanup on mount

#### `MyNavbar.tsx`
Three-column navigation sidebar.

**Responsibilities**:
- Display books, chapters, verses
- Handle navigation clicks
- Highlight active selections
- Responsive collapse on mobile

#### `Passage.tsx`
Main content area displaying Bible verses.

**Responsibilities**:
- Fetch and display verses for current chapter
- Handle loading and error states
- Render individual Verse components

#### `Verse.tsx`
Individual verse component with selection.

**Responsibilities**:
- Display verse number and text
- Handle click for selection
- Visual highlighting for active verses
- Auto-scroll to view

#### `Audio.tsx`
Audio playback button and logic.

**Responsibilities**:
- Fetch audio URLs
- Create Howl audio instance
- Handle play/pause state
- Auto-advance to next chapter
- Media Session API integration

#### `AudioPlayer.tsx`
Floating audio player UI.

**Responsibilities**:
- Display playback controls
- Show progress bar
- Handle seek functionality
- Display current time and duration

#### `SearchModal.tsx`
Full-screen search modal with autocomplete.

**Responsibilities**:
- Display search input
- Filter and show results
- Navigate to selected verse
- Keyboard shortcuts

#### `NotesView.tsx`
Notes display with tag filtering.

**Responsibilities**:
- Fetch notes from API
- Group notes by tag
- Filter by selected tag
- Handle loading and error states

---

## API Integration

### External APIs

#### Bible Research API
**Base URL**: `https://bible-research.vercel.app/api/v1`

**Endpoints**:

1. **Get Bible Verses**
   ```
   GET /bible?passage={book} {chapter}
   Response: { verses: [{ verse: number, text: string }] }
   ```

2. **Get Audio**
   ```
   GET /bible?passage={book} {chapter}&response_format=audio
   Response: { 
     audio_url: string, 
     duration_seconds: number,
     file_size_bytes: number 
   }
   ```

3. **Get Notes**
   ```
   GET /notes?tag_id={tagId}
   Response: Note[]
   ```

4. **Create Note**
   ```
   POST /notes/
   Body: { 
     tag: string, 
     note_text: string, 
     verse_references: [] 
   }
   ```

5. **Get Tags**
   ```
   GET /tags/
   Response: Tag[]
   ```

#### Wordpocket Audio API
**Base URL**: `https://wordpocket.org/bibles/app/audio/1`

**Pattern**: `/{bookIndex}/{chapter}.mp3`

**Example**: 
`https://wordpocket.org/bibles/app/audio/1/1/1.mp3` 
(Genesis Chapter 1)

---

## Caching System

### Overview
The app uses a sophisticated caching system to improve 
performance and reduce API calls.

**Location**: `src/utils/cacheManager.ts`

### Two-Tier Cache

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
`{version}:{book}:{chapter}:{verse}`

**Implementation**:
```typescript
// Check cache
const cached = getCachedVerses(book, chapter, 'ESV');
if (cached) return cached;

// Fetch from API
const verses = await fetchFromAPI();

// Cache for future use
cacheVerses(book, chapter, 'ESV', verses);
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

### Testing Guidelines

- Write tests for new features
- Use React Testing Library for component tests
- Test user interactions, not implementation details
- Aim for meaningful test coverage

**Example Test**:
```typescript
test('should navigate to selected book', () => {
  render(<MyNavbar opened={true} setOpened={jest.fn()} />);
  
  const genesisLink = screen.getByTitle('nav-book-Gen');
  fireEvent.click(genesisLink);
  
  expect(useBibleStore.getState().activeBook).toBe('Genesis');
});
```

---

## Keeping Documentation Updated

### ⚠️ IMPORTANT: Update This Guide After Changes

Whenever you add, modify, or remove functionality in this project, **you MUST update this DEVELOPER_GUIDE.md** to reflect those changes.

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
6. **Architecture Changes**: Update [Architecture](#architecture) and [Data Flow](#data-flow)

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
1. After implementing any functionality update, automatically update the DEVELOPER_GUIDE.md
2. Ensure the documentation accurately reflects the new implementation
3. Add code examples for new patterns or features
4. Update the Table of Contents if adding new sections
5. Maintain consistent formatting and style with existing documentation

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
