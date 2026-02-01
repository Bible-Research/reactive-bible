# Routing Implementation Plan for Reactive Bible

## Executive Summary

This document outlines a comprehensive plan to implement client-side 
routing in the Reactive Bible application. Currently, the app uses 
conditional rendering (`showNotes` state) to toggle between Bible 
passage view and Notes view. This plan proposes migrating to 
`react-router-dom` v6 to enable proper URL-based navigation, improve 
UX with browser history support, and enable deep linking.

---

## 1. Current Application Structure Analysis

### 1.1 Component Hierarchy

```
App.tsx (Root)
├── MantineProvider
├── ColorSchemeProvider
└── AppShell
    ├── MyHeader (Top navigation bar)
    ├── MyNavbar (Left sidebar: Books/Chapters/Verses)
    └── Main Content Area
        └── Passage.tsx (Container component)
            ├── SubHeader (Navigation controls + view toggle)
            └── Conditional Rendering:
                ├── PassageView.tsx (Bible text display)
                └── NotesView.tsx (Notes by tag display)
```

### 1.2 Current Navigation Mechanism

**View Switching:**
- State-based: `showNotes` boolean in `Passage.tsx` (line 10)
- Toggle button in `SubHeader.tsx` (lines 93-96)
- No URL changes when switching views

**Bible Navigation:**
- Sidebar navigation via `MyNavbar.tsx`
- Previous/Next chapter buttons in `SubHeader.tsx`
- Search modal (`SearchModal.tsx`) triggered by `/` key
- All navigation updates Zustand store state

**Key State Management:**
- Zustand store (`store.tsx`) manages:
  - `activeBook`, `activeBookShort`, `activeChapter`, `activeVerses`
  - `bibleVersion`, `translations`, `filesetIds`
  - `notes`, `showNotes`
- State persisted to localStorage via Zustand persist middleware

---

## 2. Identified "Page" Components

Based on the analysis, the following components serve as distinct views:

| Component | Current Trigger | Purpose |
|-----------|----------------|---------|
| `PassageView.tsx` | `showNotes === false` | Display Bible verses |
| `NotesView.tsx` | `showNotes === true` | Display notes by tag |

**Potential Future Pages** (not currently implemented):
- Settings/Preferences page
- About page
- Help/Documentation page
- Search results page (currently modal)

---

## 3. Proposed Route Mapping

### 3.1 Core Routes

| Route | Component | Description | URL Parameters |
|-------|-----------|-------------|----------------|
| `/` | `PassageView` | Default Bible reading view | None (redirects to `/bible`) |
| `/bible` | `PassageView` | Bible passage display | Optional: `/:book/:chapter/:verse` |
| `/bible/:book/:chapter` | `PassageView` | Specific chapter | `book`, `chapter` |
| `/bible/:book/:chapter/:verse` | `PassageView` | Specific verse(s) | `book`, `chapter`, `verse` |
| `/notes` | `NotesView` | Notes view (all tags) | Optional: `/:tagId` |
| `/notes/:tagId` | `NotesView` | Notes filtered by tag | `tagId` |

### 3.2 Future Extensibility Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/settings` | `SettingsView` | App preferences, translations |
| `/about` | `AboutView` | About the application |
| `/help` | `HelpView` | User guide, keyboard shortcuts |

### 3.3 URL Examples

```
https://reactive-bible.app/
https://reactive-bible.app/bible
https://reactive-bible.app/bible/John/3
https://reactive-bible.app/bible/John/3/16
https://reactive-bible.app/notes
https://reactive-bible.app/notes/tag-uuid-123
```

---

## 4. Library Recommendation: React Router v6

### 4.1 Why React Router DOM?

**Pros:**
1. **Industry Standard**: Most widely used React routing library 
   (~11M weekly downloads)
2. **Declarative API**: Clean, React-friendly syntax with hooks
3. **TypeScript Support**: Excellent type definitions
4. **Nested Routes**: Perfect for our AppShell layout structure
5. **Data Loading**: Built-in data fetching with loaders (v6.4+)
6. **Backward Navigation**: Browser back/forward button support
7. **Deep Linking**: Shareable URLs for specific passages/notes
8. **Code Splitting**: Easy lazy loading of route components
9. **Active Development**: Regular updates, strong community

**Cons:**
1. Bundle size: ~12KB gzipped (acceptable for this use case)
2. Learning curve: Team needs to learn routing patterns

**Alternatives Considered:**
- **TanStack Router**: More type-safe, but newer and less mature
- **Wouter**: Lightweight (~1.5KB), but lacks features like nested 
  routes
