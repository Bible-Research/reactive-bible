# Routing Implementation Plan v2.0 - Enhanced Notes Integration

## Executive Summary

This document expands upon the original routing plan to include 
comprehensive integration with the Bible Research API's Notes and Tags 
endpoints. After analyzing the API schema at 
`https://bibleresearchapi.vercel.app/api/v1/docs/`, this plan now 
includes detailed routes for individual notes, tags, public notes, and 
advanced filtering capabilities.

**Key Additions:**
- Individual note detail pages with shareable URLs
- Tag detail pages showing all notes for a tag
- Public notes browsing (unauthenticated access)
- Search/filter routes for notes
- Tag hierarchy navigation
- Note editing/creation flows with proper routing

---

## 1. API Endpoints Analysis

### 1.1 Available Notes Endpoints

Based on the OpenAPI schema, the backend provides:

| Endpoint | Method | Purpose | Query Params |
|----------|--------|---------|--------------|
| `/api/v1/notes/` | GET | List all notes | `tag_id`, `public` |
| `/api/v1/notes/` | POST | Create new note | - |
| `/api/v1/notes/{id}/` | GET | Get single note | - |
| `/api/v1/notes/{id}/` | PUT/PATCH | Update note | - |
| `/api/v1/notes/{id}/` | DELETE | Delete note | - |
| `/api/v1/tags/` | GET | List all tags | - |
| `/api/v1/tags/` | POST | Create new tag | - |
| `/api/v1/tags/{id}/` | GET | Get single tag | - |
| `/api/v1/tags/{id}/` | PUT/PATCH | Update tag | - |
| `/api/v1/tags/{id}/` | DELETE | Delete tag | - |

### 1.2 Data Models

**Note Schema:**
```typescript
interface Note {
  id: string;                    // UUID
  note_text: string;             // Rich text content
  public: boolean;               // Public visibility
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  tag: Tag;                      // Full tag object
  verses: Verse[];               // Array of verse references
}

interface Verse {
  book: string;                  // e.g., "John"
  chapter: number;               // e.g., 3
  verse: number;                 // e.g., 16
  text: string;                  // Verse text
}
```

**Tag Schema:**
```typescript
interface Tag {
  id: string;                    // UUID
  name: string;                  // Tag name (max 100 chars)
  parent_tag: string | null;     // Parent tag UUID (hierarchy)
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
}
```

### 1.3 Current Frontend Implementation

**Existing API Functions (src/api.tsx):**
- ✅ `getNotes(tagId?: string)` - Fetch notes by tag
- ✅ `getTags()` - Fetch all tags
- ✅ `addTagNote()` - Create new note
- ✅ `editNote()` - Update existing note
- ✅ `deleteNote()` - Delete note

**Missing API Functions:**
- ❌ `getNote(noteId: string)` - Fetch single note by ID
- ❌ `getTag(tagId: string)` - Fetch single tag by ID
- ❌ `getPublicNotes()` - Fetch public notes
- ❌ `createTag()` - Create new tag
- ❌ `updateTag()` - Update tag
- ❌ `deleteTag()` - Delete tag

---

## 2. Enhanced Route Mapping

### 2.1 Core Routes (from v1.0)

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Redirect | Redirect to `/bible` |
| `/bible` | `BibleRoute` | Default Bible reading view |
| `/bible/:book/:chapter` | `BibleRoute` | Specific chapter |
| `/bible/:book/:chapter/:verse` | `BibleRoute` | Specific verse |

### 2.2 NEW: Notes Routes (Enhanced)

| Route | Component | Description | Auth Required |
|-------|-----------|-------------|---------------|
| `/notes` | `NotesListRoute` | All notes (grouped by tags) | Yes |
| `/notes/public` | `PublicNotesRoute` | Browse public notes | No |
| `/notes/tag/:tagId` | `TagNotesRoute` | Notes for specific tag | Yes |
| `/notes/:noteId` | `NoteDetailRoute` | Single note detail view | Conditional* |
| `/notes/:noteId/edit` | `NoteEditRoute` | Edit existing note | Yes |
| `/notes/new` | `NoteCreateRoute` | Create new note | Yes |

*Public notes viewable by anyone, private notes require auth

### 2.3 NEW: Tags Routes

