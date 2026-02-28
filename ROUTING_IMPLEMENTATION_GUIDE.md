# Client-Side Routing Implementation Guide for AI Agents

## Overview

This guide provides step-by-step instructions for implementing client-side routing in the reactive-bible application. The app currently has NO routing library installed - it's a single-page application with state management via Zustand.

## Current Architecture Analysis

### Tech Stack
- **Frontend**: React 18.2 + TypeScript
- **UI Library**: Mantine v6
- **State Management**: Zustand with localStorage persistence
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library + MSW
- **No Router**: Currently no routing library installed

### Current State Management (store.tsx)
```typescript
interface BibleState {
  activeBook: string;           // e.g., "John"
  activeBookShort: string;       // e.g., "Joh"
  activeChapter: number;         // e.g., 1
  activeVerses: number[];        // e.g., [16]
  bibleVersion: string;          // e.g., "KJV"
  tags: Tag[];
  notes: Note[];
  // ... other fields
}
```

### Current Components Structure
```
src/
├── App.tsx                    # Main app shell (no routing)
├── main.tsx                   # Entry point
├── store.tsx                  # Zustand store
├── api.tsx                    # API functions
├── types.ts                   # Type definitions
└── components/
    ├── Passage.tsx            # Main Bible reading view
    ├── NotesView.tsx          # Notes display
    ├── BibleSelector.tsx      # Book/chapter navigation
    ├── SubHeader.tsx          # Chapter navigation
    └── ... (30+ components)
```

---

## Implementation Plan

### Phase 1: Setup & Dependencies (1-2 hours)

#### Step 1.1: Install React Router
```bash
npm install react-router-dom@6
npm install --save-dev @types/react-router-dom
```

**Verification**: Check `package.json` for:
- `"react-router-dom": "^6.x.x"` in dependencies
- `"@types/react-router-dom": "^6.x.x"` in devDependencies

#### Step 1.2: Create Routes Directory Structure
Create the following directory structure:
```
src/
└── routes/
    ├── index.tsx              # Route configuration
    ├── BibleRoute.tsx         # Bible reading route
    ├── NotesListRoute.tsx     # All notes view
    ├── NoteDetailRoute.tsx    # Single note view
    └── ErrorRoute.tsx         # 404 page
```

**Files to create**:
1. `src/routes/index.tsx` - Empty for now
2. `src/routes/BibleRoute.tsx` - Empty for now
3. `src/routes/NotesListRoute.tsx` - Empty for now
4. `src/routes/NoteDetailRoute.tsx` - Empty for now
5. `src/routes/ErrorRoute.tsx` - Empty for now

---

### Phase 2: Core Routing Setup (2-3 hours)

#### Step 2.1: Update main.tsx with BrowserRouter

**File**: `src/main.tsx`

**Current code**:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**New code**:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

#### Step 2.2: Create Route Configuration

**File**: `src/routes/index.tsx`

Create a route configuration file:
```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';
import NotesListRoute from './NotesListRoute';
import NoteDetailRoute from './NoteDetailRoute';
import ErrorRoute from './ErrorRoute';

export function AppRoutes() {
  return (
    <Routes>
      {/* Redirect root to /bible */}
      <Route path="/" element={<Navigate to="/bible" replace />} />
      
      {/* Bible reading routes */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter/:verse" element={<BibleRoute />} />
      
      {/* Notes routes */}
      <Route path="/notes" element={<NotesListRoute />} />
      <Route path="/notes/:noteId" element={<NoteDetailRoute />} />
      
      {/* 404 catch-all */}
      <Route path="*" element={<ErrorRoute />} />
    </Routes>
  );
}
```

#### Step 2.3: Update App.tsx to Use Routes

**File**: `src/App.tsx`

**Changes needed**:
1. Import `AppRoutes` from `./routes`
2. Replace `<Passage />` component with `<AppRoutes />`
3. Keep all other UI shell components (Header, Footer, Modals, etc.)

