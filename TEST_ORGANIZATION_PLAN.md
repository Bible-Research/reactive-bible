# Test Organization Plan

## Current Problem

The project has **inconsistent and duplicated test organization**:

### Current Structure (Problematic)
```
src/
├── __tests__/              # Some tests here
│   ├── api.test.ts         # ✅ Unique
│   ├── bibleUtils.test.ts  # ❌ DUPLICATE
│   ├── cacheManager.test.ts # ❌ DUPLICATE
│   ├── store.test.ts       # ❌ DUPLICATE (different from src/store.test.ts)
│   ├── helpers.tsx         # ✅ Test utilities
│   └── mocks/              # ✅ Mock data
├── api.test.ts             # ❌ DUPLICATE
├── store.test.ts           # ❌ DUPLICATE (different from __tests__/store.test.ts)
├── App.test.tsx            # ⚠️ Co-located
├── components/
│   ├── Audio.test.tsx      # ⚠️ Co-located
│   ├── AudioPlayer.test.tsx
│   ├── AddTagNoteModal.test.tsx
│   ├── EditNoteModal.test.tsx
│   ├── MyNavbar.test.tsx
│   ├── NoteCard.test.tsx
│   ├── NoteForm.test.tsx
│   ├── NotesView.test.tsx
│   ├── TagSection.test.tsx
│   ├── TranslationSelector.test.tsx
│   └── Verse.test.tsx
└── utils/
    ├── bibleUtils.test.ts  # ❌ DUPLICATE
    └── cacheManager.test.ts # ❌ DUPLICATE
```

### Issues Identified

1. **Duplicate Test Files** 🔴
   - `store.test.ts` exists in both `src/` and `src/__tests__/` (with different content!)
   - `bibleUtils.test.ts` exists in both `src/utils/` and `src/__tests__/`
   - `cacheManager.test.ts` exists in both `src/utils/` and `src/__tests__/`
   - `api.test.ts` exists in both `src/` and `src/__tests__/`

2. **Inconsistent Organization** 🟡
   - Component tests are co-located (next to components)
   - Utility tests are duplicated (both co-located and in `__tests__`)
   - Root-level tests are mixed (some in `__tests__`, some in root)

3. **Confusion** 🟡
   - No clear convention
   - Hard to find tests
   - Risk of running wrong tests

---

## React Testing Best Practices

There are **two main approaches**, both valid:

### Approach 1: Co-located Tests (Recommended for React)
**Used by**: React, Next.js, Vercel, Kent C. Dodds

```
src/
├── components/
│   ├── Button.tsx
│   ├── Button.test.tsx       # ✅ Next to component
│   ├── Modal.tsx
│   └── Modal.test.tsx
├── utils/
│   ├── format.ts
│   └── format.test.ts        # ✅ Next to utility
├── store.ts
├── store.test.ts             # ✅ Next to store
└── __tests__/                # Only for shared test utilities
    ├── setup.ts
    ├── helpers.tsx
    └── mocks/
```

**Pros:**
- ✅ Easy to find related tests
- ✅ Easier to maintain (test moves with code)
- ✅ Better for component-driven development
- ✅ Follows React community standard
- ✅ Works well with hot module replacement

**Cons:**
- ❌ Tests mixed with source code
- ❌ Slightly larger bundle if not configured properly

### Approach 2: Separate Test Directory
**Used by**: Angular, Vue (sometimes), older projects

```
src/
├── components/
│   ├── Button.tsx
│   └── Modal.tsx
├── utils/
│   └── format.ts
└── store.ts

tests/                        # All tests here
├── components/
│   ├── Button.test.tsx
│   └── Modal.test.tsx
├── utils/
│   └── format.test.ts
├── store.test.ts
└── helpers/
```

**Pros:**
- ✅ Clean separation of concerns
- ✅ Easier to exclude from production builds
- ✅ All tests in one place

**Cons:**
- ❌ Harder to find related tests
- ❌ Easy to forget to update tests when moving files
- ❌ Not the React community standard

---

## Recommended Solution

**Use Approach 1: Co-located Tests** (React community standard)

