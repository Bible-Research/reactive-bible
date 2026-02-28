# Phase 0: Minimal Bible Routing POC

## Goal
Implement the simplest possible routing to validate the concept:
- Route: `/bible/:book/:chapter`
- Sync URL with Zustand store
- Enable shareable Bible passage URLs
- Test browser back/forward and refresh

**Estimated Time: 3-4 hours**

---

## Implementation Steps

### Step 1: Install Dependencies (5 min)

```bash
npm install react-router-dom
npm install --save-dev @types/react-router-dom
```

**Verify**: Check `package.json` for both packages

---

### Step 2: Wrap App with BrowserRouter (5 min)

**File**: `src/main.tsx`

**Before**:
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

**After**:
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

---

### Step 3: Create BibleRoute Component (30 min)

**File**: `src/routes/BibleRoute.tsx` (new file)

```typescript
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import Passage from '../components/Passage';

export default function BibleRoute() {
  const { book, chapter } = useParams<{
    book?: string;
    chapter?: string;
  }>();
  
  const navigate = useNavigate();
  const {
    activeBook,
    activeChapter,
    setActiveBook,
    setActiveChapter,
  } = useBibleStore();

  // Sync URL params to store when URL changes
  useEffect(() => {
    if (book && chapter) {
      const chapterNum = parseInt(chapter, 10);
      
      // Only update if different from current state
      if (book !== activeBook || chapterNum !== activeChapter) {
        console.log(`📖 URL changed: ${book} ${chapterNum}`);
        setActiveBook(book);
        setActiveChapter(chapterNum);
      }
    } else {
      // No URL params - redirect to current store state
      console.log(`📖 No URL params, redirecting to: ${activeBook} ${activeChapter}`);
      navigate(`/bible/${activeBook}/${activeChapter}`, { replace: true });
    }
  }, [book, chapter]);

  // Sync store changes back to URL (when user navigates via UI)
  useEffect(() => {
    const expectedUrl = `/bible/${activeBook}/${activeChapter}`;
    const currentPath = window.location.pathname;
    
    if (currentPath !== expectedUrl && !currentPath.includes('/bible/')) {
      console.log(`📖 Store changed, updating URL to: ${expectedUrl}`);
      navigate(expectedUrl, { replace: true });
    }
  }, [activeBook, activeChapter]);

  return <Passage />;
}
```

---

### Step 4: Create Route Configuration (15 min)

**File**: `src/routes/index.tsx` (new file)

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import BibleRoute from './BibleRoute';