| Route | Component | Description | Auth Required |
|-------|-----------|-------------|---------------|
| `/tags` | `TagsListRoute` | All tags with hierarchy | Yes |
| `/tags/:tagId` | `TagDetailRoute` | Tag details + notes | Yes |
| `/tags/:tagId/edit` | `TagEditRoute` | Edit tag | Yes |
| `/tags/new` | `TagCreateRoute` | Create new tag | Yes |

### 2.4 NEW: Search & Filter Routes

| Route | Component | Description | Query Params |
|-------|-----------|-------------|--------------|
| `/search` | `SearchRoute` | Unified search | `q`, `type` |
| `/notes/search` | `NotesSearchRoute` | Search notes | `q`, `tag`, `verse` |

### 2.5 Future Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/settings` | `SettingsRoute` | User preferences |
| `/settings/translations` | `TranslationsRoute` | Manage translations |
| `/settings/account` | `AccountRoute` | Account settings |
| `/about` | `AboutRoute` | About page |
| `/help` | `HelpRoute` | Help documentation |

---

## 3. URL Examples & Use Cases

### 3.1 Bible Reading URLs

```
# Default view
https://reactive-bible.app/

# Specific passage
https://reactive-bible.app/bible/John/3
https://reactive-bible.app/bible/John/3/16

# With query params (future)
https://reactive-bible.app/bible/John/3?translation=ESV
https://reactive-bible.app/bible/John/3?highlight=16,17
```

### 3.2 Notes URLs

```
# All notes (requires auth)
https://reactive-bible.app/notes

# Public notes (no auth)
https://reactive-bible.app/notes/public

# Notes by tag
https://reactive-bible.app/notes/tag/abc-123-uuid

# Single note detail
https://reactive-bible.app/notes/def-456-uuid

# Edit note
https://reactive-bible.app/notes/def-456-uuid/edit

# Create new note (with context from current verse)
https://reactive-bible.app/notes/new?book=John&chapter=3&verse=16

# Create note for specific tag
https://reactive-bible.app/notes/new?tag=abc-123-uuid
```

### 3.3 Tags URLs

```
# All tags
https://reactive-bible.app/tags

# Tag detail (shows notes for this tag)
https://reactive-bible.app/tags/abc-123-uuid

# Edit tag
https://reactive-bible.app/tags/abc-123-uuid/edit

# Create new tag
https://reactive-bible.app/tags/new

# Create child tag
https://reactive-bible.app/tags/new?parent=abc-123-uuid
```

### 3.4 Search URLs

```
# Unified search
https://reactive-bible.app/search?q=faith

# Search notes only
https://reactive-bible.app/notes/search?q=grace

# Search notes by tag
https://reactive-bible.app/notes/search?tag=abc-123-uuid&q=love

# Search notes by verse reference
https://reactive-bible.app/notes/search?verse=John+3:16
```

---

## 4. Component Architecture

### 4.1 New Components to Create

#### Notes Components

**`src/routes/NotesListRoute.tsx`**
- Lists all notes grouped by tags
- Replaces current `NotesView` conditional rendering
- Includes tag filter dropdown
- Shows note count per tag

**`src/routes/NoteDetailRoute.tsx`** (NEW)
- Displays single note with full details
- Shows all linked verses with context
- Edit/Delete actions (if owner)
- Share button (generates shareable link)
- "View in Bible" button for each verse

**`src/routes/NoteEditRoute.tsx`** (NEW)
- Form to edit existing note
- Pre-populated with current note data
- Tag selector
- Verse reference manager (add/remove verses)
- Rich text editor for note content
- Save/Cancel actions

**`src/routes/NoteCreateRoute.tsx`** (NEW)
- Form to create new note
- Auto-populate verse from query params
- Tag selector (create new tag inline)
- Verse reference manager
- Rich text editor
- Save/Cancel actions

**`src/routes/PublicNotesRoute.tsx`** (NEW)
- Browse public notes (no auth required)
- Filter by tag, book, date
- Pagination support
- "View in Bible" for each note

#### Tags Components

**`src/routes/TagsListRoute.tsx`** (NEW)
- Hierarchical tag tree view
- Expand/collapse parent tags
- Note count per tag
- Create/Edit/Delete actions
- Drag-and-drop to reorganize (future)

**`src/routes/TagDetailRoute.tsx`** (NEW)
- Tag metadata (name, parent, dates)
- List of all notes with this tag
- Edit/Delete tag actions
- Merge tag functionality (future)