**Modified structure**:
```typescript
import { AppRoutes } from './routes';

export default function App() {
  // ... existing state and hooks ...
  
  return (
    <ColorSchemeProvider {...}>
      <MantineProvider {...}>
        <AppShell
          navbar={<BibleSelector {...} />}
          header={<MyHeader {...} />}
          footer={<BottomNav {...} />}
        >
          {/* Replace Passage with Routes */}
          <AppRoutes />
          
          {/* Keep modals */}
          <SearchModal {...} />
          <MainMenu {...} />
        </AppShell>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
```

---

### Phase 3: Implement Bible Route (3-4 hours)

#### Step 3.1: Create BibleRoute Component

**File**: `src/routes/BibleRoute.tsx`

This route will:
1. Read URL parameters (`:book`, `:chapter`, `:verse`)
2. Sync URL params with Zustand store
3. Render the existing `Passage` component
4. Handle navigation via `useNavigate`

**Implementation**:
```typescript
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import Passage from '../components/Passage';

export default function BibleRoute() {
  const { book, chapter, verse } = useParams<{
    book?: string;
    chapter?: string;
    verse?: string;
  }>();
  
  const navigate = useNavigate();
  const {
    activeBook,
    activeChapter,
    activeVerses,
    setActiveBook,
    setActiveChapter,
    setActiveVerses,
  } = useBibleStore();

  // Sync URL params to store on mount/change
  useEffect(() => {
    if (book && chapter) {
      const chapterNum = parseInt(chapter, 10);
      
      // Update store if URL differs from current state
      if (book !== activeBook || chapterNum !== activeChapter) {
        setActiveBook(book);
        setActiveChapter(chapterNum);
      }
      
      // Handle verse parameter
      if (verse) {
        const verseNum = parseInt(verse, 10);
        if (!activeVerses.includes(verseNum)) {
          setActiveVerses([verseNum]);
        }
      } else if (activeVerses.length > 0) {
        setActiveVerses([]);
      }
    } else if (!book && !chapter) {
      // No params - redirect to current store state
      navigate(`/bible/${activeBook}/${activeChapter}`, { replace: true });
    }
  }, [book, chapter, verse]);

  // Sync store changes back to URL
  useEffect(() => {
    const expectedUrl = `/bible/${activeBook}/${activeChapter}`;
    const currentPath = window.location.pathname;
    
    if (!currentPath.startsWith(expectedUrl)) {
      navigate(expectedUrl, { replace: true });
    }
  }, [activeBook, activeChapter]);

  return <Passage />;
}
```

#### Step 3.2: Update BibleSelector Navigation

**File**: `src/components/BibleSelector.tsx`

**Changes needed**:
1. Import `useNavigate` from `react-router-dom`
2. Replace direct store updates with navigation calls

**Find and replace**:
```typescript
// OLD CODE (example):
setActiveBook(bookName);
setActiveChapter(chapterNum);

// NEW CODE:
const navigate = useNavigate();
navigate(`/bible/${bookName}/${chapterNum}`);
```

#### Step 3.3: Update SubHeader Navigation

**File**: `src/components/SubHeader.tsx`

Similar changes as BibleSelector - use `navigate()` instead of direct store updates.

---

### Phase 4: Implement Notes Routes (4-5 hours)

#### Step 4.1: Add Missing API Functions

**File**: `src/api.tsx`

Add these new functions:

```typescript
// Get single note by ID
export const getNote = async (noteId: string): Promise<Note> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/notes/${noteId}/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch note');
  return await response.json();
};

// Get public notes
export const getPublicNotes = async (): Promise<Note[]> => {
  const url = 'https://bibleresearchapi.vercel.app/api/v1/notes/?public=true';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch public notes');
  return await response.json();
};

// Get single tag by ID
export const getTag = async (tagId: string): Promise<Tag> => {
  const url = `https://bibleresearchapi.vercel.app/api/v1/tags/${tagId}/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch tag');
  return await response.json();
};
```

#### Step 4.2: Create NotesListRoute

**File**: `src/routes/NotesListRoute.tsx`

```typescript
import { useEffect, useState } from 'react';
import { Container, Title } from '@mantine/core';
import { useBibleStore } from '../store';
import NotesView from '../components/NotesView';