export function AppRoutes() {
  return (
    <Routes>
      {/* Redirect root to /bible (will then redirect to current book/chapter) */}
      <Route path="/" element={<Navigate to="/bible" replace />} />
      
      {/* Bible routes */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />
      
      {/* Catch-all: redirect to bible */}
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
```

---

### Step 5: Update App.tsx to Use Routes (10 min)

**File**: `src/App.tsx`

**Find this line** (around line 90):
```typescript
<Passage showNotes={showNotes} setShowNotes={setShowNotes} />
```

**Replace with**:
```typescript
import { AppRoutes } from './routes';

// ... in the JSX:
<AppRoutes />
```

**Full change**:
```typescript
// Add import at top
import { AppRoutes } from './routes';

// ... existing code ...

return (
  <ColorSchemeProvider {...}>
    <MantineProvider {...}>
      <AppShell {...}>
        {/* Replace Passage with AppRoutes */}
        <AppRoutes />
        
        {/* Keep modals */}
        <SearchModal opened={modalOpened} close={modalFn.close} />
        <MainMenu {...} />
      </AppShell>
    </MantineProvider>
  </ColorSchemeProvider>
);
```

**Note**: Remove the `showNotes` and `setShowNotes` props from Passage since we're not using them in the POC.

---

### Step 6: Update Passage Component (10 min)

**File**: `src/components/Passage.tsx`

**Remove props** since BibleRoute doesn't pass them:

**Before**:
```typescript
export default function Passage({ showNotes, setShowNotes }: PassageProps) {
```

**After**:
```typescript
export default function Passage() {
  // Get showNotes from store instead
  const showNotes = useBibleStore((state) => state.showNotes);
```

---

### Step 7: Update BibleSelector Navigation (20 min)

**File**: `src/components/BibleSelector.tsx`

**Add navigation**:
```typescript
import { useNavigate } from 'react-router-dom';

export default function BibleSelector({ opened, setOpened }: Props) {
  const navigate = useNavigate();
  // ... existing code ...
  
  // Find where book/chapter is selected (likely in a click handler)
  // Replace direct store updates with navigation
  
  const handleChapterClick = (book: string, chapter: number) => {
    console.log(`🔗 Navigating to: /bible/${book}/${chapter}`);
    navigate(`/bible/${book}/${chapter}`);
    setOpened(false); // Close the selector
  };
  
  // Update your existing click handlers to use handleChapterClick
}
```

---

### Step 8: Update SubHeader Navigation (20 min)

**File**: `src/components/SubHeader.tsx`

**Add navigation for prev/next chapter**:
```typescript
import { useNavigate } from 'react-router-dom';

export default function SubHeader() {
  const navigate = useNavigate();
  const { activeBook, activeChapter } = useBibleStore();
  
  const handlePrevChapter = () => {
    if (activeChapter > 1) {
      navigate(`/bible/${activeBook}/${activeChapter - 1}`);
    }
  };
  
  const handleNextChapter = () => {
    const chapters = getChapters(activeBook);
    if (activeChapter < chapters.length) {
      navigate(`/bible/${activeBook}/${activeChapter + 1}`);
    }
  };
  
  // Update your button onClick handlers to use these functions
}
```

---

### Step 9: Manual Testing (30 min)

**Test Checklist**:

1. **Direct URL Navigation**:
   - [ ] Go to `http://localhost:5173/bible/John/3`
   - [ ] Should load John chapter 3
   - [ ] URL should stay as `/bible/John/3`

2. **UI Navigation**:
   - [ ] Click a book/chapter in BibleSelector
   - [ ] URL should update to match selection
   - [ ] Content should load correctly

3. **Chapter Navigation**:
   - [ ] Click "Next Chapter" button
   - [ ] URL should update (e.g., `/bible/John/4`)
   - [ ] Content should load

4. **Browser Back/Forward**:
   - [ ] Navigate to several chapters
   - [ ] Click browser back button
   - [ ] Should go to previous chapter
   - [ ] Click browser forward button
   - [ ] Should go to next chapter

5. **Page Refresh**:
   - [ ] Navigate to `/bible/Matthew/5`
   - [ ] Refresh the page (F5 or Cmd+R)
   - [ ] Should stay on Matthew 5
   - [ ] Content should load correctly

6. **Root URL**:
   - [ ] Go to `http://localhost:5173/`
   - [ ] Should redirect to `/bible/John/1` (or whatever is in store)

7. **Invalid URL**:
   - [ ] Go to `http://localhost:5173/invalid`
   - [ ] Should redirect to `/bible`

---

## Expected Console Output

You should see logs like:
```
📖 URL changed: John 3
📖 Store changed, updating URL to: /bible/John/4
🔗 Navigating to: /bible/Matthew/5
```

---

## Troubleshooting

### Issue: "useNavigate must be used within Router"
**Solution**: Make sure `BrowserRouter` is in `main.tsx`

### Issue: URL changes but content doesn't update
**Solution**: Check that `useEffect` in `BibleRoute.tsx` has correct dependencies

### Issue: Infinite redirect loop
**Solution**: Check the condition in the store-to-URL sync `useEffect` - it should not trigger when already on the correct URL

### Issue: Page refresh loses state
**Solution**: Zustand should persist to localStorage - check that `activeBook` and `activeChapter` are in the `partialize` function in `store.tsx`

---

## Success Criteria

✅ Can navigate to `/bible/John/3` directly
✅ URL updates when clicking in BibleSelector
✅ Browser back/forward buttons work
✅ Page refresh maintains current passage
✅ No console errors
✅ No infinite loops or flickering

---

## What We're NOT Implementing (Yet)

- ❌ Verse highlighting via URL (`:verse` param)
- ❌ Notes routes
- ❌ Tags routes
- ❌ Search routes
- ❌ 404 error page
- ❌ Loading states
- ❌ Route transitions
- ❌ Tests (will add after POC works)

---

## Next Steps After POC

Once this works:
1. Add tests with `MemoryRouter`
2. Add verse parameter: `/bible/:book/:chapter/:verse`
3. Add notes routes
4. Add proper error handling
5. Add loading states

---

## Files Modified

- ✅ `src/main.tsx` - Add BrowserRouter
- ✅ `src/App.tsx` - Use AppRoutes
- ✅ `src/components/Passage.tsx` - Remove props
- ✅ `src/components/BibleSelector.tsx` - Add navigate()
- ✅ `src/components/SubHeader.tsx` - Add navigate()

## Files Created

- ✅ `src/routes/BibleRoute.tsx` - Main route component
- ✅ `src/routes/index.tsx` - Route configuration

---

## Estimated Timeline

| Task | Time |
|------|------|
| Install dependencies | 5 min |
| Update main.tsx | 5 min |
| Create BibleRoute | 30 min |
| Create route config | 15 min |
| Update App.tsx | 10 min |
| Update Passage | 10 min |
| Update BibleSelector | 20 min |
| Update SubHeader | 20 min |
| Manual testing | 30 min |
| **Total** | **~2.5 hours** |

Add 30-60 min buffer for debugging = **3-4 hours total**