### Why?
1. **Industry Standard**: Used by React, Next.js, Vercel, and most modern React projects
2. **Better DX**: Tests are next to the code they test
3. **Easier Maintenance**: When you move/rename a file, the test is right there
4. **Vercel Alignment**: Vercel's best practices assume co-located tests
5. **Your Project Already Does This**: Component tests are already co-located

---

## Migration Plan

### Step 1: Identify Duplicates and Choose Winners

| File | Location 1 | Location 2 | Winner | Reason |
|------|-----------|-----------|--------|--------|
| `store.test.ts` | `src/` | `src/__tests__/` | `src/` | Matches current state (John vs Genesis) |
| `api.test.ts` | `src/` | `src/__tests__/` | `src/__tests__/` | More comprehensive |
| `bibleUtils.test.ts` | `src/utils/` | `src/__tests__/` | `src/utils/` | Co-located |
| `cacheManager.test.ts` | `src/utils/` | `src/__tests__/` | `src/utils/` | Co-located |

### Step 2: Remove Duplicates

```bash
# Remove duplicates from __tests__
rm src/__tests__/store.test.ts
rm src/__tests__/bibleUtils.test.ts
rm src/__tests__/cacheManager.test.ts

# Remove duplicate from root
rm src/api.test.ts

# Keep only:
# - src/__tests__/api.test.ts (unique, no duplicate)
# - src/store.test.ts (co-located with store.ts)
# - src/utils/*.test.ts (co-located with utilities)
# - src/components/*.test.tsx (already co-located)
```

### Step 3: Final Structure

```
src/
├── __tests__/              # ONLY for shared test utilities
│   ├── helpers.tsx         # ✅ Test helper functions
│   ├── helpers/            # ✅ Additional helpers
│   │   └── mock-data.ts
│   ├── mocks/              # ✅ Mock data and factories
│   │   └── data.ts
│   ├── setup.ts            # ✅ Global test setup (to be created)
│   └── integration/        # ✅ Integration tests (to be created)
│       ├── notes-workflow.test.tsx
│       └── bible-navigation.test.tsx
├── api.tsx
├── api.test.ts             # ✅ Co-located with api.tsx
├── store.ts
├── store.test.ts           # ✅ Co-located with store.ts
├── App.tsx
├── App.test.tsx            # ✅ Co-located with App.tsx
├── components/
│   ├── Audio.tsx
│   ├── Audio.test.tsx      # ✅ Co-located
│   ├── AudioPlayer.tsx
│   ├── AudioPlayer.test.tsx
│   ├── NoteCard.tsx
│   ├── NoteCard.test.tsx
│   └── ... (all other components)
└── utils/
    ├── bibleUtils.ts
    ├── bibleUtils.test.ts  # ✅ Co-located
    ├── cacheManager.ts
    └── cacheManager.test.ts # ✅ Co-located
```

### Step 4: Update Import Paths

After moving files, update import paths in tests:

```typescript
// Before (in src/__tests__/store.test.ts)
import { useBibleStore } from '../store';

// After (in src/store.test.ts)
import { useBibleStore } from './store';
```

---

## Implementation Steps

### Phase 1: Audit and Document (30 minutes)
```bash
# 1. List all test files
find src -name "*.test.ts*" -type f > test-files.txt

# 2. Check for duplicates
sort test-files.txt | uniq -d

# 3. Compare duplicate files
diff src/__tests__/store.test.ts src/store.test.ts
diff src/__tests__/bibleUtils.test.ts src/utils/bibleUtils.test.ts
diff src/__tests__/cacheManager.test.ts src/utils/cacheManager.test.ts
diff src/__tests__/api.test.ts src/api.test.ts
```

### Phase 2: Merge and Remove Duplicates (1 hour)

1. **Merge `store.test.ts`**
   ```bash
   # Keep src/store.test.ts (has correct initial state)
   rm src/__tests__/store.test.ts
   ```

2. **Merge `api.test.ts`**
   ```bash
   # Keep src/__tests__/api.test.ts (more comprehensive)
   # Move it to src/api.test.ts
   mv src/__tests__/api.test.ts src/api.test.ts
   ```

3. **Remove utility test duplicates**
   ```bash
   # Keep co-located versions
   rm src/__tests__/bibleUtils.test.ts
   rm src/__tests__/cacheManager.test.ts
   ```