- **Reach Router**: Deprecated, merged into React Router

**Decision**: React Router DOM v6 is the best fit due to maturity, 
features, and community support.

### 4.2 Version Recommendation

**Install**: `react-router-dom@^6.22.0` (latest stable as of Feb 2024)

---

## 5. Refactoring Plan

### Phase 1: Setup and Installation (30 minutes)

**Step 1.1: Install Dependencies**
```bash
npm install react-router-dom@^6.22.0
npm install --save-dev @types/react-router-dom
```

**Step 1.2: Update package.json**
Verify dependencies are added correctly.

---

### Phase 2: Create Route Components (1 hour)

**Step 2.1: Create Routes Directory**
```bash
mkdir src/routes
```

**Step 2.2: Create Route Wrapper Components**

Create `src/routes/BibleRoute.tsx`:
- Wraps `PassageView`
- Reads URL params (`book`, `chapter`, `verse`)
- Updates Zustand store on mount
- Syncs URL with store changes

Create `src/routes/NotesRoute.tsx`:
- Wraps `NotesView`
- Reads `tagId` from URL params
- Fetches notes for specific tag if provided

**Step 2.3: Create Layout Component**

Create `src/routes/RootLayout.tsx`:
- Contains `AppShell` with `MyHeader` and `MyNavbar`
- Uses `<Outlet />` for nested route rendering
- Maintains current layout structure

---

### Phase 3: Implement Router in App.tsx (1 hour)

**Step 3.1: Wrap App with BrowserRouter**

**Step 3.2: Define Routes**
- Use `createBrowserRouter` and `RouterProvider` (recommended v6 
  pattern)
- Define route hierarchy with nested routes
- Add error boundary route

**Step 3.3: Update Navigation Components**
- Replace `<a href="/">` with `<Link to="/">` in `MyNavbar.tsx`
- Use `useNavigate()` hook for programmatic navigation
- Update `SubHeader.tsx` toggle button to use navigation

---

### Phase 4: Sync URL with Zustand Store (2 hours)

**Step 4.1: URL → Store Sync**
- Use `useParams()` and `useSearchParams()` in route components
- Update store when URL params change
- Handle invalid book/chapter/verse gracefully

**Step 4.2: Store → URL Sync**
- Subscribe to Zustand store changes
- Use `useNavigate()` to update URL when store changes
- Prevent infinite loops with proper dependency management

**Step 4.3: Handle Edge Cases**
- Invalid book names (redirect to default)
- Invalid chapter/verse numbers (redirect to valid range)
- Missing translations (show error message)

---

### Phase 5: Update Navigation Logic (1.5 hours)

**Step 5.1: Update MyNavbar.tsx**
- Replace `event.preventDefault()` + state updates with 
  `navigate()`
- Generate URLs dynamically: `/bible/${book}/${chapter}`
- Maintain scroll behavior for verses

**Step 5.2: Update SubHeader.tsx**
- Replace `setShowNotes()` with `navigate('/notes')` or 
  `navigate('/bible')`
- Update prev/next handlers to use `navigate()`
- Keep search modal as-is (can be converted to route later)

**Step 5.3: Update Passage.tsx**
- Remove `showNotes` state (now controlled by route)
- Remove conditional rendering (handled by router)
- Keep `handleViewInBible` but use `navigate()` instead of state

---

### Phase 6: Testing and Validation (2 hours)

**Step 6.1: Manual Testing**
- Test all navigation paths (sidebar, prev/next, toggle)
- Verify browser back/forward buttons work
- Test deep linking (paste URL directly)
- Verify localStorage persistence still works

**Step 6.2: Update Existing Tests**
- Wrap test components with `MemoryRouter`
- Mock `useNavigate()` and `useParams()` hooks
- Update test helpers in `__tests__/helpers.tsx`

**Step 6.3: Add New Tests**
- Test route parameter parsing
- Test navigation between routes
- Test invalid URL handling

---

### Phase 7: Documentation and Cleanup (30 minutes)

**Step 7.1: Update DEVELOPER_GUIDE.md**
- Document new routing structure
- Add URL schema documentation
- Update navigation flow diagrams

**Step 7.2: Clean Up Old Code**
- Remove `showNotes` state from `Passage.tsx`
- Remove unused conditional rendering logic
- Update comments and JSDoc

---

## 6. Code Preview: App.tsx After Changes

### 6.1 New File Structure

