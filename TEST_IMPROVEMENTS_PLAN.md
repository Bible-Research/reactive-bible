# Test Suite Improvements Plan

## Overview
This document outlines improvements needed for the test suite to align with 
Vercel React Best Practices and modern testing standards.

## Current State Analysis

### ✅ Good Practices Already Implemented
1. **Test Isolation**: Using `beforeEach()` and `afterEach()` for cleanup
2. **Mock Management**: Proper use of `vi.clearAllMocks()` and 
   `vi.restoreAllMocks()`
3. **Async Handling**: Using `act()` and `waitFor()` for async operations
4. **Helper Functions**: Created comprehensive test helpers in 
   `__tests__/helpers.tsx`
5. **Mock Data**: Centralized mock data in `__tests__/mocks/data.ts`
6. **Store Testing**: Direct testing of Zustand store with proper isolation

### ❌ Issues Found

#### 0. **Inconsistent Test Organization with Duplicates**
**Priority: CRITICAL**
**Impact: Confusion, maintenance burden, risk of running wrong tests**

**Problem:**
- Test files exist in multiple locations (duplicates)
- `store.test.ts` exists in both `src/` and `src/__tests__/` with DIFFERENT content
- `api.test.ts`, `bibleUtils.test.ts`, `cacheManager.test.ts` are duplicated
- No clear convention: some tests co-located, some in `__tests__/`, some in both
- Risk of running outdated or wrong tests

**Current Structure:**
```
src/
├── __tests__/
│   ├── api.test.ts         # Duplicate
│   ├── store.test.ts       # Duplicate (different!)
│   ├── bibleUtils.test.ts  # Duplicate
│   └── cacheManager.test.ts # Duplicate
├── api.test.ts             # Duplicate
├── store.test.ts           # Duplicate (different!)
├── utils/
│   ├── bibleUtils.test.ts  # Duplicate
│   └── cacheManager.test.ts # Duplicate
└── components/
    └── *.test.tsx          # Co-located (good!)
```

**React Best Practice:**
- **Co-locate tests** with the code they test (industry standard)
- Use `__tests__/` ONLY for shared utilities, mocks, and integration tests
- This is the approach used by React, Next.js, Vercel, and Kent C. Dodds

**Recommended Fix:**
1. Remove all duplicate test files
2. Keep co-located tests (next to source files)
3. Move `api.test.ts` to `src/api.test.ts`
4. Keep `__tests__/` only for:
   - `helpers.tsx` (shared test utilities)
   - `mocks/` (mock data)
   - `integration/` (integration tests)
   - `setup.ts` (global setup)

**Commands to Fix:**
```bash
rm src/__tests__/store.test.ts
rm src/__tests__/bibleUtils.test.ts
rm src/__tests__/cacheManager.test.ts
mv src/__tests__/api.test.ts src/api.test.ts
mkdir -p src/__tests__/integration
```

**See:** `TEST_ORGANIZATION_PLAN.md` for detailed migration guide

**Files Affected:**
- All duplicate test files
- Test configuration
- Documentation

---

#### 1. **Excessive Mocking (Anti-Pattern)**
**Priority: HIGH**
**Impact: Test reliability and maintainability**

**Problem:**
- Every test file mocks dependencies at module level using `vi.mock()`
- Mocks are defined globally, making tests brittle and hard to maintain
- Violates "test what you ship" principle
- Makes refactoring difficult

**Examples:**
```typescript
// src/components/NotesView.test.tsx
vi.mock('../api', () => ({
  getTags: vi.fn(),
}));

vi.mock('./TagSection', () => ({
  default: ({ tagName, notes }: any) => (
    <div data-testid="tag-section">
      <h3>{tagName}</h3>
      <div>{notes.length} notes</div>
    </div>
  ),
}));
```

**Vercel Best Practice Violation:**
- Not directly covered, but relates to `rerender-memo` and component 
  composition
- Over-mocking prevents testing real component interactions

**Recommended Fix:**
1. Mock only at boundaries (API calls, external libraries)
2. Use real components when possible
3. Create integration tests that test component trees together
4. Use MSW (Mock Service Worker) for API mocking instead of `vi.mock()`