**`src/routes/TagEditRoute.tsx`** (NEW)
- Form to edit tag name
- Parent tag selector (for hierarchy)
- Save/Cancel actions

**`src/routes/TagCreateRoute.tsx`** (NEW)
- Form to create new tag
- Parent tag selector (optional)
- Save/Cancel actions

#### Search Components

**`src/routes/NotesSearchRoute.tsx`** (NEW)
- Search input with filters
- Results list with highlighting
- Filter by tag, date range, verse reference
- Sort by relevance, date, book order

### 4.2 Component Hierarchy

```
App.tsx
└── RouterProvider
    └── RootLayout.tsx (AppShell)
        ├── MyHeader
        ├── MyNavbar
        └── Outlet
            ├── BibleRoute
            │   └── PassageView
            ├── NotesListRoute
            │   └── NotesView (refactored)
            ├── NoteDetailRoute (NEW)
            │   ├── NoteCard (enhanced)
            │   └── VerseList
            ├── NoteEditRoute (NEW)
            │   └── NoteForm
            ├── NoteCreateRoute (NEW)
            │   └── NoteForm
            ├── PublicNotesRoute (NEW)
            │   └── PublicNotesList
            ├── TagsListRoute (NEW)
            │   └── TagTree
            ├── TagDetailRoute (NEW)
            │   ├── TagInfo
            │   └── NotesList
            ├── TagEditRoute (NEW)
            │   └── TagForm
            ├── TagCreateRoute (NEW)
            │   └── TagForm
            └── NotesSearchRoute (NEW)
                └── SearchResults
```

---

## 5. Enhanced API Functions

### 5.1 New API Functions to Implement

Add to `src/api.tsx`:

```typescript
// ============================================
// SINGLE NOTE OPERATIONS
// ============================================

/**
 * Fetch a single note by ID
 * @param noteId - UUID of the note
 * @returns Promise<Note>
 */
export const getNote = async (noteId: string): Promise<Note> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/notes/${noteId}/`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Note not found');
    }
    throw new Error('Failed to fetch note');
  }
  return await response.json();
};

/**
 * Update a note (full update)
 * @param noteId - UUID of the note
 * @param data - Updated note data
 * @returns Promise<Note>
 */
export const updateNote = async (
  noteId: string,
  data: {
    tag: string;
    note_text: string;
    public?: boolean;
    verse_references?: { book: string; chapter: number; verse: number }[];
  }
): Promise<Note> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/notes/${noteId}/`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update note');
  return await response.json();
};

// ============================================
// PUBLIC NOTES
// ============================================

/**
 * Fetch public notes (no authentication required)
 * @returns Promise<Note[]>
 */
export const getPublicNotes = async (): Promise<Note[]> => {
  const url = 'https://bibleresearchapi.vercel.app/api/v1/notes/?public=true';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch public notes');
  return await response.json();
};

// ============================================
// TAG OPERATIONS
// ============================================

/**
 * Fetch a single tag by ID
 * @param tagId - UUID of the tag
 * @returns Promise<Tag>
 */
export const getTag = async (tagId: string): Promise<Tag> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/tags/${tagId}/`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Tag not found');
    }
    throw new Error('Failed to fetch tag');
  }
  return await response.json();
};

/**
 * Create a new tag
 * @param name - Tag name
 * @param parentTagId - Optional parent tag UUID
 * @returns Promise<Tag>
 */
export const createTag = async (
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const url = 'https://bibleresearchapi.vercel.app/api/v1/tags/';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_tag: parentTagId }),
  });
  if (!response.ok) throw new Error('Failed to create tag');
  return await response.json();
};

/**
 * Update a tag
 * @param tagId - UUID of the tag
 * @param name - New tag name
 * @param parentTagId - Optional parent tag UUID
 * @returns Promise<Tag>
 */
export const updateTag = async (
  tagId: string,
  name: string,
  parentTagId?: string | null
): Promise<Tag> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/tags/${tagId}/`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_tag: parentTagId }),
  });
  if (!response.ok) throw new Error('Failed to update tag');
  return await response.json();
};

/**
 * Delete a tag
 * @param tagId - UUID of the tag
 * @returns Promise<void>
 */
export const deleteTag = async (tagId: string): Promise<void> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/tags/${tagId}/`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete tag');
};