```
src/
├── App.tsx (Router setup)
├── routes/
│   ├── RootLayout.tsx (AppShell wrapper)
│   ├── BibleRoute.tsx (PassageView wrapper)
│   ├── NotesRoute.tsx (NotesView wrapper)
│   └── ErrorPage.tsx (404/error handling)
├── components/ (existing)
└── ... (existing files)
```

### 6.2 Updated App.tsx

```tsx
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
import RootLayout from "./routes/RootLayout";
import BibleRoute from "./routes/BibleRoute";
import NotesRoute from "./routes/NotesRoute";
import ErrorPage from "./routes/ErrorPage";

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
      {
        path: "notes",
        element: <NotesRoute />,
      },
      {
        path: "notes/:tagId",
        element: <NotesRoute />,
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

  // Clean up expired audio URLs on app load
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

### 6.3 New RootLayout.tsx

```tsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppShell } from "@mantine/core";
import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import MyNavbar from "../components/MyNavbar";
import MyHeader from "../components/MyHeader";
import { SearchModal } from "../components/SearchModal";
import { useColorScheme } from "../hooks/useColorScheme";

export default function RootLayout() {
  const [opened, setOpened] = useState(false);
  const [modalOpened, modalFn] = useDisclosure(false);
  const { colorScheme, toggleColorScheme } = useColorScheme();

  useWindowEvent("keydown", (event) => {
    if (event.key === "/") {
      event.preventDefault();
      modalFn.open();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      modalFn.close();
    }
  });

  return (
    <>
      <AppShell
        padding="md"
        navbar={<MyNavbar opened={opened} setOpened={setOpened} />}
        header={
          <MyHeader
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
            opened={opened}
            setOpened={setOpened}
            open={modalFn.open}
          />
        }
        styles={(theme) => ({
          main: {
            backgroundColor:
              theme.colorScheme === "dark"
                ? theme.colors.dark[8]
                : theme.colors.gray[0],
            height: "100vh",
          },
        })}
      >
        <Outlet />
      </AppShell>
      <SearchModal opened={modalOpened} close={modalFn.close} />
    </>
  );
}
```

### 6.4 New BibleRoute.tsx

```tsx
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { getBooks } from "../api";
import SubHeader from "../components/SubHeader";
import PassageView from "../components/PassageView";

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
    setActiveBookShort,
    setActiveChapter,
    setActiveVerses,
  } = useBibleStore();

  // Sync URL params to store on mount/change
  useEffect(() => {
    if (book && chapter) {
      const books = getBooks();
      const bookData = books.find(
        (b) => b.book_id.toLowerCase() === book.toLowerCase() ||
               b.book_name.toLowerCase() === book.toLowerCase()
      );

      if (!bookData) {
        // Invalid book, redirect to current active book
        navigate(`/bible/${activeBook}/${activeChapter}`, 
          { replace: true }
        );
        return;
      }

      const chapterNum = parseInt(chapter, 10);
      if (isNaN(chapterNum) || chapterNum < 1) {
        navigate(`/bible/${bookData.book_id}/1`, { replace: true });
        return;
      }

      // Update store
      setActiveBook(bookData.book_name);
      setActiveBookShort(bookData.book_id);
      setActiveChapter(chapterNum);

      if (verse) {
        const verseNum = parseInt(verse, 10);
        if (!isNaN(verseNum) && verseNum > 0) {
          setActiveVerses([verseNum]);
        }
      } else {
        setActiveVerses([]);
      }
    }
  }, [book, chapter, verse]);

  // Sync store changes to URL (when navigating via sidebar)
  useEffect(() => {
    const currentPath = `/bible/${activeBook}/${activeChapter}`;
    const expectedPath = book && chapter 
      ? `/bible/${book}/${chapter}` 
      : "";

    if (expectedPath && currentPath !== expectedPath) {
      navigate(currentPath, { replace: true });
    }
  }, [activeBook, activeChapter]);

  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        h="80vh"
      >
        <PassageView />
      </Box>
    </Box>
  );
}
```

### 6.5 New NotesRoute.tsx

```tsx
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { getBooks } from "../api";
import SubHeader from "../components/SubHeader";
import NotesView from "../components/NotesView";