**Files Affected:**
- `src/components/NotesView.test.tsx`
- `src/components/AddTagNoteModal.test.tsx`
- `src/components/EditNoteModal.test.tsx`
- `src/components/Audio.test.tsx`
- `src/components/TagSection.test.tsx`

---

#### 2. **Redundant Async Wrappers**
**Priority: MEDIUM**
**Impact: Code verbosity and readability**

**Problem:**
- Excessive use of `act()` wrapping for simple renders
- Multiple `waitFor()` calls that could be combined
- Unnecessary `afterEach()` with empty promise resolution

**Example:**
```typescript
// NotesView.test.tsx
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

it('should display loading state initially', async () => {
  mockFetchNotes.mockImplementation(() => new Promise(() => {}));
  
  await act(async () => {
    render(<NotesView onViewInBible={mockOnViewInBible} />);
  });
  
  expect(screen.getByLabelText('loading')).toBeInTheDocument();
});
```

**Vercel Best Practice Relation:**
- Relates to `async-parallel` - unnecessary sequential awaits
- Relates to `js-early-exit` - could return early instead of nesting

**Recommended Fix:**
1. Remove unnecessary `act()` wrappers for synchronous renders
2. Use `renderWithProviders()` helper instead of manual wrapping
3. Combine multiple `waitFor()` calls into single assertions
4. Remove empty `afterEach()` hooks if not needed

**Files Affected:**
- `src/components/NotesView.test.tsx`
- `src/components/AddTagNoteModal.test.tsx`
- `src/components/EditNoteModal.test.tsx`

---

#### 3. **Missing Test Coverage for Performance Patterns**
**Priority: MEDIUM**
**Impact: Performance validation**

**Problem:**
- No tests verify memoization behavior
- No tests for re-render optimization
- No tests for cache hit/miss scenarios
- Missing tests for localStorage caching behavior

**Vercel Best Practice Violations:**
- `rerender-memo` - Not testing memo effectiveness
- `client-localstorage-schema` - Not testing cache schema
- `js-cache-storage` - Not validating cache reads

**Recommended Fix:**
1. Add tests that verify components don't re-render unnecessarily
2. Test cache hit/miss scenarios explicitly
3. Add performance regression tests
4. Test localStorage schema and invalidation

**New Test Files Needed:**
- `src/utils/cacheManager.performance.test.ts`
- `src/components/Verse.memo.test.tsx`
- `src/store.performance.test.ts`

---

#### 4. **Inline Mock Implementations**
**Priority: MEDIUM**
**Impact: Code duplication and maintainability**

**Problem:**
- Mock implementations are duplicated across test files
- Inline JSX mocks make tests harder to read
- No shared mock factory functions

**Example:**
```typescript
// Duplicated in multiple files
vi.mock('./TagSection', () => ({
  default: ({ tagName, notes }: any) => (
    <div data-testid="tag-section">
      <h3>{tagName}</h3>
      <div>{notes.length} notes</div>
    </div>
  ),
}));
```

**Vercel Best Practice Relation:**
- `js-cache-function-results` - Mock factories should be cached
- `rerender-hoist-jsx` - Mock JSX should be hoisted

**Recommended Fix:**
1. Create shared mock factories in `__tests__/mocks/components.tsx`
2. Export reusable mock implementations
3. Use factory functions for complex mocks

**New Files Needed:**
- `src/__tests__/mocks/components.tsx`
- `src/__tests__/mocks/api.ts`

---

#### 5. **Store State Management in Tests**
**Priority: LOW-MEDIUM**
**Impact: Test isolation and reliability**

**Problem:**
- Direct store manipulation in tests
- Store state not always reset properly
- Potential for test pollution

**Example:**
```typescript
beforeEach(() => {
  useBibleStore.setState({
    ...initialStoreState,
    notes: [],
    fetchNotes: mockFetchNotes,
  });
});
```

**Vercel Best Practice Relation:**
- `rerender-functional-setstate` - Should use functional updates
- `js-cache-storage` - Store persistence could leak between tests

**Recommended Fix:**
1. Always use `resetStore()` helper from `__tests__/helpers.tsx`
2. Clear localStorage between tests
3. Use store snapshots for complex scenarios
4. Add store state validation in `afterEach()`