// ============================================
// SEARCH OPERATIONS
// ============================================

/**
 * Search notes by text query
 * @param query - Search query string
 * @param tagId - Optional tag filter
 * @returns Promise<Note[]>
 */
export const searchNotes = async (
  query: string,
  tagId?: string
): Promise<Note[]> => {
  // Note: Backend doesn't have search endpoint yet
  // This is a client-side implementation
  const notes = await getNotes(tagId);
  const lowerQuery = query.toLowerCase();
  return notes.filter(
    (note) =>
      note.note_text.toLowerCase().includes(lowerQuery) ||
      note.tag.name.toLowerCase().includes(lowerQuery) ||
      note.verses.some(
        (v) =>
          v.book.toLowerCase().includes(lowerQuery) ||
          v.text.toLowerCase().includes(lowerQuery)
      )
  );
};
```

### 5.2 Enhanced Zustand Store

Update `src/store.tsx` to include:

```typescript
interface BibleState {
  // ... existing state ...
  
  // NEW: Current note state
  currentNote: Note | null;
  setCurrentNote: (note: Note | null) => void;
  
  // NEW: Current tag state
  currentTag: Tag | null;
  setCurrentTag: (tag: Tag | null) => void;
  
  // NEW: Tags list
  tags: Tag[];
  setTags: (tags: Tag[]) => void;
  fetchTags: () => Promise<void>;
  
  // ENHANCED: Notes operations
  fetchNote: (noteId: string) => Promise<void>;
  createNote: (
    tagId: string,
    noteText: string,
    verseRefs: { book: string; chapter: number; verse: number }[]
  ) => Promise<Note>;
  updateNote: (
    noteId: string,
    tagId: string,
    noteText: string
  ) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  
  // NEW: Tag operations
  fetchTag: (tagId: string) => Promise<void>;
  createTag: (name: string, parentTagId?: string) => Promise<Tag>;
  updateTag: (
    tagId: string,
    name: string,
    parentTagId?: string
  ) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
}
```

---

## 6. Detailed Route Implementation

### 6.1 NoteDetailRoute.tsx

```typescript
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Box,
  Paper,
  Text,
  Title,
  Badge,
  Group,
  Button,
  Stack,
  Divider,
  ActionIcon,
  Loader,
  Center,
} from "@mantine/core";
import {
  IconEdit,
  IconTrash,
  IconShare,
  IconExternalLink,
} from "@tabler/icons-react";
import { useBibleStore } from "../store";
import { getNote, deleteNote } from "../api";
import { Note } from "../types";