export default function NotesRoute() {
  const { tagId } = useParams<{ tagId?: string }>();
  const navigate = useNavigate();

  const {
    setActiveBook,
    setActiveBookShort,
    setActiveChapter,
    setActiveVerses,
  } = useBibleStore();

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    const books = getBooks();
    const bookData = books.find((b) => b.book_name === book);
    const bookShort = bookData?.book_id || book;

    // Update store
    setActiveBook(book);
    setActiveBookShort(bookShort);
    setActiveChapter(chapter);
    setActiveVerses([verse]);

    // Navigate to Bible view
    navigate(`/bible/${bookShort}/${chapter}/${verse}`);
  };

  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        h="80vh"
      >
        <NotesView onViewInBible={handleViewInBible} />
      </Box>
    </Box>
  );
}
```

---

## 7. Migration Risks and Mitigation

### 7.1 Potential Issues

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests | HIGH | Update test helpers first, use 
`MemoryRouter` |
| URL/Store sync loops | MEDIUM | Careful dependency management, 
use refs |
| Losing localStorage state | MEDIUM | Zustand persist middleware 
unaffected |
| Breaking keyboard shortcuts | LOW | Keep global event listeners in 
layout |
| Performance regression | LOW | Use React.memo, lazy loading if 
needed |

### 7.2 Rollback Plan

1. Keep routing changes in a feature branch
2. Use feature flag to toggle routing on/off
3. Maintain old conditional rendering as fallback
4. Deploy behind feature flag, test in production
5. Remove old code after 1 week of stable routing

---

## 8. Success Criteria

### 8.1 Functional Requirements

- [ ] All existing navigation works (sidebar, prev/next, toggle)
- [ ] Browser back/forward buttons work correctly
- [ ] Deep linking works (paste URL → correct view)
- [ ] URL updates when navigating via UI
- [ ] localStorage persistence still works
- [ ] Keyboard shortcuts still work (/, Escape)
- [ ] All existing tests pass

### 8.2 Non-Functional Requirements

- [ ] No performance degradation (measure with Lighthouse)
- [ ] Bundle size increase < 15KB gzipped
- [ ] No console errors or warnings
- [ ] Smooth transitions between routes
- [ ] Accessible navigation (ARIA labels, keyboard nav)

---

## 9. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Setup | 30 min | None |
| Phase 2: Route Components | 1 hour | Phase 1 |
| Phase 3: Router Implementation | 1 hour | Phase 2 |
| Phase 4: URL/Store Sync | 2 hours | Phase 3 |
| Phase 5: Navigation Updates | 1.5 hours | Phase 4 |
| Phase 6: Testing | 2 hours | Phase 5 |
| Phase 7: Documentation | 30 min | Phase 6 |
| **Total** | **8.5 hours** | |

**Recommended Approach**: Implement in 2-3 sessions over 2-3 days to 
allow for testing and iteration.

---

## 10. Next Steps

1. **Review this plan** with the team
2. **Create a feature branch**: `feature/client-side-routing`
3. **Start with Phase 1**: Install dependencies
4. **Implement incrementally**: One phase at a time
5. **Test thoroughly**: After each phase
6. **Update documentation**: As you go
7. **Deploy behind feature flag**: For safe rollout

---

## 11. Future Enhancements

After routing is stable, consider:

1. **Lazy Loading**: Code-split routes for faster initial load
2. **Route Guards**: Protect routes that require authentication 
   (future)
3. **Route Transitions**: Smooth animations between views
4. **Search Route**: Convert search modal to `/search` route
5. **Settings Route**: Add `/settings` for user preferences
6. **Analytics**: Track route changes with Vercel Analytics
7. **SEO**: Add meta tags per route (if SSR is added later)

---

## Appendix A: Key Files to Modify

| File | Changes Required | Complexity |
|------|------------------|------------|
| `App.tsx` | Add router setup | MEDIUM |
| `Passage.tsx` | Remove conditional rendering | LOW |
| `SubHeader.tsx` | Replace state with navigation | MEDIUM |
| `MyNavbar.tsx` | Use `Link` and `useNavigate` | MEDIUM |
| `NotesView.tsx` | Use navigation for view switching | LOW |
| `__tests__/helpers.tsx` | Add router test utilities | MEDIUM |
| `DEVELOPER_GUIDE.md` | Document routing | LOW |

---

## Appendix B: Dependencies to Install

```json
{
  "dependencies": {
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@types/react-router-dom": "^5.3.3"
  }
}
```

---

## Appendix C: Useful Resources

- [React Router v6 Docs](https://reactrouter.com/en/main)
- [React Router v6 Tutorial](https://reactrouter.com/en/main/start/tutorial)
- [Zustand + React Router Integration](https://github.com/pmndrs/zustand/discussions/1144)
- [Testing React Router](https://testing-library.com/docs/example-react-router/)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-01  
**Author**: Cascade AI  
**Status**: Ready for Implementation
