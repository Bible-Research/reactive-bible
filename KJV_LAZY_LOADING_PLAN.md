# KJV Lazy Loading Implementation Plan

## Problem Statement

Currently, `src/assets/kjv.json` (6.8MB, 31,102 lines) is statically imported in `src/api.tsx`, which means it's bundled into the initial JavaScript and sent to all users on first request, regardless of whether they use the KJV translation.

**Impact:**
- Initial bundle size: +6.8MB
- Slower initial page load for all users
- Wasted bandwidth for users who never select KJV
- Memory consumption in test suite (contributing to OOM errors)

## Current Usage Analysis

### Files Using KJV Data

1. **`src/api.tsx`** - Main consumer
   - `getBooks()` - Returns all 66 books (used by BibleSelector)
   - `getChapters(book)` - Returns chapters for a book (used by BibleSelector)
   - `getVerses(book, chapter)` - Returns verse numbers (used by BibleSelector)
   - `getVersesInKjvChapter(book, chapter)` - Returns verse text for KJV
   - `getKjvAudioUrl(book, chapter)` - Generates audio URL
   - `getPassage()` - Returns all book/chapter combinations (used by SubHeader, Audio)

2. **Components using these functions:**
   - `BibleSelector.tsx` - Uses `getBooks()`, `getChapters()`, `getVerses()`
   - `SubHeader.tsx` - Uses `getPassage()` for prev/next navigation
   - `Audio.tsx` - Uses `getPassage()`, `getKjvAudioUrl()`
   - `routes/BibleRoute.tsx` - Indirectly uses via store

3. **Conditional KJV usage:**
   - `getVersesInChapter()` - Only calls `getVersesInKjvChapter()` when `filesetId === 'ENGKJV'`
   - `prefetchAudioUrl()` - Only calls `getKjvAudioUrl()` when `filesetId === 'ENGKJV'`
   - `Audio.tsx` - Only calls `getKjvAudioUrl()` when `activeAudioFilesetId === 'ENGKJV'`

### Key Insight

**Problem:** `getBooks()`, `getChapters()`, `getVerses()`, and `getPassage()` are used for **navigation UI** regardless of translation, but they currently depend on KJV data.

**Solution:** These functions should use **API data** instead of local KJV data, making KJV data only needed when user explicitly selects KJV translation.

## Proposed Solution

### Architecture Overview

1. **Remove static import** of `kjv.json`
2. **Lazy load KJV data** only when `filesetId === 'ENGKJV'` is selected
3. **Cache loaded data** in memory to avoid re-importing
4. **Fetch navigation data from API** instead of using KJV data
5. **Update all functions** to be async and handle loading states

### Implementation Phases

---

## Phase 1: Create KJV Data Loader Module (1-2 hours)

**Goal:** Create a module that lazy-loads and caches KJV data.

### Files to Create

**`src/utils/kjvDataLoader.ts`**
```typescript
import { KjvBook } from '../api';

let kjvDataCache: KjvBook[] | null = null;
let loadingPromise: Promise<KjvBook[]> | null = null;

/**
 * Lazy load KJV data using dynamic import
 * Returns cached data if already loaded
 */
export const loadKjvData = async (): Promise<KjvBook[]> => {
  // Return cached data if available
  if (kjvDataCache) {
    console.log('✅ KJV data loaded from memory cache');
    return kjvDataCache;
  }

  // Return existing loading promise if already loading
  if (loadingPromise) {
    console.log('⏳ KJV data already loading, waiting...');
    return loadingPromise;
  }

  // Start loading
  console.log('📥 Loading KJV data (6.8MB)...');
  loadingPromise = import('../assets/kjv.json')
    .then((module) => {
      kjvDataCache = module.default as KjvBook[];
      loadingPromise = null;
      console.log('✅ KJV data loaded successfully');
      return kjvDataCache;
    })
    .catch((error) => {
      loadingPromise = null;
      console.error('❌ Failed to load KJV data:', error);
      throw new Error('Failed to load KJV Bible data');
    });

  return loadingPromise;
};

/**
 * Check if KJV data is already loaded
 */
export const isKjvDataLoaded = (): boolean => {
  return kjvDataCache !== null;
};

/**
 * Clear KJV data from cache (useful for testing)
 */
export const clearKjvDataCache = (): void => {
  kjvDataCache = null;
  loadingPromise = null;
  console.log('🗑️ KJV data cache cleared');
};
```