export default function NoteDetailRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;

    const loadNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedNote = await getNote(noteId);
        setNote(fetchedNote);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load note"
        );
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [noteId]);

  const handleDelete = async () => {
    if (!noteId || !confirm("Delete this note?")) return;
    
    try {
      await deleteNote(noteId);
      navigate("/notes");
    } catch (err) {
      alert("Failed to delete note");
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  };

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(`/bible/${book}/${chapter}/${verse}`);
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error || !note) {
    return (
      <Center h="80vh">
        <Stack align="center">
          <Text color="red">{error || "Note not found"}</Text>
          <Button onClick={() => navigate("/notes")}>
            Back to Notes
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Paper shadow="sm" p="lg">
        {/* Header */}
        <Group position="apart" mb="md">
          <Group>
            <Badge>{note.tag.name}</Badge>
            {note.public && <Badge color="green">Public</Badge>}
          </Group>
          <Group>
            <ActionIcon onClick={handleShare} title="Share">
              <IconShare size={18} />
            </ActionIcon>
            <ActionIcon
              onClick={() => navigate(`/notes/${noteId}/edit`)}
              title="Edit"
            >
              <IconEdit size={18} />
            </ActionIcon>
            <ActionIcon
              onClick={handleDelete}
              color="red"
              title="Delete"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Divider mb="md" />

        {/* Note Content */}
        <Box mb="xl">
          <Text style={{ whiteSpace: "pre-wrap" }}>
            {note.note_text}
          </Text>
        </Box>

        <Divider mb="md" />

        {/* Verse References */}
        <Title order={4} mb="sm">
          Verse References
        </Title>
        <Stack spacing="sm">
          {note.verses.map((verse, idx) => (
            <Paper key={idx} p="sm" withBorder>
              <Group position="apart">
                <Box>
                  <Text weight={500}>
                    {verse.book} {verse.chapter}:{verse.verse}
                  </Text>
                  <Text size="sm" color="dimmed">
                    {verse.text}
                  </Text>
                </Box>
                <ActionIcon
                  onClick={() =>
                    handleViewInBible(
                      verse.book,
                      verse.chapter,
                      verse.verse
                    )
                  }
                  title="View in Bible"
                >
                  <IconExternalLink size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>

        {/* Metadata */}
        <Box mt="xl">
          <Text size="xs" color="dimmed">
            Created: {new Date(note.created_at).toLocaleString()}
          </Text>
          <Text size="xs" color="dimmed">
            Updated: {new Date(note.updated_at).toLocaleString()}
          </Text>
        </Box>
      </Paper>

      {/* Back Button */}
      <Group position="center" mt="md">
        <Button variant="subtle" onClick={() => navigate("/notes")}>
          Back to Notes
        </Button>
      </Group>
    </Box>
  );
}
```

### 6.2 Updated App.tsx with All Routes

```typescript
import {
  MantineProvider,
  ColorSchemeProvider,
  ColorScheme,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { clearExpiredAudioUrls } from "./utils/cacheManager";

// Layouts
import RootLayout from "./routes/RootLayout";
import ErrorPage from "./routes/ErrorPage";

// Bible Routes
import BibleRoute from "./routes/BibleRoute";

// Notes Routes
import NotesListRoute from "./routes/NotesListRoute";
import NoteDetailRoute from "./routes/NoteDetailRoute";
import NoteEditRoute from "./routes/NoteEditRoute";
import NoteCreateRoute from "./routes/NoteCreateRoute";
import PublicNotesRoute from "./routes/PublicNotesRoute";

// Tags Routes
import TagsListRoute from "./routes/TagsListRoute";
import TagDetailRoute from "./routes/TagDetailRoute";
import TagEditRoute from "./routes/TagEditRoute";
import TagCreateRoute from "./routes/TagCreateRoute";

// Search Routes
import NotesSearchRoute from "./routes/NotesSearchRoute";

// Define routes
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/bible" replace />,
      },
      
      // Bible Routes
      {
        path: "bible",
        element: <BibleRoute />,
      },
      {
        path: "bible/:book/:chapter",
        element: <BibleRoute />,
      },
      {
        path: "bible/:book/:chapter/:verse",
        element: <BibleRoute />,
      },
      
      // Notes Routes
      {
        path: "notes",
        element: <NotesListRoute />,
      },
      {
        path: "notes/public",
        element: <PublicNotesRoute />,
      },
      {
        path: "notes/new",
        element: <NoteCreateRoute />,
      },
      {
        path: "notes/search",
        element: <NotesSearchRoute />,
      },
      {
        path: "notes/tag/:tagId",
        element: <NotesListRoute />, // Reuse with tagId param
      },
      {
        path: "notes/:noteId",
        element: <NoteDetailRoute />,
      },
      {
        path: "notes/:noteId/edit",
        element: <NoteEditRoute />,
      },
      
      // Tags Routes
      {
        path: "tags",
        element: <TagsListRoute />,
      },
      {
        path: "tags/new",
        element: <TagCreateRoute />,
      },
      {
        path: "tags/:tagId",
        element: <TagDetailRoute />,
      },
      {
        path: "tags/:tagId/edit",
        element: <TagEditRoute />,
      },
    ],
  },
]);

export default function App() {
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });

  const toggleColorScheme = () =>
    setColorScheme((current) => 
      (current === "dark" ? "light" : "dark")
    );

  useEffect(() => {
    clearExpiredAudioUrls();
  }, []);

  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
    >
      <MantineProvider
        theme={{ colorScheme }}
        withGlobalStyles
        withNormalizeCSS
      >
        <RouterProvider router={router} />
        <Analytics />
        <SpeedInsights />
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
```

---

## 7. Navigation Updates

### 7.1 Update SubHeader.tsx

Replace the "Notes" toggle button with proper navigation:

```typescript
// OLD: State-based toggle
<Button
  variant="transparent"
  onClick={() => setShowNotes(!showNotes)}
>
  {showNotes ? "Bible" : "Notes"}
</Button>

// NEW: Route-based navigation
import { useLocation, useNavigate } from "react-router-dom";

const location = useLocation();
const navigate = useNavigate();
const isNotesView = location.pathname.startsWith("/notes");

