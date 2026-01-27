# Vercel React Best Practices Compliance Plan

**Date:** 2026-01-26  
**Branch:** `tests/add-tests-for-mvp-project-v2`  
**Status:** 📋 Planning Phase  
**Goal:** Address critical gaps identified in TEST_VALIDATION_REPORT.md

---

## Executive Summary

This plan addresses the **4 critical gaps** found when validating the 
test suite against Vercel React best practices. The work is organized 
into 3 phases with clear priorities and time estimates.

**Total Estimated Time:** 8-14 hours  
**Priority:** HIGH (2 critical issues, 2 medium issues)

---

## 📊 Overview

| Phase | Priority | Issues | Est. Time | Impact |
|-------|----------|--------|-----------|--------|
| Phase 1 | 🔴 CRITICAL | 2 | 3-5 hours | High |
| Phase 2 | 🟡 MEDIUM | 1 | 3-4 hours | Medium |
| Phase 3 | 🟢 LOW | 1 | 2-5 hours | Low-Medium |

---

## 🔴 Phase 1: Fix Critical Issues (3-5 hours)

**Priority:** CRITICAL  
**Goal:** Fix violations that have immediate performance impact

### Issue 1.1: Implement localStorage Caching

**Vercel Rule:** `js-cache-storage`  
**Impact:** LOW-MEDIUM (reduces expensive I/O)  
**Estimated Time:** 2-3 hours

#### Problem

`cacheManager.ts` calls `localStorage.getItem()` directly on every 
read, which is synchronous and expensive. Vercel recommends caching 
localStorage reads in memory using a Map.

**Current Code (lines 48-56):**
```typescript
export const getVerseCache = (): VerseCache => {
  try {
    const cache = localStorage.getItem(VERSE_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading verse cache:', error);
    return {};
  }
};
```

#### Solution

Create an in-memory Map cache that sits in front of localStorage:

```typescript
// In-memory cache for localStorage reads
const storageCache = new Map<string, string | null>();

// Invalidate cache on external changes (other tabs)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key) {
      storageCache.delete(e.key);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      storageCache.clear();
    }
  });
}

// Cached localStorage getter
function getCachedLocalStorage(key: string): string | null {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key));
  }
  return storageCache.get(key) ?? null;
}

// Cached localStorage setter
function setCachedLocalStorage(key: string, value: string): void {
  localStorage.setItem(key, value);
  storageCache.set(key, value); // Keep cache in sync
}

// Cached localStorage remover
function removeCachedLocalStorage(key: string): void {
  localStorage.removeItem(key);
  storageCache.delete(key);
}

// Updated getVerseCache
export const getVerseCache = (): VerseCache => {
  try {
    const cache = getCachedLocalStorage(VERSE_CACHE_KEY);
    return cache ? JSON.parse(cache) : {};
  } catch (error) {
    console.error('Error reading verse cache:', error);
    return {};
  }
};
```

#### Implementation Steps

1. **Create storage cache utilities** (30 min)
   - Add `storageCache` Map at module level
   - Implement `getCachedLocalStorage()`
   - Implement `setCachedLocalStorage()`
   - Implement `removeCachedLocalStorage()`
   - Add event listeners for cache invalidation

2. **Refactor cacheManager.ts** (45 min)
   - Replace all `localStorage.getItem()` calls
   - Replace all `localStorage.setItem()` calls
   - Replace all `localStorage.removeItem()` calls
   - Update all 6 cache functions:
     - `getVerseCache()`
     - `setVerseCache()`
     - `getVerseCacheMetadata()`
     - `getTranslationCache()`
     - `setTranslationCache()`
     - `getAudioCache()`
     - `setAudioCache()`
     - `clearVerseCache()`
     - `clearAudioCache()`

3. **Add tests for caching behavior** (45 min)
   - Test that cache is populated on first read
   - Test that subsequent reads use cache (no localStorage call)
   - Test that writes update both cache and localStorage
   - Test cache invalidation on storage events
   - Test cache clearing on visibility change

4. **Update documentation** (30 min)
   - Document caching strategy in DEVELOPER_GUIDE.md
   - Add section on localStorage best practices
   - Explain cache invalidation strategy

#### Files to Modify

- `src/utils/cacheManager.ts` (main changes)
- `src/utils/cacheManager.test.ts` (add cache tests)
- `src/utils/cacheManager.performance.test.ts` (verify performance)
- `DEVELOPER_GUIDE.md` (document pattern)

#### Success Criteria

- ✅ All localStorage reads go through cache
- ✅ Cache invalidates on external changes
- ✅ Tests verify caching behavior
- ✅ Performance tests show no regression
- ✅ All existing tests still pass

---

### Issue 1.2: Add Parallel Async Tests

**Vercel Rule:** `async-parallel`  
**Impact:** CRITICAL (2-10× improvement potential)  
**Estimated Time:** 1-2 hours