**Success Criteria:**
- ✅ Dynamic import works
- ✅ Data is cached after first load
- ✅ Concurrent calls share same loading promise
- ✅ Clear error handling

---

## Phase 2: Fetch Navigation Data from API (2-3 hours)

**Goal:** Replace KJV-dependent navigation functions with API-based alternatives.

### API Endpoints to Use

The Bible Research API provides metadata endpoints:
- `GET /api/v1/bible/books/` - List of all books
- `GET /api/v1/bible/books/{book_id}/chapters/` - Chapters for a book
- `GET /api/v1/bible/{book}/{chapter}/verses/` - Verses in a chapter

### Files to Modify

**`src/api.tsx`**

Add new API-based navigation functions:

```typescript
// Cache for navigation data (lightweight)
let booksCache: { book_name: string; book_id: string }[] | null = null;
let passageCache: { book_name: string; book_id: string; chapter: number }[] | null = null;

/**
 * Get list of all Bible books from API
 * Falls back to KJV data if API fails
 */
export const getBooks = async (): Promise<{ book_name: string; book_id: string }[]> => {
  // Return cached data if available
  if (booksCache) {
    return booksCache;
  }

  try {
    // Try API first
    const response = await fetch('https://bible-research-489314.ey.r.appspot.com/api/v1/bible/books/');
    const data = await response.json();
    booksCache = data.results || data;
    console.log('✅ Books loaded from API');
    return booksCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch books from API, falling back to KJV data');
    // Fallback to KJV data
    const kjvData = await loadKjvData();
    const set = new Set<string>();
    kjvData.forEach((book: KjvBook) => {
      const obj = { book_name: book.book_name, book_id: book.book_id };
      set.add(JSON.stringify(obj, Object.keys(obj).sort()));
    });
    booksCache = [...set].map((item) => JSON.parse(item));
    return booksCache;
  }
};

/**
 * Get chapters for a book from API
 * Falls back to KJV data if API fails
 */
export const getChapters = async (thebook: string): Promise<number[]> => {
  try {
    const response = await fetch(
      `https://bible-research-489314.ey.r.appspot.com/api/v1/bible/books/${thebook}/chapters/`
    );
    const data = await response.json();
    return data.chapters || [];
  } catch (error) {
    console.warn('⚠️ Failed to fetch chapters from API, falling back to KJV data');
    const kjvData = await loadKjvData();
    return [
      ...new Set<number>(
        kjvData
          .filter((book: KjvBook) => book.book_name === thebook)
          .map((book: KjvBook) => book.chapter)
      ),
    ];
  }
};

/**
 * Get verse numbers for a chapter from API
 * Falls back to KJV data if API fails
 */
export const getVerses = async (thebook: string, thechapter: number): Promise<number[]> => {
  try {
    const response = await fetch(
      `https://bible-research-489314.ey.r.appspot.com/api/v1/bible/${thebook}/${thechapter}/verses/`
    );
    const data = await response.json();
    return data.verses || [];
  } catch (error) {
    console.warn('⚠️ Failed to fetch verses from API, falling back to KJV data');
    const kjvData = await loadKjvData();
    return kjvData
      .filter((book: KjvBook) => book.book_name === thebook && book.chapter === thechapter)
      .map((book: KjvBook) => book.verse);
  }
};

/**
 * Get all passages (book/chapter combinations) from API
 * Falls back to KJV data if API fails
 */