### Phase 3: Reorganize `__tests__` Directory (30 minutes)

```bash
# Create integration test directory
mkdir -p src/__tests__/integration

# Keep only shared utilities in __tests__
# - helpers.tsx
# - helpers/
# - mocks/
# - setup.ts (to be created)
# - integration/ (for integration tests)
```

### Phase 4: Update Documentation (30 minutes)

Update `DEVELOPER_GUIDE.md` with test organization guidelines.

### Phase 5: Verify (15 minutes)

```bash
# Run all tests to ensure nothing broke
npm test

# Check for any broken imports
npm run build
```

---

## Test File Naming Conventions

Follow these conventions consistently:

### Unit Tests (Co-located)
```
ComponentName.test.tsx      # For React components
functionName.test.ts        # For utilities/functions
ClassName.test.ts           # For classes
```

### Integration Tests (in __tests__/integration/)
```
feature-name.test.tsx       # e.g., notes-workflow.test.tsx
user-flow.test.tsx          # e.g., bible-navigation.test.tsx
```

### Test Utilities (in __tests__/)
```
helpers.tsx                 # Test helper functions
setup.ts                    # Global test setup
mocks/                      # Mock data and factories
```

---

## Vite/Vitest Configuration

Ensure your `vite.config.ts` is configured to find all tests:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      // This pattern finds all .test.* files anywhere in src/
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],
  },
});
```

---

## Benefits of This Organization

### Before (Current State)
- ❌ Duplicate tests causing confusion
- ❌ Tests in 3 different locations
- ❌ Unclear which test is the "source of truth"
- ❌ Risk of running outdated tests
- ❌ Hard to find related tests

### After (Proposed State)
- ✅ Single source of truth for each test
- ✅ Tests next to the code they test
- ✅ Clear separation: co-located tests vs shared utilities
- ✅ Follows React community standards
- ✅ Easier to maintain and navigate
- ✅ Better IDE support (jump to test)

---

## Commands to Execute

```bash
# 1. Remove duplicate tests from __tests__
rm src/__tests__/store.test.ts
rm src/__tests__/bibleUtils.test.ts
rm src/__tests__/cacheManager.test.ts

# 2. Move api.test.ts to root
mv src/__tests__/api.test.ts src/api.test.ts

# 3. Create integration test directory
mkdir -p src/__tests__/integration

# 4. Verify all tests still pass
npm test

# 5. Check for broken imports
npm run build
```

---

## Future Test Organization

### When Adding New Tests

**For Components:**
```bash
# Create test next to component
src/components/NewComponent.tsx
src/components/NewComponent.test.tsx  # ✅ Co-located
```

**For Utilities:**
```bash
# Create test next to utility
src/utils/newUtil.ts
src/utils/newUtil.test.ts  # ✅ Co-located
```

**For Integration Tests:**
```bash
# Create in integration directory
src/__tests__/integration/new-feature.test.tsx  # ✅ Separate
```

**For Test Helpers:**
```bash
# Add to __tests__ directory
src/__tests__/helpers.tsx  # ✅ Shared utility
src/__tests__/mocks/newMock.ts  # ✅ Shared mock
```

---

## References

- [React Testing Library - Where to Put Tests](https://testing-library.com/
  docs/react-testing-library/setup#where-to-put-tests)
- [Kent C. Dodds - Colocation](https://kentcdodds.com/blog/colocation)
- [Next.js Testing Docs](https://nextjs.org/docs/app/building-your-
  application/testing)
- [Vitest Configuration](https://vitest.dev/config/)

---

## Summary

**The Answer to Your Question:**

> "Why some tests are in __tests__ directory and some are in code 
> directories?"

**Because the project has inconsistent organization with duplicates!**

**The Solution:**
1. **Remove duplicates** (keep co-located versions)
2. **Use co-located tests** for all unit tests (React standard)
3. **Use `__tests__/`** only for:
   - Shared test utilities (`helpers.tsx`)
   - Mock data (`mocks/`)
   - Integration tests (`integration/`)
   - Global setup (`setup.ts`)

This follows React community best practices and makes the codebase easier 
to maintain.