**Files Affected:**
- All component test files using `useBibleStore`

---

#### 6. **Missing Integration Tests**
**Priority: HIGH**
**Impact: Real-world behavior validation**

**Problem:**
- Only unit tests exist
- No tests for complete user flows
- No tests for component interaction
- Missing E2E-style tests

**Vercel Best Practice Relation:**
- `async-suspense-boundaries` - Need to test loading states
- `client-swr-dedup` - Need to test request deduplication
- `server-parallel-fetching` - Need to test parallel data loading

**Recommended Fix:**
1. Create integration test suite
2. Test complete user journeys (e.g., create note → edit → delete)
3. Test navigation flows
4. Test error recovery scenarios

**New Test Files Needed:**
- `src/__tests__/integration/notes-workflow.test.tsx`
- `src/__tests__/integration/bible-navigation.test.tsx`
- `src/__tests__/integration/audio-playback.test.tsx`

---

#### 7. **Inconsistent Test Structure**
**Priority: LOW**
**Impact: Readability and maintainability**

**Problem:**
- Some tests use `describe()` blocks, others don't
- Inconsistent naming conventions
- Mix of test styles (unit vs integration)

**Example:**
```typescript
// Some files have nested describes
describe('API Functions', () => {
  describe('Local Data Functions', () => {
    // tests
  });
});

// Others are flat
describe('NoteCard Component', () => {
  it('should render correctly', () => {});
  it('should call onEdit', () => {});
});
```

**Recommended Fix:**
1. Standardize on nested `describe()` blocks
2. Use consistent naming: "Component/Function Name > Feature > Behavior"
3. Group related tests together
4. Add test documentation comments

---

## Implementation Plan

### Phase 1: Critical Fixes (Week 1)
**Priority: HIGH - Must fix before production**

1. **Reduce Over-Mocking**
   - [ ] Install MSW for API mocking
   - [ ] Create MSW handlers in `src/__tests__/mocks/handlers.ts`
   - [ ] Replace `vi.mock('../api')` with MSW in all component tests
   - [ ] Remove component mocks where real components can be used
   - [ ] Update `NotesView.test.tsx` to use real `TagSection`
   - [ ] Update `TagSection.test.tsx` to use real `NoteCard`

2. **Add Integration Tests**
   - [ ] Create `src/__tests__/integration/` directory
   - [ ] Write notes workflow integration test
   - [ ] Write bible navigation integration test
   - [ ] Add test for cache behavior across components

### Phase 2: Performance & Optimization (Week 2)
**Priority: MEDIUM - Important for quality**

3. **Add Performance Tests**
   - [ ] Create `cacheManager.performance.test.ts`
   - [ ] Test cache hit/miss scenarios
   - [ ] Test localStorage read/write patterns
   - [ ] Add re-render counting tests for memoized components

4. **Refactor Async Handling**
   - [ ] Remove unnecessary `act()` wrappers
   - [ ] Simplify `afterEach()` cleanup
   - [ ] Use `renderWithProviders()` consistently
   - [ ] Combine multiple `waitFor()` calls

### Phase 3: Code Quality (Week 3)
**Priority: LOW-MEDIUM - Nice to have**

5. **Create Shared Mocks**
   - [ ] Create `src/__tests__/mocks/components.tsx`
   - [ ] Create `src/__tests__/mocks/api.ts`
   - [ ] Extract common mock factories
   - [ ] Update all tests to use shared mocks

6. **Improve Store Testing**
   - [ ] Always use `resetStore()` helper
   - [ ] Add localStorage cleanup
   - [ ] Add store state validation
   - [ ] Test store persistence behavior

7. **Standardize Test Structure**
   - [ ] Add nested `describe()` blocks
   - [ ] Standardize test naming
   - [ ] Add test documentation
   - [ ] Group related tests

### Phase 4: Documentation (Week 4)
**Priority: LOW - Maintenance**

8. **Update Documentation**
   - [ ] Update `DEVELOPER_GUIDE.md` with testing guidelines
   - [ ] Create `TESTING.md` with examples
   - [ ] Document mock patterns
   - [ ] Add performance testing guide