export const getPassage = async (): Promise<{ book_name: string; book_id: string; chapter: number }[]> => {
  if (passageCache) {
    return passageCache;
  }

  try {
    const response = await fetch('https://bible-research-489314.ey.r.appspot.com/api/v1/bible/passages/');
    const data = await response.json();
    passageCache = data.results || data;
    return passageCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch passages from API, falling back to KJV data');
    const kjvData = await loadKjvData();
    const set = new Set<string>();
    kjvData.forEach((book: KjvBook) => {
      const obj = { book_name: book.book_name, book_id: book.book_id, chapter: book.chapter };
      set.add(JSON.stringify(obj, Object.keys(obj).sort()));
    });
    passageCache = [...set].map((item) => JSON.parse(item));
    return passageCache;
  }
};
```

**Success Criteria:**
- ✅ Navigation works without KJV data loaded
- ✅ API calls are cached
- ✅ Graceful fallback to KJV data if API fails
- ✅ All functions are now async

---

## Phase 3: Update KJV-Specific Functions (1 hour)

**Goal:** Make KJV-specific functions lazy-load data on demand.

### Files to Modify

**`src/api.tsx`**

```typescript
import { loadKjvData } from './utils/kjvDataLoader';

// Remove this line:
// import bibleJson from "./assets/kjv.json";
// export const data = bibleJson as KjvBook[];

/**
 * Get verses for KJV translation
 * Lazy loads KJV data on first call
 */
export const getVersesInKjvChapter = async (
  thebook: string,
  thechapter: number
): Promise<{ verse: number; text: string }[]> => {
  const kjvData = await loadKjvData();
  return kjvData
    .filter((book: KjvBook) => book.book_name === thebook && book.chapter === thechapter)
    .map((book: KjvBook) => ({ verse: book.verse, text: book.text }));
};

/**
 * Get KJV audio URL
 * Lazy loads KJV data to get book index
 */
export const getKjvAudioUrl = async (book: string, chapter: number): Promise<string> => {
  const kjvData = await loadKjvData();
  const books = await getBooks();
  const index = books.findIndex((b) => b.book_name === book);

  if (index === -1) {
    throw new Error(`Book not found: ${book}`);
  }

  return `https://wordpocket.org/bibles/app/audio/1/${index + 1}/${chapter}.mp3`;
};
```

**Success Criteria:**
- ✅ KJV data loads only when needed
- ✅ Functions are async
- ✅ Error handling works

---

## Phase 4: Update Components for Async Navigation (2-3 hours)

**Goal:** Update all components to handle async navigation functions.

### Files to Modify

**`src/components/BibleSelector.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { getBooks, getChapters, getVerses } from "../api";

export default function BibleSelector() {
  const [books, setBooks] = useState<{ book_name: string; book_id: string }[]>([]);
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load books on mount
  useEffect(() => {
    getBooks().then((data) => {
      setBooks(data);
      setLoading(false);
    });
  }, []);

  // Load chapters when book changes
  useEffect(() => {
    if (activeBook) {
      getChapters(activeBook).then(setChapters);
    }
  }, [activeBook]);

  // Load verses when chapter changes
  useEffect(() => {
    if (activeBook && activeChapter) {
      getVerses(activeBook, activeChapter).then(setVerses);
    }
  }, [activeBook, activeChapter]);

  if (loading) {
    return <Loader />;
  }

  // Rest of component...
}
```

**`src/components/SubHeader.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { getPassage } from "../api";

export default function SubHeader() {
  const [passages, setPassages] = useState<{ book_name: string; book_id: string; chapter: number }[]>([]);

  useEffect(() => {
    getPassage().then(setPassages);
  }, []);

  const checkNext = (): number | null => {
    const index = passages.findIndex(
      (book) => book.book_name === activeBook && book.chapter === activeChapter
    );
    return index === -1 || index === passages.length - 1 ? null : index;
  };

  // Rest of component...
}
```

**`src/components/Audio.tsx`**

```typescript
// Update getKjvAudioUrl call to await
if (activeAudioFilesetId === 'ENGKJV') {
  audioUrl = await getKjvAudioUrl(activeBook, activeChapter);
} else {
  audioUrl = await getBibleAudioUrl(activeBook, activeChapter, activeAudioFilesetId);
}
```

**Success Criteria:**
- ✅ Components show loading states
- ✅ Navigation works smoothly
- ✅ No UI flickering
- ✅ Error states handled

---

## Phase 5: Update Tests (2-3 hours)

**Goal:** Update all tests to handle async functions and mock KJV data loader.

### Files to Modify

**`src/__tests__/helpers/factories.ts`**

```typescript
import { vi } from 'vitest';