#### Problem

No tests validate that independent async operations use 
`Promise.all()` for parallel execution. Sequential awaits can cause 
waterfalls and slow performance.

**Anti-pattern to catch:**
```typescript
// BAD: Sequential (3 round trips)
const user = await fetchUser();
const posts = await fetchPosts();
const comments = await fetchComments();
```

**Correct pattern:**
```typescript
// GOOD: Parallel (1 round trip)
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
]);
```

#### Solution

Create integration tests that verify parallel async operations.

#### Implementation Steps

1. **Audit production code for parallel opportunities** (30 min)
   - Search for sequential `await` statements
   - Identify independent async operations
   - Document current patterns

2. **Create parallel async integration tests** (45 min)
   - Create `src/__tests__/integration/parallel-async.test.tsx`
   - Test that multiple API calls happen in parallel
   - Use MSW to track request timing
   - Verify requests overlap (not sequential)

3. **Refactor production code if needed** (15-30 min)
   - Replace sequential awaits with `Promise.all()`
   - Focus on API calls in components
   - Check `api.tsx` for opportunities

4. **Document pattern** (15 min)
   - Add "Parallel Async Operations" section to DEVELOPER_GUIDE.md
   - Show correct/incorrect examples
   - Explain when to use `Promise.all()`

#### Example Test

```typescript
// src/__tests__/integration/parallel-async.test.tsx
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

const server = setupServer();

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Parallel Async Operations', () => {
  it('should fetch multiple resources in parallel', async () => {
    const timestamps: number[] = [];
    
    server.use(
      http.get('/api/user', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json({ id: 1 });
      }),
      http.get('/api/posts', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json([]);
      }),
      http.get('/api/comments', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json([]);
      })
    );

    const start = Date.now();
    
    // This should use Promise.all()
    const [user, posts, comments] = await Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/posts').then(r => r.json()),
      fetch('/api/comments').then(r => r.json())
    ]);
    
    const duration = Date.now() - start;
    
    // Should complete in ~100ms (parallel), not ~300ms (sequential)
    expect(duration).toBeLessThan(150);
    
    // All requests should start within 10ms of each other
    const maxTimeDiff = Math.max(...timestamps) - 
                        Math.min(...timestamps);
    expect(maxTimeDiff).toBeLessThan(10);
  });
});
```

#### Files to Create/Modify

- `src/__tests__/integration/parallel-async.test.tsx` (new)
- `src/api.tsx` (potentially refactor)
- `DEVELOPER_GUIDE.md` (document pattern)

#### Success Criteria

- ✅ Tests verify parallel execution
- ✅ Production code uses `Promise.all()` where applicable
- ✅ Documentation explains pattern
- ✅ Tests catch sequential await anti-patterns

---

### Issue 1.3: Fix Performance Test Warnings

**Impact:** LOW (code quality)  
**Estimated Time:** 30 minutes

#### Problem

Performance tests show React warnings about state updates not being 
wrapped in `act()`:

```
Warning: An update to PassageView inside a test was not wrapped 
in act(...).
```

#### Solution

Wrap state updates in performance tests with `act()`.

#### Implementation Steps

1. **Fix PassageView.performance.test.tsx** (15 min)
   - Wrap `useBibleStore.setState()` calls in `act()`
   - Ensure no warnings in test output

2. **Fix Passage.performance.test.tsx** (15 min)
   - Wrap `useBibleStore.setState()` calls in `act()`
   - Ensure no warnings in test output

#### Example Fix

**Before:**
```typescript
for (let i = 1; i <= 100; i++) {
  useBibleStore.setState({
    activeChapter: i % 50 + 1,
  });
}
```

**After:**
```typescript
for (let i = 1; i <= 100; i++) {
  act(() => {
    useBibleStore.setState({
      activeChapter: i % 50 + 1,
    });
  });
}
```

#### Files to Modify

- `src/components/PassageView.performance.test.tsx`
- `src/components/Passage.performance.test.tsx`

#### Success Criteria

- ✅ No React warnings in test output
- ✅ All performance tests still pass
- ✅ Performance benchmarks remain accurate

---

## 🟡 Phase 2: Add Memoization Tests (3-4 hours)

**Priority:** MEDIUM  
**Goal:** Validate re-render optimization patterns

### Issue 2.1: Test Re-render Prevention

**Vercel Rule:** `rerender-memo`  
**Impact:** MEDIUM (enables early returns)  
**Estimated Time:** 3-4 hours

#### Problem

No tests validate that components use `React.memo()` or `useMemo()` 
to prevent unnecessary re-renders. Performance tests measure render 
times but don't validate re-render prevention.

#### Solution

Add tests that verify components don't re-render when props/state 
haven't changed.

#### Implementation Steps