---

## Specific File Changes

### High Priority Files

#### `src/components/NotesView.test.tsx`
**Changes needed:**
1. Replace `vi.mock('../api')` with MSW handlers
2. Use real `TagSection` component instead of mock
3. Remove unnecessary `act()` wrappers
4. Simplify `afterEach()` cleanup
5. Add integration test for tag switching

#### `src/components/NoteCard.test.tsx`
**Changes needed:**
1. Fix delete note test (currently has logic error)
2. Add test for confirmation dialog cancellation
3. Test fetchNotes refresh after delete
4. Use real `Verse` component

#### `src/__tests__/api.test.ts`
**Changes needed:**
1. Add tests for cache invalidation
2. Test parallel API calls
3. Test error recovery
4. Add performance benchmarks

#### `src/__tests__/store.test.ts`
**Changes needed:**
1. Test localStorage persistence
2. Test store hydration
3. Add performance tests for large note lists
4. Test concurrent state updates

---

## New Files to Create

### `src/__tests__/setup.ts`
```typescript
// Global test setup
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### `src/__tests__/mocks/handlers.ts`
```typescript
// MSW handlers for API mocking
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://bibleresearchapi.vercel.app/api/v1/tags/', () => {
    return HttpResponse.json([
      { id: '1', name: 'Faith', parent_tag: null },
    ]);
  }),
  // ... more handlers
];
```

### `src/__tests__/mocks/components.tsx`
```typescript
// Shared component mocks
export const MockTagSection = ({ tagName, notes }: any) => (
  <div data-testid="tag-section">
    <h3>{tagName}</h3>
    <div>{notes.length} notes</div>
  </div>
);
```

### `src/__tests__/integration/notes-workflow.test.tsx`
```typescript
// Integration test for complete notes workflow
describe('Notes Workflow', () => {
  it('should create, edit, and delete a note', async () => {
    // Test complete user journey
  });
});
```

---

## Vercel Best Practices Alignment

### Currently Violated Rules

1. **`async-parallel`** - Sequential awaits in tests
   - Fix: Combine independent async operations
   
2. **`js-cache-storage`** - No localStorage cache testing
   - Fix: Add cache validation tests

3. **`rerender-memo`** - No memoization testing
   - Fix: Add re-render counting tests

4. **`client-swr-dedup`** - No request deduplication testing
   - Fix: Test that duplicate requests are deduplicated

### Rules to Implement in Tests

1. **`async-defer-await`** - Move awaits into branches
2. **`js-early-exit`** - Return early in test helpers
3. **`js-cache-function-results`** - Cache mock factories
4. **`rerender-dependencies`** - Test dependency arrays

---

## Success Metrics

### Before Implementation
- Test files: 20
- Total tests: ~80
- Mocked modules: 30+
- Integration tests: 0
- Performance tests: 0
- Test coverage: ~60%

### After Implementation (Target)
- Test files: 30
- Total tests: ~150
- Mocked modules: 10 (only external APIs)
- Integration tests: 10+
- Performance tests: 5+
- Test coverage: 80%+

### Quality Metrics
- Reduce test brittleness (fewer mock updates needed)
- Faster test execution (less mocking overhead)
- Better real-world coverage
- Easier to maintain and extend

---

## Timeline

- **Week 1**: Phase 1 (Critical Fixes) - MSW setup, reduce mocking
- **Week 2**: Phase 2 (Performance) - Add performance tests
- **Week 3**: Phase 3 (Code Quality) - Refactor and standardize
- **Week 4**: Phase 4 (Documentation) - Update docs and guides

**Total Estimated Effort**: 4 weeks (part-time)

---

## Notes

1. **Breaking Changes**: Minimal - tests are internal
2. **Dependencies**: Need to add `msw` package
3. **Backward Compatibility**: All existing tests will continue to work
4. **Risk**: Low - only affects test code

---

## References

- [Vercel React Best Practices](/.windsurf/skills/vercel-react-best-practices/)
- [Testing Library Best Practices](https://testing-library.com/docs/
  guiding-principles/)
- [MSW Documentation](https://mswjs.io/)
- [Vitest Best Practices](https://vitest.dev/guide/best-practices.html)
