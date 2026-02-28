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