1. **Audit components for memoization opportunities** (1 hour)
   - Identify expensive components
   - Check for unnecessary re-renders
   - Document current behavior
   - Components to check:
     - `PassageView` (renders many verses)
     - `Verse` (rendered many times)
     - `NoteCard` (rendered many times)
     - `TagSection` (renders many notes)

2. **Add re-render tracking tests** (1 hour)
   - Create `src/__tests__/helpers/render-tracking.tsx`
   - Add render count tracking utility
   - Test that components don't re-render unnecessarily

3. **Implement memoization if needed** (30 min - 1 hour)
   - Add `React.memo()` to components that benefit
   - Add `useMemo()` for expensive computations
   - Use `useCallback()` for stable callbacks

4. **Add memoization tests** (30 min)
   - Test that memoized components skip re-renders
   - Test that `useMemo()` prevents recalculation
   - Test that props changes trigger re-renders

5. **Document memoization patterns** (30 min)
   - Add "Re-render Optimization" section to DEVELOPER_GUIDE.md
   - Explain when to use `memo()`, `useMemo()`, `useCallback()`
   - Show before/after examples
   - Note: If React Compiler is enabled, manual memoization not 
     needed

#### Example Test

```typescript
// src/components/Verse.rerender.test.tsx
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Verse from './Verse';

let renderCount = 0;

// Wrap Verse to track renders
const TrackedVerse = React.memo(({ verse, text }: any) => {
  renderCount++;
  return <Verse verse={verse} text={text} />;
});

describe('Verse Re-render Tests', () => {
  it('should not re-render when parent re-renders with same props', 
    () => {
    const TestComponent = () => {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button onClick={() => setCount(c => c + 1)}>
            Increment
          </button>
          <TrackedVerse verse={1} text="Test verse" />
        </div>
      );
    };

    renderCount = 0;
    const { getByRole } = render(<TestComponent />);
    
    expect(renderCount).toBe(1); // Initial render
    
    // Parent re-renders, but Verse props unchanged
    getByRole('button').click();
    
    expect(renderCount).toBe(1); // Should NOT re-render
  });
});
```

#### Example Implementation

```typescript
// src/components/Verse.tsx
import React, { memo } from 'react';

interface VerseProps {
  verse: number;
  text: string;
  // ... other props
}

// Wrap in memo to prevent unnecessary re-renders
const Verse = memo(function Verse({ verse, text }: VerseProps) {
  return (
    <div className="verse">
      <span className="verse-number">{verse}</span>
      <span className="verse-text">{text}</span>
    </div>
  );
});

export default Verse;
```

#### Files to Create/Modify

- `src/__tests__/helpers/render-tracking.tsx` (new)
- `src/components/Verse.rerender.test.tsx` (new)
- `src/components/NoteCard.rerender.test.tsx` (new)
- `src/components/Verse.tsx` (potentially add memo)
- `src/components/NoteCard.tsx` (potentially add memo)
- `DEVELOPER_GUIDE.md` (document patterns)

#### Success Criteria

- ✅ Tests verify re-render prevention
- ✅ Components use `memo()` where beneficial
- ✅ Expensive computations use `useMemo()`
- ✅ Documentation explains when to memoize
- ✅ Performance tests show improvement

---

## 🟢 Phase 3: Evaluate Request Deduplication (2-5 hours)

**Priority:** LOW-MEDIUM  
**Goal:** Assess and potentially implement SWR or alternative

### Issue 3.1: Request Deduplication Strategy

**Vercel Rule:** `client-swr-dedup`  
**Impact:** MEDIUM-HIGH (automatic deduplication)  
**Estimated Time:** 2-5 hours (depending on decision)

#### Problem

No automatic request deduplication. Multiple component instances may 
fetch the same data independently. Current caching is manual 
(localStorage-based).

#### Solution Options

**Option A: Implement SWR** (4-5 hours)
- Install `swr` package
- Refactor components to use `useSWR()`
- Get automatic deduplication, caching, revalidation
- More work but better long-term

**Option B: Manual Deduplication** (2-3 hours)
- Create request deduplication utility
- Track in-flight requests
- Return existing promise if request pending
- Less work but more maintenance

**Option C: Document Current Approach** (30 min)
- Document why SWR isn't used
- Explain manual caching strategy
- Note trade-offs
- Defer to future work

#### Recommendation

Start with **Option C** (document current approach), then evaluate 
**Option A** (SWR) for future work. SWR is a significant architectural 
change that requires careful planning.

#### Implementation Steps (Option C)

1. **Document current caching strategy** (20 min)
   - Explain localStorage-based caching
   - Note that it's manual, not automatic
   - Explain when cache is invalidated

2. **Document why SWR isn't used** (10 min)
   - Architectural decision
   - Trade-offs considered
   - Future consideration

3. **Add to future roadmap** (5 min)
   - Create issue for SWR evaluation
   - Note as potential Phase 5