export default function NotesListRoute() {
  const { notes, tags, fetchNotes, getTags } = useBibleStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchNotes(), getTags()]);
      } catch (error) {
        console.error('Failed to load notes:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return <Container>Loading notes...</Container>;
  }

  return (
    <Container size="lg">
      <Title order={2} mb="md">My Notes</Title>
      <NotesView />
    </Container>
  );
}
```

#### Step 4.3: Create NoteDetailRoute

**File**: `src/routes/NoteDetailRoute.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Title, Text, Badge, Group, Button, Stack } from '@mantine/core';
import { getNote } from '../api';
import { Note } from '../api';

export default function NoteDetailRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNote = async () => {
      if (!noteId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const data = await getNote(noteId);
        setNote(data);
      } catch (err) {
        setError('Failed to load note');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    loadNote();
  }, [noteId]);

  if (loading) {
    return <Container>Loading note...</Container>;
  }

  if (error || !note) {
    return (
      <Container>
        <Text color="red">{error || 'Note not found'}</Text>
        <Button onClick={() => navigate('/notes')} mt="md">
          Back to Notes
        </Button>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack spacing="md">
        <Group position="apart">
          <Title order={2}>Note Details</Title>
          <Badge>{note.tag.name}</Badge>
        </Group>
        
        <div dangerouslySetInnerHTML={{ __html: note.note_text }} />
        
        <Title order={4} mt="lg">Referenced Verses</Title>
        {note.verses.map((verse, idx) => (
          <div key={idx}>
            <Text weight={500}>
              {verse.book} {verse.chapter}:{verse.verse}
            </Text>
            <Text color="dimmed">{verse.text}</Text>
          </div>
        ))}
        
        <Button onClick={() => navigate('/notes')} mt="md">
          Back to Notes
        </Button>
      </Stack>
    </Container>
  );
}
```

#### Step 4.4: Create ErrorRoute (404 Page)

**File**: `src/routes/ErrorRoute.tsx`

```typescript
import { Container, Title, Text, Button, Stack } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

export default function ErrorRoute() {
  const navigate = useNavigate();

  return (
    <Container size="sm" style={{ textAlign: 'center', marginTop: '4rem' }}>
      <Stack spacing="md">
        <Title order={1}>404</Title>
        <Title order={2}>Page Not Found</Title>
        <Text color="dimmed">
          The page you're looking for doesn't exist.
        </Text>
        <Button onClick={() => navigate('/bible')}>
          Go to Bible
        </Button>
      </Stack>
    </Container>
  );
}
```

---

### Phase 5: Update Navigation Components (2-3 hours)

#### Step 5.1: Update All Components That Change Bible State

**Files to update**:
- `src/components/BibleSelector.tsx`
- `src/components/SubHeader.tsx`
- `src/components/BottomNav.tsx`
- `src/components/SearchModal.tsx`

**Pattern to follow**:
```typescript
// 1. Import useNavigate
import { useNavigate } from 'react-router-dom';

// 2. Get navigate function
const navigate = useNavigate();

// 3. Replace store updates with navigation
// OLD:
setActiveBook(book);
setActiveChapter(chapter);

// NEW:
navigate(`/bible/${book}/${chapter}`);
```

#### Step 5.2: Update NoteCard for Note Links

**File**: `src/components/NoteCard.tsx`

Add click handler to navigate to note detail:
```typescript
import { useNavigate } from 'react-router-dom';

export default function NoteCard({ note }: { note: Note }) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate(`/notes/${note.id}`);
  };
  
  return (
    <Card onClick={handleClick} style={{ cursor: 'pointer' }}>
      {/* existing content */}
    </Card>
  );
}
```

---

### Phase 6: URL Synchronization & Deep Linking (2-3 hours)

#### Step 6.1: Add URL Sync Hook

**File**: `src/hooks/useBibleUrlSync.ts` (new file)

```typescript
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBibleStore } from '../store';

/**
 * Hook to keep URL in sync with Bible store state
 * Ensures URL always reflects current book/chapter
 */