<Button
  variant="transparent"
  onClick={() => navigate(isNotesView ? "/bible" : "/notes")}
>
  {isNotesView ? "Bible" : "Notes"}
</Button>
```

### 7.2 Update MyNavbar.tsx

Replace anchor tags with React Router Links:

```typescript
// OLD: Anchor with preventDefault
<a
  className={cx(classes.link, {
    [classes.linkActive]: activeBook === book.book_name,
  })}
  href="/"
  onClick={(event) => {
    event.preventDefault();
    setActiveBook(book.book_name);
    setActiveBookShort(book.book_id);
  }}
  key={book.book_id}
>
  {book.book_name}
</a>

// NEW: React Router Link
import { Link } from "react-router-dom";

<Link
  className={cx(classes.link, {
    [classes.linkActive]: activeBook === book.book_name,
  })}
  to={`/bible/${book.book_id}/${activeChapter}`}
  key={book.book_id}
>
  {book.book_name}
</Link>
```

### 7.3 Add Notes Navigation to MyHeader

Add a notes icon/button to the header for quick access:

```typescript
import { IconNotes } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

// In MyHeader component
const navigate = useNavigate();

<ActionIcon
  variant="transparent"
  onClick={() => navigate("/notes")}
  title="Notes"
>
  <IconNotes size={20} />
</ActionIcon>
```

---

## 8. Enhanced Features

### 8.1 Deep Linking from Bible to Notes

When viewing a verse, show notes associated with it:

```typescript
// In Verse.tsx component
import { useEffect, useState } from "react";
import { Badge, Popover } from "@mantine/core";
import { getNotes } from "../api";

const [notesCount, setNotesCount] = useState(0);

useEffect(() => {
  // Fetch notes for this verse
  getNotes().then((notes) => {
    const count = notes.filter((note) =>
      note.verses.some(
        (v) =>
          v.book === book &&
          v.chapter === chapter &&
          v.verse === verse
      )
    ).length;
    setNotesCount(count);
  });
}, [book, chapter, verse]);

// Show badge if notes exist
{notesCount > 0 && (
  <Popover>
    <Popover.Target>
      <Badge size="xs">{notesCount} notes</Badge>
    </Popover.Target>
    <Popover.Dropdown>
      <Link to={`/notes/search?verse=${book}+${chapter}:${verse}`}>
        View notes for this verse
      </Link>
    </Popover.Dropdown>
  </Popover>
)}
```

### 8.2 Note Context Menu

Right-click on a verse to create a note:

```typescript
// In Verse.tsx
const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(
    `/notes/new?book=${book}&chapter=${chapter}&verse=${verse}`
  );
};

<Box onContextMenu={handleContextMenu}>
  {/* Verse content */}
</Box>
```

### 8.3 Tag Hierarchy Breadcrumbs

Show tag hierarchy in note detail view:

```typescript
// In NoteDetailRoute.tsx
const getTagBreadcrumbs = (tag: Tag, allTags: Tag[]): Tag[] => {
  const breadcrumbs: Tag[] = [tag];
  let current = tag;
  
  while (current.parent_tag) {
    const parent = allTags.find((t) => t.id === current.parent_tag);
    if (!parent) break;
    breadcrumbs.unshift(parent);
    current = parent;
  }
  
  return breadcrumbs;
};

// Render breadcrumbs
<Group spacing={4}>
  {breadcrumbs.map((tag, idx) => (
    <React.Fragment key={tag.id}>
      <Link to={`/tags/${tag.id}`}>{tag.name}</Link>
      {idx < breadcrumbs.length - 1 && <Text>/</Text>}
    </React.Fragment>
  ))}
</Group>
```

### 8.4 Notes Caching Integration

Integrate with the notes caching plan from memory:

```typescript
// In src/utils/cacheManager.ts

/**
 * Cache notes by tag ID
 */
export const cacheNotes = (
  tagId: string,
  notes: Note[]
): void => {
  const key = `notes:${tagId}`;
  const data = {
    notes,
    timestamp: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));
};

/**
 * Get cached notes by tag ID
 */
