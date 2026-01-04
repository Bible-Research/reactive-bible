# Reactive Bible - Developer Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Development Setup](#development-setup)
3. [Architecture](#architecture)
4. [Core Functionalities](#core-functionalities)
5. [State Management](#state-management)
6. [Types & Interfaces](#types--interfaces)
7. [Data Flow](#data-flow)
8. [Component Structure](#component-structure)
9. [API Integration](#api-integration)
10. [Caching System](#caching-system)
11. [Bible Utilities](#bible-utilities)
12. [Testing](#testing)
13. [Browser Compatibility](#browser-compatibility)
14. [Performance Considerations](#performance-considerations)
15. [Contributing Guidelines](#contributing-guidelines)
16. [Keeping Documentation Updated](#keeping-documentation-updated)

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
- `npm run build` - Build for production (TypeScript compilation + Vite build)
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint to check code quality
- `npm test` - Run tests with Vitest UI
- `npm run coverage` - Generate test coverage report

### Project Structure

```
reactive-bible/
├── src/
│   ├── components/      # React components (18 files)
│   ├── utils/          # Utility functions
│   │   ├── bibleUtils.ts    # Bible book/testament helpers
│   │   └── cacheManager.ts  # Caching logic
│   ├── assets/         # Static assets
│   │   └── kjv.json    # KJV Bible text (local)
│   ├── api.tsx         # API functions
│   ├── store.tsx       # Zustand state management
│   ├── types.ts        # TypeScript interfaces
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── setupTests.ts   # Test configuration
├── public/             # Public assets
├── dist/               # Build output (generated)
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

### Environment Variables

No environment variables are required for local development. The app uses:
- **Local KJV data**: Bundled in `src/assets/kjv.json`
- **Public APIs**: Bible Research API (no auth required)

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

---

## Architecture

### High-Level Structure
```
src/
├── components/          # React components
├── utils/              # Utility functions (caching, bible utils)
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

**Navigation State**:
- `activeBook: string` - Current book name (e.g., "Genesis")
- `activeBookShort: string` - 3-letter book code (e.g., "Gen")
- `activeChapter: number` - Current chapter number
- `activeVerses: number[]` - Currently selected verse numbers
- `selectedVerses: number[]` - Verses selected for note creation (separate from activeVerses)

**Translation State**:
- `bibleVersion: string` - Bible version identifier (e.g., "KJV", "ESV")
- `translations: Translation[]` - List of available Bible translations from API
- `activeTextFilesetId: string | null` - Fileset ID for selected text version (e.g., "ENGKJV")
- `activeAudioFilesetId: string | null` - Fileset ID for selected audio version

**UI State**:
- `showAudioPlayer: boolean` - Controls audio player visibility (NOT persisted)

**Notes State**:
- `notes: Note[]` - Array of user notes with tags and verse references

### Actions (Setters)

**Navigation Actions**:
- `setActiveBook(activeBook: string)` - Sets book and resets chapter to 1, verses to []
- `setActiveBookOnly(activeBook: string)` - Sets book without resetting chapter
- `setActiveBookShort(activeBookShort: string)` - Sets 3-letter book code
- `setActiveChapter(activeChapter: number)` - Sets chapter and resets verses to []
- `setActiveVerses(activeVerses: number[])` - Sets verses and auto-scrolls to them

**Translation Actions**:
- `setBibleVersion(bibleVersion: string)` - Sets Bible version identifier
- `setTranslations(translations: Translation[])` - Updates available translations list
- `setActiveTextFilesetId(id: string | null)` - Sets text fileset ID
- `setActiveAudioFilesetId(id: string | null)` - Sets audio fileset ID

**UI Actions**:
- `setShowAudioPlayer(show: boolean)` - Toggles audio player visibility

**Notes Actions**:
- `fetchNotes()` - Async function to fetch notes from API and update state

### Auto-Scroll Behavior

When `setActiveVerses` is called, it automatically scrolls to the selected verses:

```typescript
setActiveVerses: (activeVerses) => {
  set({ activeVerses });
  activeVerses.forEach((verse) => {
    document
      .getElementById("verse-" + verse)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
```

---

## Types & Interfaces

**Location**: `src/types.ts`, `src/store.tsx`, `src/api.tsx`

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

#### `Note`
Represents a user note with associated verses.

```typescript
export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag;
  verses: {
    book: string;
    chapter: number;
    verse: number;
    text: string;
  }[];
}
```

### Translation Types (`src/store.tsx`)

#### `Fileset`
Represents a specific Bible translation format.

```typescript
export interface Fileset {
  id: string;  // e.g., "ENGKJV", "ENGESV"
  type: "text_plain" | "audio" | "audio_drama";
  size: string;  // e.g., "NT", "OT", "C" (complete)
  codec: "mp3" | "opus" | null;
  bitrate: string | null;
}
```

#### `Translation`
Represents a Bible translation with multiple filesets.

```typescript
export interface Translation {
  abbr: string;        // e.g., "KJV", "ESV"
  name: string;        // e.g., "King James Version"
  language: string;    // e.g., "English"
  language_iso: string; // e.g., "eng"
  filesets: Fileset[];
}
```

### API Types (`src/api.tsx`)

#### `KjvBook`
Represents a verse from the local KJV JSON file.

```typescript
export interface KjvBook {
  chapter: number;
  verse: number;
  text: string;
  translation_id: string;
  book_id: string;    // 3-letter code
  book_name: string;  // Full name
}
```

#### `AudioResponse`
Response from Bible Research API for audio.

```typescript
interface AudioResponse {
  book: string;
  book_name: string;
  chapter: number;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
  format: string;
}
```

#### `NoteVerse`
Verse reference for notes.

```typescript
export interface NoteVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
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

## Bible Utilities

**Location**: `src/utils/bibleUtils.ts`

This module provides constants and helper functions for working with Bible books, testaments, and their various identifiers.

### Data Structures

The file exports several pre-computed data structures for efficient lookups:

- **`BIBLE_BOOKS`**: The source of truth. An array of all 66 Bible books, each with its full name, 3-letter code, and testament ('OT' or 'NT').
  ```typescript
  interface BibleBook {
    name: string;
    code: string;
    testament: 'OT' | 'NT';
  }
  ```

- **`BOOK_NAME_TO_CODE`**: A map from a book's full name to its 3-letter code.
  - Example: `BOOK_NAME_TO_CODE['genesis']` returns `'GEN'`.

- **`BOOK_CODE_TO_TESTAMENT`**: A map from a book's 3-letter code to its testament.
  - Example: `BOOK_CODE_TO_TESTAMENT['MAT']` returns `'NT'`.

- **`OLD_TESTAMENT_BOOKS`**: A `Set` containing the 3-letter codes of all Old Testament books for fast lookups.

- **`NEW_TESTAMENT_BOOKS`**: A `Set` containing the 3-letter codes of all New Testament books.

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
- **ESV**: Bible Research API (CloudFront URLs) with dynamic `fileset_id` based on the testament (Old or New).

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

**ESV Audio `fileset_id`**:

The `getBibleAudioUrl` function now dynamically determines the `fileset_id` for ESV audio requests based on the book's testament:
- **Old Testament**: `ENGESVO1DA`
- **New Testament**: `ENGESVN1DA`

This logic is handled internally using the `getTestament` utility from `src/utils/bibleUtils.ts`.

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
- Lazy loading: notes fetched per-tag (not all at once)
- View notes with verse references
- Navigate to verse from note
- API integration for persistence
- Auto-clear selected verses after note creation
- Large modal UI (80% screen width/height) for comfortable note editing
- Multi-line textarea with word wrapping for note input

**Workflow**:
1. User selects one or more verses by clicking them
2. User clicks "Add Note" button
3. User selects a tag and enters note text
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
```

**Implementation Details**:
```typescript
// In AddTagNoteModal.tsx - Auto-clear verses after note creation
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

// In NotesView.tsx - Lazy load notes per tag
useEffect(() => {
  const loadData = async () => {
    const fetchedTags = await getTags();
    if (fetchedTags.length > 0) {
      const sorted = [...fetchedTags].sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      const firstTagId = sorted[0].id;
      setSelectedTagId(firstTagId);
      // Fetch notes only for the first tag
      await fetchNotes(firstTagId);
    }
  };
  loadData();
}, []);

// Handle tag selection change
const handleTagChange = async (value: string | null) => {
  if (value) {
    setSelectedTagId(value);
    await fetchNotes(value); // Fetch notes for selected tag
  }
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
Autocomplete filters searchData (KJV verses)
    ↓
Display matching verses (limit 7)
    ↓
User selects result
    ↓
Update Zustand store (book, chapter, verse)
    ↓
Navigate to verse
    ↓
Auto-scroll to verse
    ↓
Close modal
```

### Note Creation Flow
```
User Selects Verses (click on verses)
    ↓
Verses added to activeVerses array
    ↓
User Clicks "Add Note" button
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
Clear activeVerses (auto-clear)
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
User selects language (eng/lvs)
    ↓
Fetch translations for language
    ↓
User selects translation (e.g., ESV)
    ↓
User selects text fileset
    ↓
User selects audio fileset (or None)
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

**Total Components**: 18 files in `src/components/`

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

#### `MyNavbar.tsx`
Three-column navigation sidebar for Books → Chapters → Verses.

**Responsibilities**:
- Display all 66 Bible books in first column
- Display chapters for selected book in second column
- Display verses for selected chapter in third column
- Handle navigation clicks and update Zustand store
- Highlight active selections
- Responsive collapse on mobile (`hiddenBreakpoint="sm"`)

**Layout**:
- Fixed width: 320px (sm and lg breakpoints)
- Three ScrollArea columns with borders
- Column widths: 185px (books) | 60px (chapters) | 60px (verses)

#### `MyHeader.tsx`
Top header bar with controls.

**Responsibilities**:
- Display burger menu for mobile navbar toggle
- Show current book and chapter
- Theme toggle button
- Search button
- Translation selector button

---

### Content Display Components

#### `Passage.tsx`
Main content container that switches between Bible view and Notes view.

**Responsibilities**:
- Toggle between PassageView and NotesView
- Manage showNotes state
- Handle "View in Bible" navigation from notes
- Render SubHeader component

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

#### `SubHeader.tsx`
Sub-header with view toggle and action buttons.

**Responsibilities**:
- Toggle between Bible and Notes view
- Display Audio component
- Show "Add Note" button when verses are selected
- Display TranslationSelector

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

#### `SearchModal.tsx`
Full-screen search modal with autocomplete.

**Responsibilities**:
- Display search input with icon
- Filter KJV verses in real-time
- Show up to 7 results with verse references
- Navigate to selected verse
- Close on selection or Escape key

**Features**:
- Custom autocomplete item component showing verse text and reference
- Blur overlay background
- Keyboard accessible

#### `SearchControl.tsx`
Search button/control in header.

**Responsibilities**:
- Trigger search modal open
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

#### `NoteForm.tsx`
Form for creating/editing notes.

**Responsibilities**:
- Rich text editor (TipTap)
- Tag selection
- Verse reference display
- Form validation
- Submit handler

#### `AddTagNoteModal.tsx`
Modal for creating new notes.

**Responsibilities**:
- Display NoteForm in modal
- Handle note submission to API
- Auto-clear selected verses after successful creation
- Close modal on success or cancel

**Workflow**:
1. User selects verses
2. Clicks "Add Note" button
3. Modal opens with NoteForm
4. User enters note text and selects tag
5. Submits form
6. Note created via API
7. Selected verses cleared automatically
8. Modal closes

#### `EditNoteModal.tsx`
Modal for editing existing notes.

**Responsibilities**:
- Display NoteForm pre-filled with note data
- Handle note update to API
- Close modal on success or cancel

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
- Language selector (English, Latvian)
- Translation dropdown (searchable)
- Text fileset selection (radio buttons)
- Audio fileset selection (radio buttons, including "None")
- Save selections to Zustand store
- Display fileset details (type, size, codec)

**Features**:
- Segmented control for language switching
- Separate text and audio fileset selection
- Shows audio type (Audio vs Drama) and quality
- Cancel and Save buttons

---

### Utility Components

#### `MyLoader.tsx`
Loading spinner component.

**Responsibilities**:
- Display Mantine Loader
- Consistent loading indicator across app

**Usage**: Used in PassageView, NotesView, Audio, etc.

---

## API Integration

### Local Data

#### KJV Bible JSON
**Location**: `src/assets/kjv.json`

Contains the complete King James Version Bible text stored locally for offline access.

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
**Base URL**: `https://bibleresearchapi.vercel.app/api/v1`

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
   GET /notes/?tag_id={tag_id}  // Filter by tag
   Response: Note[]
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
     note_text: string 
   }
   Response: Note
   ```

7. **Get Tags**
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

### API Functions (`src/api.tsx`)

#### Bible Data Functions

**`getBooks()`**

Returns list of all Bible books from local KJV data.

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

**`getVersesInChapter(thebook, thechapter, filesetId)`**

Fetches verse text for a chapter. Routes to KJV local data or API based on filesetId.

```typescript
getVersesInChapter(
  thebook: string,
  thechapter: number,
  filesetId: string
): Promise<{ verse: number; text: string }[]>
```

- If `filesetId === 'ENGKJV'`: Uses local KJV JSON
- Otherwise: Fetches from Bible Research API with caching

**`getVersesInKjvChapter(thebook, thechapter)`**

Returns KJV verses from local JSON file.

```typescript
getVersesInKjvChapter(
  thebook: string,
  thechapter: number
): { verse: number; text: string }[]
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

**`getPassage()`**

Returns all book/chapter combinations for navigation.

```typescript
getPassage(): {
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
- Caches result for future use

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

**`editNote(noteId, tagId, noteText)`**

Updates an existing note.

```typescript
editNote(
  noteId: string,
  tagId: string,
  noteText: string
): Promise<Note>
```

**`getNotes()`**

Fetches all user notes from API.

```typescript
getNotes(): Promise<Note[]>
```

**`getTags()`**

Fetches all available tags from API.

```typescript
getTags(): Promise<Tag[]>
```

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

## Testing

### Testing Stack
- **Test Runner**: Vitest
- **Testing Library**: React Testing Library
- **DOM Environment**: happy-dom
- **Assertions**: Vitest assertions + jest-dom matchers

### Running Tests

```bash
# Run tests in watch mode with UI
npm run test

# Run tests once (CI mode)
npm run test:ci
```

### Test Configuration

Tests are configured in `vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["src/setupTests.ts"],
  },
});
```

### Test Setup File

The `src/setupTests.ts` file contains global test configuration:

```typescript
import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Vercel Analytics and Speed Insights to prevent
// external script loading errors in test environment
vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => null,
}));

vi.mock("@vercel/speed-insights/react", () => ({
  SpeedInsights: () => null,
}));
```

**Why mock Vercel services?**
- Prevents external script loading in test environment
- Eliminates "Cannot read properties of undefined" errors from happy-dom
- Keeps tests focused on application logic, not analytics

### Writing Tests

#### Testing Async Components

When testing components that fetch data asynchronously, use `waitFor()`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

test("should load and display verse", async () => {
  render(<App />);
  
  fireEvent.click(screen.getByTitle("nav-book-John"));
  fireEvent.click(screen.getByTitle("nav-chapter-11"));
  
  // Wait for async data to load
  await waitFor(
    () => {
      expect(
        screen.getByTitle("passage-verse-35")
      ).toHaveTextContent("Jesus wept.");
    },
    { timeout: 5000 }
  );
});
```

**Key Points**:
1. Make test functions `async`
2. Use `waitFor()` to wait for async operations
3. Set appropriate timeout (default is 1000ms)
4. Wrap assertions inside `waitFor()` callback

#### Testing User Interactions

```typescript
test("should select verse on click", async () => {
  render(<App />);
  
  const verse = screen.getByTitle("passage-verse-1");
  fireEvent.click(verse);
  
  await waitFor(() => {
    expect(verse).toHaveClass("linkActive");
  });
});
```

### Common Testing Patterns

#### 1. Testing Navigation
```typescript
fireEvent.click(screen.getByTitle("nav-book-Genesis"));
fireEvent.click(screen.getByTitle("nav-chapter-1"));
```

#### 2. Testing State Changes
```typescript
await waitFor(() => {
  expect(screen.getByText("Expected Text")).toBeInTheDocument();
});
```

#### 3. Testing API Calls
Mock API functions in your tests:
```typescript
vi.mock("../api", () => ({
  getVersesInChapter: vi.fn(() => 
    Promise.resolve([{ verse: 1, text: "Test" }])
  ),
}));
```

### Troubleshooting Tests

#### React `act()` Warnings
If you see warnings about updates not wrapped in `act()`:
- Ensure you're using `waitFor()` for async operations
- Make sure all state updates complete before test ends
- Use `async/await` properly

#### Element Not Found Errors
- Check that you're waiting for async data to load
- Verify the element's `title` or `data-testid` attribute
- Use `screen.debug()` to see current DOM state

#### Timeout Errors
- Increase timeout in `waitFor()` options
- Check if API mocks are returning data
- Verify network requests aren't actually being made

### Best Practices

1. **Test User Behavior**: Focus on what users see and do
2. **Avoid Implementation Details**: Don't test internal state directly
3. **Use Semantic Queries**: Prefer `getByTitle`, `getByRole`, `getByText`
4. **Wait for Async**: Always use `waitFor()` for async operations
5. **Mock External Services**: Mock APIs, analytics, and third-party services
6. **Keep Tests Isolated**: Each test should be independent
7. **Clean Up**: Tests should not affect each other

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
    title: `${activeBook} ${activeChapter}`,
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

**Fallback**: If Media Session API is not available, audio still works with on-screen controls.

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

1. **Audio Autoplay**: Most browsers block autoplay. User must click play button.
2. **localStorage Limits**: ~5-10MB per domain (sufficient for our caching needs)
3. **Offline Mode**: Only KJV is available offline. Other translations require internet.

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
- **Key**: `{filesetId}:{book}:{chapter}:{verse}`
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
- **Main bundle**: ~500KB (gzipped)
- **KJV JSON**: ~4.5MB (loaded separately)
- **Mantine UI**: ~200KB (tree-shaken)
- **Howler.js**: ~20KB

**Optimizations**:
- Tree-shaking enabled (Vite)
- Code splitting (React.lazy could be added)
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
}, [activeBook, activeChapter, activeAudioFilesetId]);
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
1. **Code Splitting**: Lazy load Notes components
2. **Virtual Scrolling**: For long chapters (e.g., Psalms 119)
3. **Service Worker**: For true offline support
4. **Image Optimization**: If images are added
5. **Debounced Search**: Already implemented in SearchModal

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