// Mock KJV data loader
export const mockKjvDataLoader = () => {
  vi.mock('../../utils/kjvDataLoader', () => ({
    loadKjvData: vi.fn().mockResolvedValue([
      // Minimal mock data for tests
      { chapter: 1, verse: 1, text: 'In the beginning...', book_name: 'Genesis', book_id: 'Gen' },
      // Add more as needed
    ]),
    isKjvDataLoaded: vi.fn().mockReturnValue(false),
    clearKjvDataCache: vi.fn(),
  }));
};
```

**`src/api.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as api from './api';

// Mock the KJV data loader
vi.mock('./utils/kjvDataLoader', () => ({
  loadKjvData: vi.fn().mockResolvedValue([
    { chapter: 1, verse: 1, text: 'Test verse', book_name: 'Genesis', book_id: 'Gen' },
  ]),
}));

describe('API Functions', () => {
  it('getBooks should return books from API', async () => {
    const books = await api.getBooks();
    expect(books.length).toBeGreaterThan(0);
  });

  it('getVersesInKjvChapter should lazy load KJV data', async () => {
    const verses = await api.getVersesInKjvChapter('Genesis', 1);
    expect(verses).toBeDefined();
  });
});
```

**Update all component tests:**
- Mock `getBooks()`, `getChapters()`, `getVerses()`, `getPassage()` to return promises
- Add `waitFor()` for async state updates
- Mock `loadKjvData()` in tests that use KJV functions

**Success Criteria:**
- ✅ All tests pass
- ✅ No memory leaks from loading actual KJV data in tests
- ✅ Tests run faster (no 6.8MB file loading)

---

## Phase 6: Add Loading States & Error Handling (1-2 hours)

**Goal:** Ensure smooth UX when KJV data loads for first time.

### Features to Add

1. **Loading indicator** when user first selects KJV
2. **Error toast** if KJV data fails to load
3. **Retry mechanism** for failed loads
4. **Preload option** for users who know they'll use KJV

### Files to Modify

**`src/components/TranslationSelector.tsx`**

```typescript
import { notifications } from '@mantine/notifications';
import { loadKjvData, isKjvDataLoaded } from '../utils/kjvDataLoader';