#### Files to Modify

- `DEVELOPER_GUIDE.md` (document strategy)
- `TODO.md` or GitHub issues (future work)

#### Success Criteria (Option C)

- ✅ Current approach documented
- ✅ Trade-offs explained
- ✅ Future work noted

---

## 📋 Implementation Checklist

### Phase 1: Critical Issues (3-5 hours)

- [ ] **Issue 1.1: localStorage Caching** (2-3 hours)
  - [ ] Create storage cache utilities
  - [ ] Refactor cacheManager.ts
  - [ ] Add caching behavior tests
  - [ ] Update documentation
  - [ ] Verify all tests pass

- [ ] **Issue 1.2: Parallel Async Tests** (1-2 hours)
  - [ ] Audit production code
  - [ ] Create parallel async tests
  - [ ] Refactor code if needed
  - [ ] Document pattern
  - [ ] Verify tests catch anti-patterns

- [ ] **Issue 1.3: Fix Test Warnings** (30 min)
  - [ ] Fix PassageView.performance.test.tsx
  - [ ] Fix Passage.performance.test.tsx
  - [ ] Verify no warnings

### Phase 2: Memoization (3-4 hours)

- [ ] **Issue 2.1: Re-render Tests** (3-4 hours)
  - [ ] Audit components
  - [ ] Create render tracking utility
  - [ ] Implement memoization
  - [ ] Add re-render tests
  - [ ] Document patterns

### Phase 3: Request Deduplication (30 min - 5 hours)

- [ ] **Issue 3.1: Deduplication Strategy** (choose one)
  - [ ] Option A: Implement SWR (4-5 hours)
  - [ ] Option B: Manual deduplication (2-3 hours)
  - [ ] Option C: Document current approach (30 min) ⭐ Recommended

---

## 🎯 Recommended Execution Order

### Week 1: Critical Fixes

**Day 1-2: localStorage Caching** (2-3 hours)
- Highest impact per time invested
- Improves performance immediately
- Low risk, well-defined scope

**Day 2-3: Parallel Async Tests** (1-2 hours)
- Catches critical performance issues
- Prevents future regressions
- Establishes best practice

**Day 3: Fix Test Warnings** (30 min)
- Quick win
- Improves code quality
- No functional changes

### Week 2: Optimization

**Day 1-2: Memoization Tests** (3-4 hours)
- Medium priority
- Measurable performance impact
- Good learning opportunity

**Day 3: Document Deduplication** (30 min)
- Low effort
- Clarifies architecture
- Sets up future work

---

## 📊 Success Metrics

### Phase 1 Complete

- ✅ localStorage reads cached in memory
- ✅ Tests verify parallel async operations
- ✅ No React warnings in test output
- ✅ All tests passing (102+)
- ✅ Documentation updated

### Phase 2 Complete

- ✅ Components use memoization where beneficial
- ✅ Tests verify re-render prevention
- ✅ Performance improvement measurable
- ✅ Patterns documented

### Phase 3 Complete

- ✅ Deduplication strategy documented
- ✅ Architecture decisions explained
- ✅ Future work planned

### Overall Success

- ✅ Vercel compliance: 40% → 70%+
- ✅ 2 critical issues resolved
- ✅ 1 medium issue resolved
- ✅ 1 medium issue documented
- ✅ Test suite remains robust
- ✅ Performance improved

---

## 🚀 Getting Started

### Prerequisites

- Current branch: `tests/add-tests-for-mvp-project-v2`
- All current tests passing (102 tests)
- TEST_VALIDATION_REPORT.md reviewed

### Step 1: Create New Branch

```bash
git checkout -b feature/vercel-compliance
```

### Step 2: Start with Phase 1.1

Begin with localStorage caching as it has the highest impact per time 
invested.

### Step 3: Test After Each Change

```bash
npm test
```

Ensure all tests pass before moving to next issue.

### Step 4: Update Documentation

Keep DEVELOPER_GUIDE.md updated as you implement each fix.

### Step 5: Track Progress

Update this file's checkboxes as you complete each task.

---

## 📚 References

- [Vercel React Best Practices](/.windsurf/skills/vercel-react-best-practices/SKILL.md)
- [TEST_VALIDATION_REPORT.md](./TEST_VALIDATION_REPORT.md)
- [TEST_SUITE_ROADMAP.md](./TEST_SUITE_ROADMAP.md)
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

---

## ❓ Questions or Issues?

If you encounter issues during implementation:

1. Review TEST_VALIDATION_REPORT.md for detailed context
2. Check Vercel best practices documentation
3. Run tests frequently to catch regressions early
4. Update this plan if scope changes

---

**Created:** 2026-01-26  
**Status:** 📋 Ready to Execute  
**Next Action:** Create feature branch and start Phase 1.1