export function useBibleUrlSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeBook, activeChapter } = useBibleStore();

  useEffect(() => {
    // Only sync if we're on a Bible route
    if (!location.pathname.startsWith('/bible')) return;

    const expectedPath = `/bible/${activeBook}/${activeChapter}`;
    
    if (location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [activeBook, activeChapter, location.pathname, navigate]);
}
```

#### Step 6.2: Use URL Sync Hook in BibleRoute

**File**: `src/routes/BibleRoute.tsx`

Add the hook:
```typescript
import { useBibleUrlSync } from '../hooks/useBibleUrlSync';

export default function BibleRoute() {
  useBibleUrlSync();
  // ... rest of component
}
```

---

### Phase 7: Testing & Validation (3-4 hours)

#### Step 7.1: Update Existing Tests

**Files to update**:
- `src/App.test.tsx`
- `src/components/BibleSelector.test.tsx`
- `src/components/SubHeader.test.tsx`

**Pattern**: Wrap all test renders with `MemoryRouter`:
```typescript
import { MemoryRouter } from 'react-router-dom';

test('renders component', () => {
  render(
    <MemoryRouter initialEntries={['/bible/John/1']}>
      <Component />
    </MemoryRouter>
  );
});
```

#### Step 7.2: Create Route Tests

**File**: `src/routes/__tests__/BibleRoute.test.tsx` (new)

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BibleRoute from '../BibleRoute';

describe('BibleRoute', () => {
  test('renders with URL params', () => {
    render(
      <MemoryRouter initialEntries={['/bible/John/3']}>
        <BibleRoute />
      </MemoryRouter>
    );
    
    // Add assertions based on expected behavior
  });
  
  test('redirects when no params provided', () => {
    // Test redirect logic
  });
});
```

#### Step 7.3: Manual Testing Checklist

Create a testing checklist:
- [ ] Navigate to `/bible` - should redirect to current book/chapter
- [ ] Navigate to `/bible/John/3` - should load John chapter 3
- [ ] Navigate to `/bible/John/3/16` - should highlight verse 16
- [ ] Click book in BibleSelector - URL should update
- [ ] Click chapter in SubHeader - URL should update
- [ ] Browser back/forward buttons work correctly
- [ ] Refresh page maintains current location
- [ ] Navigate to `/notes` - shows all notes
- [ ] Click a note - navigates to `/notes/:id`
- [ ] Navigate to invalid URL - shows 404 page

---

### Phase 8: Advanced Features (Optional, 4-6 hours)

#### Step 8.1: Add Query Parameters for Filters

**Example**: `/notes?tag=prayer&public=true`

Update `NotesListRoute.tsx`:
```typescript
import { useSearchParams } from 'react-router-dom';

export default function NotesListRoute() {
  const [searchParams] = useSearchParams();
  const tagFilter = searchParams.get('tag');
  const publicFilter = searchParams.get('public') === 'true';
  
  // Use filters in fetchNotes call
}
```

#### Step 8.2: Add Breadcrumb Navigation

**File**: `src/components/Breadcrumbs.tsx` (new)

```typescript
import { Breadcrumbs as MantineBreadcrumbs, Anchor } from '@mantine/core';
import { useLocation, Link } from 'react-router-dom';

export function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  return (
    <MantineBreadcrumbs>
      <Anchor component={Link} to="/">Home</Anchor>
      {pathSegments.map((segment, index) => {
        const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
        return (
          <Anchor key={path} component={Link} to={path}>
            {segment}
          </Anchor>
        );
      })}
    </MantineBreadcrumbs>
  );
}
```

#### Step 8.3: Add Route-Based Analytics

Track page views with Vercel Analytics:
```typescript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTracking() {
  const location = useLocation();
  
  useEffect(() => {
    // Track page view
    console.log('Page view:', location.pathname);
    // Add Vercel Analytics tracking here
  }, [location]);
}
```

---

## Migration Checklist

### Pre-Implementation
- [ ] Review current codebase structure
- [ ] Identify all components that modify Bible state
- [ ] Document current navigation patterns
- [ ] Create feature branch: `git checkout -b feature/client-side-routing`

### Phase 1: Setup
- [ ] Install react-router-dom
- [ ] Create routes directory structure
- [ ] Create empty route files

### Phase 2: Core Setup
- [ ] Update main.tsx with BrowserRouter
- [ ] Create route configuration
- [ ] Update App.tsx to use routes

### Phase 3: Bible Route
- [ ] Implement BibleRoute component
- [ ] Update BibleSelector navigation
- [ ] Update SubHeader navigation
- [ ] Test Bible navigation

### Phase 4: Notes Routes
- [ ] Add missing API functions
- [ ] Implement NotesListRoute
- [ ] Implement NoteDetailRoute
- [ ] Implement ErrorRoute
- [ ] Test notes navigation

### Phase 5: Navigation Updates
- [ ] Update BibleSelector
- [ ] Update SubHeader
- [ ] Update BottomNav
- [ ] Update SearchModal
- [ ] Update NoteCard

### Phase 6: URL Sync
- [ ] Create useBibleUrlSync hook
- [ ] Integrate hook in BibleRoute
- [ ] Test URL synchronization

### Phase 7: Testing
- [ ] Update existing tests
- [ ] Create new route tests
- [ ] Run full test suite
- [ ] Manual testing checklist

### Phase 8: Advanced (Optional)
- [ ] Add query parameters
- [ ] Add breadcrumbs
- [ ] Add analytics tracking

### Post-Implementation
- [ ] Update DEVELOPER_GUIDE.md with routing documentation
- [ ] Update README.md with new URL structure
- [ ] Create PR with detailed description
- [ ] Code review and merge

---

## Common Pitfalls & Solutions

### Issue 1: Store and URL Out of Sync
**Problem**: Store updates don't reflect in URL or vice versa
**Solution**: Use the `useBibleUrlSync` hook and ensure all navigation uses `navigate()`

### Issue 2: Tests Failing After Router Addition
**Problem**: Tests fail with "useNavigate must be used within Router"
**Solution**: Wrap all test renders with `<MemoryRouter>`

### Issue 3: Refresh Loses State
**Problem**: Page refresh resets to default book/chapter
**Solution**: Ensure URL params are read on mount in BibleRoute

### Issue 4: Back Button Doesn't Work
**Problem**: Browser back button doesn't navigate correctly
**Solution**: Use `navigate()` instead of direct store updates, avoid `replace: true` for user actions

### Issue 5: Nested Routes Not Rendering
**Problem**: Child routes don't render
**Solution**: Ensure parent route has `<Outlet />` component

---

## Performance Considerations

1. **Code Splitting**: Use React.lazy() for route components
   ```typescript
   const BibleRoute = lazy(() => import('./routes/BibleRoute'));
   ```

2. **Prefetching**: Prefetch adjacent chapters when route loads
   ```typescript
   useEffect(() => {
     prefetchAdjacentChapters(book, chapter, filesetId);
   }, [book, chapter]);
   ```

3. **Memoization**: Memoize route components to prevent unnecessary re-renders
   ```typescript
   export default memo(BibleRoute);
   ```

---

## Estimated Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1: Setup | 1-2 hours | Low |
| Phase 2: Core Routing | 2-3 hours | Medium |
| Phase 3: Bible Route | 3-4 hours | High |
| Phase 4: Notes Routes | 4-5 hours | High |
| Phase 5: Navigation Updates | 2-3 hours | Medium |
| Phase 6: URL Sync | 2-3 hours | Medium |
| Phase 7: Testing | 3-4 hours | Medium |
| Phase 8: Advanced (Optional) | 4-6 hours | Medium |
| **Total** | **17-24 hours** | - |

---

## Success Criteria

✅ All routes defined and accessible
✅ URL reflects current Bible passage
✅ Browser back/forward buttons work
✅ Page refresh maintains location
✅ Deep links work (shareable URLs)
✅ All existing tests pass
✅ New route tests added
✅ No TypeScript errors
✅ No console warnings
✅ Documentation updated

---

## Next Steps After Implementation

1. **Add More Routes**: Tags, Search, Public Notes
2. **Add Route Guards**: Authentication checks for private routes
3. **Add Loading States**: Suspense boundaries for lazy-loaded routes
4. **Add Transitions**: Page transition animations
5. **Add SEO**: Meta tags per route for better SEO
6. **Add Sitemap**: Generate sitemap for search engines

---

## Resources

- [React Router v6 Docs](https://reactrouter.com/en/main)
- [Zustand with React Router](https://github.com/pmndrs/zustand/wiki/Recipes#react-router)
- [Mantine with React Router](https://mantine.dev/guides/react-router/)
- [Testing React Router](https://reactrouter.com/en/main/start/tutorial#testing)
