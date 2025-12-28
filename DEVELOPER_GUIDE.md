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
- **Analytics**: Vercel Analytics
- **Performance Monitoring**: Vercel Speed Insights

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
- **Component-Based Architecture**: Modular, reusable components in `src/components`.
- **Centralized State**: A single Zustand store (`src/store.tsx`) for global state, with persistence to `localStorage`.
- **API Layer Separation**: All external data fetching and business logic is handled in `src/api.tsx`.
- **Cache-First Strategy**: A multi-level caching system (`src/utils/cacheManager.ts`) minimizes API calls and improves speed.
- **Persistent State**: User preferences (like theme and translation choice) are saved across sessions.

---

## State Management

**Location**: `src/store.tsx`

The application uses Zustand for lightweight, centralized state management. The state is persisted to `localStorage` to remember user selections across sessions.

### State Shape (`BibleState`)
- `activeBook`, `activeChapter`, `activeVerses`: For navigation.
- `translations`: Holds the list of available Bible translations fetched from the API.
- `activeTextFilesetId`: The fileset ID for the selected text version.
- `activeAudioFilesetId`: The fileset ID for the selected audio version.
- `showAudioPlayer`: Toggles the visibility of the audio player.

### Actions
- Setters for all state properties (e.g., `setActiveBook`, `setTranslations`).
- Logic for smooth-scrolling to selected verses is included in `setActiveVerses`.

---

## Core Functionalities

### 1. Bible Reading & Navigation

**Location**: `src/components/MyNavbar.tsx`, `src/components/Passage.tsx`, `src/components/PassageView.tsx`

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

**Location**: `src/api.tsx`, `src/components/TranslationSelector.tsx`

Provides dynamic, API-driven support for multiple Bible translations, including different text and audio formats for each.

**Key Features**:
- **Dynamic Translation Loading**: Fetches available translations from the backend API.
- **Text & Audio Selection**: Users can select preferred text and audio filesets independently.
- **Flexible Audio Options**: Supports multiple audio types (e.g., `audio`, `audio_drama`) and formats (e.g., `mp3`, `opus`).
- **State-Driven**: Selections are stored in the global Zustand store and persisted in localStorage.

**Implementation**:
- A `TranslationSelector` modal allows users to browse and select versions.
- All data fetching is now driven by a `filesetId` instead of a simple version string.

```typescript
// Fetches available translations for a language
getAvailableTranslations(languageIso: string): Promise<Translation[]>

// Fetches verse content based on a specific fileset ID
getVersesInChapter(
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]>
```

**Data Flow**:
1. `TranslationSelector` fetches available translations and stores them in Zustand.
2. User selects a translation, text fileset, and audio fileset in the modal.
3. Selections are saved to the Zustand store (`activeTextFilesetId`, `activeAudioFilesetId`).
4. Components like `PassageView` and `Audio` react to state changes, fetching content using the selected fileset IDs.

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
- Skip forward/backward (±10 seconds)
- Auto-advance to next chapter
- Loop current chapter infinitely
- Smart prefetching system:
  - Current chapter audio URL
  - Adjacent chapters (previous/next) verses + audio
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
const translationName = translations.find(t => t.filesets.some(f => f.id === activeTextFilesetId))?.name || 'Unknown';
navigator.mediaSession.metadata = new MediaMetadata({
  title: `${activeBook} ${activeChapter}`,
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

**Hardware Controls**:
- **Play/Pause**: Works on all devices (headphones, car)
- **Seek Forward/Backward**: Skips ±10 seconds (headphones)
- **Next/Previous Track**: Skips ±10 seconds (car stereo)
- **Seek To**: Direct time seeking (car stereo fallback)
- **Lock Screen**: Shows chapter info and controls (mobile)

**Note**: Different controls have different skip amounts:
- Headphone seek buttons: ±10 seconds (fine control)
- Car stereo next/prev: ±10 seconds (easier while driving)
- To change chapters: Use auto-advance or navigate in app

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
- Auto-clear selected verses after note creation

**Workflow**:
1. User selects one or more verses by clicking them
2. User clicks "Add Note" button
3. User selects a tag and enters note text
4. On submit, note is saved to API
5. Selected verses are automatically cleared
6. Modal closes

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

**Implementation Detail**:
```typescript
// In AddTagNoteModal.tsx
const handleSubmit = async (event) => {
  const verseReferences = activeVerses.map((verse) => ({
    book: activeBook,
    chapter: activeChapter,
    verse,
  }));
  
  await addTagNote(selectedTagId, tagNoteText, verseReferences);
  setActiveVerses([]); // Clear selected verses
  onClose();
};
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
development.

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

#### 3. Translation Cache (Session-based)

- **Type**: Simple key-value store.
- **Key**: Language ISO code (e.g., `"eng"`).
- **Value**: The array of `Translation` objects for that language.
- **Purpose**: Prevents refetching the list of available translations every time the selector is opened within the same session.
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