export const getCachedNotes = (
  tagId: string
): Note[] | null => {
  const key = `notes:${tagId}`;
  const cached = localStorage.getItem(key);
  
  if (!cached) return null;
  
  const data = JSON.parse(cached);
  const age = Date.now() - data.timestamp;
  
  // Cache expires after 5 minutes
  if (age > 5 * 60 * 1000) {
    localStorage.removeItem(key);
    return null;
  }
  
  return data.notes;
};

/**
 * Invalidate notes cache for a tag
 */
export const invalidateNotesCache = (tagId: string): void => {
  const key = `notes:${tagId}`;
  localStorage.removeItem(key);
};

/**
 * Invalidate all notes caches
 */
export const invalidateAllNotesCache = (): void => {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("notes:"))
    .forEach((key) => localStorage.removeItem(key));
};
```

---

## 9. Implementation Timeline

### Phase 1: Core Routing (4 hours)
- Install react-router-dom
- Create RootLayout
- Implement BibleRoute with URL params
- Update navigation components (MyNavbar, SubHeader)
- Test basic routing

### Phase 2: Notes List & Detail (3 hours)
- Create NotesListRoute (refactor existing NotesView)
- Create NoteDetailRoute (NEW)
- Implement getNote() API function
- Add navigation between list and detail
- Test note viewing

### Phase 3: Note CRUD Operations (4 hours)
- Create NoteCreateRoute (NEW)
- Create NoteEditRoute (NEW)
- Implement updateNote() API function
- Add form validation
- Test create/edit/delete flows

### Phase 4: Tags Management (3 hours)
- Create TagsListRoute (NEW)
- Create TagDetailRoute (NEW)
- Create TagEditRoute & TagCreateRoute (NEW)
- Implement tag API functions
- Test tag CRUD operations

### Phase 5: Public Notes & Search (2 hours)
- Create PublicNotesRoute (NEW)
- Create NotesSearchRoute (NEW)
- Implement getPublicNotes() API function
- Implement searchNotes() function
- Test public access and search

### Phase 6: Enhanced Features (3 hours)
- Add notes badges to verses
- Implement context menu for note creation
- Add tag hierarchy breadcrumbs
- Integrate notes caching
- Add share functionality

### Phase 7: Testing & Polish (3 hours)
- Update all existing tests
- Add new tests for routes
- Fix any bugs
- Performance optimization
- Documentation updates

**Total Estimated Time: 22 hours** (spread over 1-2 weeks)

---

## 10. Success Metrics

### 10.1 Functional Metrics

- [ ] All routes accessible via URL
- [ ] Browser back/forward works correctly
- [ ] Deep linking works for all resources
- [ ] Note CRUD operations work via routes
- [ ] Tag CRUD operations work via routes
- [ ] Public notes accessible without auth
- [ ] Search returns relevant results
- [ ] Notes caching reduces API calls by 70%+

### 10.2 Performance Metrics

- [ ] Initial page load < 2s
- [ ] Route transitions < 200ms
- [ ] Note detail load < 500ms
- [ ] Search results < 1s
- [ ] Bundle size increase < 20KB gzipped

### 10.3 UX Metrics

- [ ] Shareable URLs work correctly
- [ ] Navigation feels intuitive
- [ ] No broken links
- [ ] Error states handled gracefully
- [ ] Loading states shown appropriately

---

## 11. Migration Checklist

### Pre-Implementation

- [ ] Review this plan with team
- [ ] Create feature branch: `feature/routing-v2`
- [ ] Backup current codebase
- [ ] Set up feature flag for routing

### Phase 1: Setup

- [ ] Install react-router-dom@^6.22.0
- [ ] Create routes directory structure
- [ ] Create RootLayout component
- [ ] Update App.tsx with router

### Phase 2: Bible Routes

- [ ] Create BibleRoute component
- [ ] Implement URL param parsing
- [ ] Update MyNavbar with Links
- [ ] Update SubHeader navigation
- [ ] Test Bible navigation

### Phase 3: Notes Routes

- [ ] Create NotesListRoute
- [ ] Create NoteDetailRoute
- [ ] Create NoteEditRoute
- [ ] Create NoteCreateRoute
- [ ] Implement new API functions
- [ ] Test notes flows

### Phase 4: Tags Routes

- [ ] Create TagsListRoute
- [ ] Create TagDetailRoute
- [ ] Create TagEditRoute
- [ ] Create TagCreateRoute
- [ ] Implement tag API functions
- [ ] Test tags flows

### Phase 5: Advanced Features

- [ ] Create PublicNotesRoute
- [ ] Create NotesSearchRoute
- [ ] Add verse-to-notes linking
- [ ] Add context menu
- [ ] Integrate caching

### Phase 6: Testing

- [ ] Update test helpers
- [ ] Update existing tests
- [ ] Add new route tests
- [ ] Manual testing
- [ ] Performance testing

### Phase 7: Deployment

- [ ] Update documentation
- [ ] Deploy behind feature flag
- [ ] Monitor for errors
- [ ] Gather user feedback
- [ ] Remove feature flag
- [ ] Clean up old code

---

## 12. Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing tests | HIGH | HIGH | Update test helpers first |
| URL/Store sync bugs | HIGH | MEDIUM | Careful dependency management |
| Performance regression | MEDIUM | LOW | Lazy loading, memoization |
| API rate limiting | MEDIUM | LOW | Implement caching |
| Authentication issues | HIGH | MEDIUM | Handle 401/403 gracefully |
| Deep link sharing fails | MEDIUM | LOW | Test thoroughly |
| Tag hierarchy complexity | MEDIUM | MEDIUM | Start simple, iterate |

---

## 13. Future Enhancements

### 13.1 Short-term (1-3 months)

- [ ] Offline support with service workers
- [ ] Note versioning/history
- [ ] Tag merging functionality
- [ ] Advanced search filters
- [ ] Export notes to PDF/Markdown

### 13.2 Medium-term (3-6 months)

- [ ] Collaborative notes (sharing with users)
- [ ] Note templates
- [ ] Rich text editor with formatting
- [ ] Verse highlighting in notes
- [ ] Mobile app with deep linking

### 13.3 Long-term (6-12 months)

- [ ] AI-powered note suggestions
- [ ] Cross-reference detection
- [ ] Study plan creation
- [ ] Social features (follow users, like notes)
- [ ] API for third-party integrations

---

## Appendix A: Complete Route Table

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/` | Redirect | No | → `/bible` |
| `/bible` | BibleRoute | No | Default Bible view |
| `/bible/:book/:chapter` | BibleRoute | No | Specific chapter |
| `/bible/:book/:chapter/:verse` | BibleRoute | No | Specific verse |
| `/notes` | NotesListRoute | Yes | All notes |
| `/notes/public` | PublicNotesRoute | No | Public notes |
| `/notes/new` | NoteCreateRoute | Yes | Create note |
| `/notes/search` | NotesSearchRoute | Yes | Search notes |
| `/notes/tag/:tagId` | NotesListRoute | Yes | Notes by tag |
| `/notes/:noteId` | NoteDetailRoute | Conditional | Note detail |
| `/notes/:noteId/edit` | NoteEditRoute | Yes | Edit note |
| `/tags` | TagsListRoute | Yes | All tags |
| `/tags/new` | TagCreateRoute | Yes | Create tag |
| `/tags/:tagId` | TagDetailRoute | Yes | Tag detail |
| `/tags/:tagId/edit` | TagEditRoute | Yes | Edit tag |