const handleTranslationChange = async (filesetId: string) => {
  // Preload KJV data if selecting KJV translation
  if (filesetId === 'ENGKJV' && !isKjvDataLoaded()) {
    notifications.show({
      id: 'kjv-loading',
      loading: true,
      title: 'Loading KJV Bible',
      message: 'Downloading King James Version data...',
      autoClose: false,
    });

    try {
      await loadKjvData();
      notifications.update({
        id: 'kjv-loading',
        color: 'green',
        title: 'KJV Bible Loaded',
        message: 'King James Version is ready to use',
        loading: false,
        autoClose: 2000,
      });
    } catch (error) {
      notifications.update({
        id: 'kjv-loading',
        color: 'red',
        title: 'Failed to Load KJV',
        message: 'Please check your connection and try again',
        loading: false,
        autoClose: 5000,
      });
      return; // Don't switch translation if load failed
    }
  }

  setActiveTextFilesetId(filesetId);
};
```

**Success Criteria:**
- ✅ User sees loading notification
- ✅ Errors are handled gracefully
- ✅ Translation doesn't switch if load fails

---

## Phase 7: Optimize Bundle & Verify (1 hour)

**Goal:** Verify bundle size reduction and performance improvements.

### Tasks

1. **Build production bundle**
   ```bash
   npm run build
   ```

2. **Analyze bundle size**
   ```bash
   npx vite-bundle-visualizer
   ```

3. **Verify KJV data is code-split**
   - Check that `kjv.json` is in a separate chunk
   - Verify main bundle doesn't include KJV data

4. **Test in production mode**
   ```bash
   npm run preview
   ```

5. **Performance testing**
   - Measure initial load time (should be ~6.8MB faster)
   - Measure KJV load time on first selection
   - Test with slow 3G connection

**Success Criteria:**
- ✅ Main bundle reduced by ~6.8MB
- ✅ KJV data in separate chunk
- ✅ Initial page load faster
- ✅ KJV loads in <2s on 3G

---

## Expected Outcomes

### Bundle Size Reduction
- **Before:** Main bundle includes 6.8MB KJV data
- **After:** Main bundle excludes KJV data (loaded on demand)
- **Savings:** ~6.8MB initial bundle reduction

### Performance Improvements
- **Initial load:** ~40-60% faster (depending on connection)
- **Memory usage:** Lower baseline (KJV data not in memory unless needed)
- **Test suite:** Faster tests, reduced memory pressure

### User Experience
- **Non-KJV users:** Faster initial load, no wasted bandwidth
- **KJV users:** Small delay on first KJV selection (~1-2s), then cached
- **All users:** Better navigation performance (API-based metadata)

### Test Suite Benefits
- **Memory:** Reduced baseline memory usage
- **Speed:** Tests don't load 6.8MB file unless needed
- **Reliability:** Less likely to hit OOM errors

---

## Implementation Timeline

| Phase | Estimated Time | Priority |
|-------|---------------|----------|
| Phase 1: KJV Data Loader | 1-2 hours | HIGH |
| Phase 2: API Navigation | 2-3 hours | HIGH |
| Phase 3: Update KJV Functions | 1 hour | HIGH |
| Phase 4: Update Components | 2-3 hours | MEDIUM |
| Phase 5: Update Tests | 2-3 hours | MEDIUM |
| Phase 6: Loading States | 1-2 hours | LOW |
| Phase 7: Verify & Optimize | 1 hour | HIGH |
| **Total** | **10-15 hours** | |

---

## Risks & Mitigation

### Risk 1: API Endpoints Don't Exist
**Mitigation:** Fallback to KJV data (lazy-loaded) if API fails. Verify API endpoints before implementation.

### Risk 2: Breaking Changes in Components
**Mitigation:** Comprehensive test coverage, gradual rollout, feature flag for rollback.

### Risk 3: Slow KJV Load on First Use
**Mitigation:** Show loading indicator, cache aggressively, consider preloading option.

### Risk 4: Test Suite Breakage
**Mitigation:** Mock KJV loader in all tests, update tests incrementally, run full suite after each phase.

---

## Alternative Approaches Considered

### Alternative 1: Keep KJV, Add Compression
**Pros:** Simpler implementation
**Cons:** Still sends data to all users, only reduces size by ~70%

### Alternative 2: Move KJV to CDN
**Pros:** Offloads hosting
**Cons:** Still requires download, adds external dependency

### Alternative 3: Server-Side KJV API
**Pros:** No client-side data at all
**Cons:** Requires backend changes, adds latency

**Selected Approach:** Lazy loading with API navigation (best balance of performance and simplicity)

---

## Success Metrics

- [ ] Main bundle size reduced by >6MB
- [ ] Initial page load <2s on 4G
- [ ] KJV load time <2s on first selection
- [ ] All tests pass
- [ ] No regressions in functionality
- [ ] Memory usage in tests reduced by >50%
- [ ] Zero breaking changes for users

---

## Next Steps

1. Review this plan with team
2. Verify API endpoints exist and work as expected
3. Create feature branch: `feature/kjv-lazy-loading`
4. Implement Phase 1 (KJV Data Loader)
5. Test and iterate through remaining phases