---

## Appendix B: API Endpoints Summary

| Frontend Function | Backend Endpoint | Method | Purpose |
|-------------------|------------------|--------|---------|
| `getNotes(tagId?)` | `/api/v1/notes/` | GET | List notes |
| `getNote(id)` | `/api/v1/notes/{id}/` | GET | Get note |
| `addTagNote()` | `/api/v1/notes/` | POST | Create note |
| `updateNote()` | `/api/v1/notes/{id}/` | PUT | Update note |
| `deleteNote(id)` | `/api/v1/notes/{id}/` | DELETE | Delete note |
| `getTags()` | `/api/v1/tags/` | GET | List tags |
| `getTag(id)` | `/api/v1/tags/{id}/` | GET | Get tag |
| `createTag()` | `/api/v1/tags/` | POST | Create tag |
| `updateTag()` | `/api/v1/tags/{id}/` | PUT | Update tag |
| `deleteTag(id)` | `/api/v1/tags/{id}/` | DELETE | Delete tag |
| `getPublicNotes()` | `/api/v1/notes/?public=true` | GET | Public notes |

---

**Document Version**: 2.0  
**Last Updated**: 2026-02-01  
**Author**: Cascade AI  
**Status**: Ready for Implementation  
**Supersedes**: ROUTING_IMPLEMENTATION_PLAN.md v1.0
