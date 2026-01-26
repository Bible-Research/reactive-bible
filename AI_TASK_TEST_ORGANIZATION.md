# AI Task: Fix Test Organization - Remove Duplicates

## Task Overview

**Objective:** Reorganize test files to follow React best practices (co-location) 
and remove all duplicate test files.

**Priority:** CRITICAL (Must be done first before other test improvements)

**Estimated Time:** 1-2 hours

**Risk Level:** LOW (file operations only, no code changes)

**Success Criteria:**
- ✅ No duplicate test files exist
- ✅ All tests are co-located with their source files
- ✅ `__tests__/` contains only shared utilities
- ✅ All tests pass after reorganization
- ✅ Documentation updated

---

## Context

The project currently has duplicate test files in multiple locations:
- `store.test.ts` exists in both `src/` and `src/__tests__/` with DIFFERENT 
  content
- `api.test.ts`, `bibleUtils.test.ts`, `cacheManager.test.ts` are duplicated
- This causes confusion and risks running outdated tests

**Goal:** Follow React community standard of co-locating tests with source code.

---

## Step-by-Step Implementation Guide

### Step 1: Audit Current Test Files (10 minutes)

**Action:** List all test files and identify duplicates

```bash
# List all test files
find src -name "*.test.ts*" -type f | sort

# Expected output will show duplicates
```

**Expected Files:**
```
src/__tests__/api.test.ts
src/__tests__/bibleUtils.test.ts
src/__tests__/cacheManager.test.ts
src/__tests__/store.test.ts
src/api.test.ts
src/store.test.ts
src/utils/bibleUtils.test.ts
src/utils/cacheManager.test.ts
src/components/*.test.tsx (multiple files)
```

**Document your findings:**
Create a checklist of which files are duplicates and which to keep.

---

### Step 2: Compare Duplicate Files (15 minutes)

**Action:** Compare each duplicate to determine which version to keep

#### 2.1 Compare `store.test.ts`

```bash
diff src/__tests__/store.test.ts src/store.test.ts
```

**Decision:** Keep `src/store.test.ts`
- **Reason:** Has correct initial state (`activeBook: "John"`)
- **Action:** Delete `src/__tests__/store.test.ts`

#### 2.2 Compare `api.test.ts`

```bash
diff src/__tests__/api.test.ts src/api.test.ts
```

**Decision:** Keep `src/__tests__/api.test.ts`
- **Reason:** More comprehensive tests
- **Action:** Delete `src/api.test.ts`, then move `src/__tests__/api.test.ts` 
  to `src/api.test.ts`

#### 2.3 Compare `bibleUtils.test.ts`

```bash
diff src/__tests__/bibleUtils.test.ts src/utils/bibleUtils.test.ts
```

**Decision:** Keep `src/utils/bibleUtils.test.ts`
- **Reason:** Co-located with source file (best practice)
- **Action:** Delete `src/__tests__/bibleUtils.test.ts`

#### 2.4 Compare `cacheManager.test.ts`

```bash
diff src/__tests__/cacheManager.test.ts src/utils/cacheManager.test.ts
```

**Decision:** Keep `src/utils/cacheManager.test.ts`
- **Reason:** Co-located with source file (best practice)
- **Action:** Delete `src/__tests__/cacheManager.test.ts`

**⚠️ IMPORTANT:** If any duplicate has significantly different or better tests, 
merge the best parts before deleting!

---

### Step 3: Remove Duplicate Files (5 minutes)

**Action:** Execute file deletions

```bash
# Navigate to project root
cd /Users/tedis.rozenfelds/personal_data/p_projects/reactive-bible

# Remove duplicates from __tests__
rm src/__tests__/store.test.ts
rm src/__tests__/bibleUtils.test.ts
rm src/__tests__/cacheManager.test.ts

# Remove duplicate from root (will be replaced by __tests__ version)
rm src/api.test.ts
```

**Verification:**
```bash
# Verify files are deleted
ls src/__tests__/*.test.ts
# Should only show: api.test.ts

ls src/*.test.ts*
# Should only show: store.test.ts, App.test.tsx

ls src/utils/*.test.ts
# Should show: bibleUtils.test.ts, cacheManager.test.ts
```

---

### Step 4: Move `api.test.ts` to Root (5 minutes)

**Action:** Move API test to be co-located with `api.tsx`

```bash
# Move api.test.ts from __tests__ to src root
mv src/__tests__/api.test.ts src/api.test.ts
```

**Update import paths in the moved file:**

Open `src/api.test.ts` and update imports:

**Before:**
```typescript
import * as api from '../api';
import * as cacheManager from '../utils/cacheManager';
```

**After:**
```typescript
import * as api from './api';
import * as cacheManager from './utils/cacheManager';
```

**Save the file.**

---

### Step 5: Create Integration Test Directory (2 minutes)

**Action:** Create directory structure for future integration tests

```bash
# Create integration test directory
mkdir -p src/__tests__/integration

# Create a README to document the purpose
cat > src/__tests__/integration/README.md << 'EOF'
# Integration Tests

This directory contains integration tests that test multiple components 
working together.

## Guidelines

- Test complete user workflows (e.g., create → edit → delete note)
- Test component interactions
- Test data flow between components
- Use real components (minimal mocking)

## Examples

- `notes-workflow.test.tsx` - Complete notes CRUD workflow
- `bible-navigation.test.tsx` - Navigation between books/chapters
- `audio-playback.test.tsx` - Audio player integration

## Naming Convention

Use descriptive names: `feature-name.test.tsx`
EOF
```

---

### Step 6: Verify Test Structure (5 minutes)

**Action:** Confirm the new structure is correct

```bash
# List final structure
find src -name "*.test.ts*" -type f | sort
```

**Expected Output:**
```
src/App.test.tsx
src/api.test.ts
src/store.test.ts
src/components/AddTagNoteModal.test.tsx
src/components/Audio.test.tsx
src/components/AudioPlayer.test.tsx
src/components/EditNoteModal.test.tsx
src/components/MyNavbar.test.tsx
src/components/NoteCard.test.tsx
src/components/NoteForm.test.tsx
src/components/NotesView.test.tsx
src/components/TagSection.test.tsx
src/components/TranslationSelector.test.tsx
src/components/Verse.test.tsx
src/utils/bibleUtils.test.ts
src/utils/cacheManager.test.ts
```

**Verify `__tests__/` only contains utilities:**
```bash
ls -la src/__tests__/
```

**Expected Contents:**
```
helpers.tsx          # Test helper functions
helpers/             # Additional helpers
mocks/               # Mock data
integration/         # Integration tests (empty for now)
```

**✅ Success:** No `.test.ts` files should be in `__tests__/` anymore!

---

### Step 7: Run All Tests (10 minutes)

**Action:** Verify all tests still pass

```bash
# Run all tests
npm test

# If tests fail, check for import path issues
# Common issue: relative imports may need adjustment
```

**Expected Result:** All tests should pass ✅

**If tests fail:**
1. Check error messages for import path issues
2. Update relative imports in moved files
3. Verify file paths are correct
4. Re-run tests

---

### Step 8: Update Documentation (20 minutes)

**Action:** Update `DEVELOPER_GUIDE.md` with test organization guidelines

Open `DEVELOPER_GUIDE.md` and add/update the testing section:

```markdown
## Testing Guidelines

### Test Organization

We follow React community best practices for test organization:

#### Co-located Tests (Preferred)

Place test files next to the code they test:

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx      ✅ Co-located
├── utils/
│   ├── format.ts
│   └── format.test.ts       ✅ Co-located
├── api.tsx
├── api.test.ts              ✅ Co-located
├── store.ts
└── store.test.ts            ✅ Co-located
```

#### Shared Test Utilities

The `__tests__/` directory is ONLY for shared test utilities:

```
src/__tests__/
├── helpers.tsx              # Test helper functions
├── helpers/                 # Additional helpers
├── mocks/                   # Mock data and factories
├── integration/             # Integration tests
└── setup.ts                 # Global test setup (if needed)
```

#### Test File Naming

- **Components:** `ComponentName.test.tsx`
- **Utilities:** `functionName.test.ts`
- **Integration:** `feature-name.test.tsx` (in `__tests__/integration/`)

#### Adding New Tests

**For a new component:**
```bash
# Create component and test together
src/components/NewComponent.tsx
src/components/NewComponent.test.tsx
```

**For a new utility:**
```bash
# Create utility and test together
src/utils/newUtil.ts
src/utils/newUtil.test.ts
```

**For an integration test:**
```bash
# Create in integration directory
src/__tests__/integration/new-feature.test.tsx
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/components/Button.test.tsx

# Run tests with coverage
npm test -- --coverage
```

### Test Configuration

Tests are configured in `vite.config.ts`:

```typescript
test: {
  globals: true,
  environment: 'happy-dom',
  setupFiles: ['./src/__tests__/setup.ts'],
  include: [
    'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
  ],
}
```

This configuration finds all `.test.*` files anywhere in `src/`.
```

**Save the file.**

---

### Step 9: Update Vite Config (5 minutes)

**Action:** Ensure Vite is configured to find all test files

Open `vite.config.ts` and verify the test configuration:

```typescript
export default defineConfig({
  // ... other config
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'], // Optional, create if needed
    include: [
      // This pattern finds all .test.* files anywhere in src/
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
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

**If `setupFiles` is specified but doesn't exist, create it:**

```bash
cat > src/__tests__/setup.ts << 'EOF'
// Global test setup
import { beforeAll, afterEach, afterAll } from 'vitest';

// Mock DOM APIs that aren't available in happy-dom
beforeAll(() => {
  // Mock scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = () => {};
  
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

// Clean up after each test
afterEach(() => {
  // Clear any mocks
  // localStorage.clear(); // Uncomment if using localStorage
});
EOF
```

---

### Step 10: Final Verification (10 minutes)

**Action:** Complete final checks

#### 10.1 Run Full Test Suite

```bash
npm test
```

**✅ Expected:** All tests pass

#### 10.2 Check for Broken Imports

```bash
npm run build
```

**✅ Expected:** Build succeeds without errors

#### 10.3 Verify No Duplicates Remain

```bash
# Check for any remaining duplicate test files
find src -name "*.test.ts*" -type f | sort | uniq -d
```

**✅ Expected:** No output (no duplicates)

#### 10.4 Document Changes

Create a commit with clear message:

```bash
git add .
git commit -m "refactor: reorganize tests to follow React best practices

- Remove duplicate test files from __tests__/
- Co-locate all tests with source files
- Move api.test.ts to src/ root
- Create integration test directory structure
- Update DEVELOPER_GUIDE.md with test organization guidelines

Fixes test organization inconsistency where tests existed in multiple
locations. Now follows React community standard of co-locating tests.

See TEST_ORGANIZATION_PLAN.md for details."
```

---

## Validation Checklist

Before marking this task as complete, verify:

- [ ] No duplicate test files exist
- [ ] All test files are co-located with source files
- [ ] `src/__tests__/` contains only:
  - [ ] `helpers.tsx`
  - [ ] `helpers/` directory
  - [ ] `mocks/` directory
  - [ ] `integration/` directory
  - [ ] `setup.ts` (optional)
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] `DEVELOPER_GUIDE.md` updated with test guidelines
- [ ] `vite.config.ts` configured correctly
- [ ] Changes committed to git

---

## Troubleshooting

### Issue: Tests fail after moving files

**Solution:** Check import paths in moved files. Update relative imports:
- `../api` → `./api` (if moved to same directory)
- `../utils/cacheManager` → `./utils/cacheManager` (if in root)

### Issue: Test runner can't find tests

**Solution:** Verify `vite.config.ts` has correct `include` pattern:
```typescript
include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
```

### Issue: Import errors in test files

**Solution:** Update imports to match new file locations. Use your IDE's 
"Find and Replace" to update import paths if needed.

---

## Success Metrics

### Before
- Test files in 3+ locations
- 4 duplicate test files
- Unclear where to add new tests
- Risk of running wrong tests

### After
- Single source of truth for each test
- Tests co-located with source code
- Clear convention for new tests
- No duplicate files

---

## Next Steps

After completing this task, the project will be ready for:

1. **TEST_IMPROVEMENTS_PLAN.md - Phase 1:**
   - Install MSW for API mocking
   - Reduce over-mocking
   - Add integration tests

2. **Future Test Improvements:**
   - Performance tests
   - Better async handling
   - Shared mock factories

---

## References

- [TEST_ORGANIZATION_PLAN.md](./TEST_ORGANIZATION_PLAN.md) - Detailed 
  migration guide
- [TEST_IMPROVEMENTS_PLAN.md](./TEST_IMPROVEMENTS_PLAN.md) - Future 
  improvements
- [Kent C. Dodds - Colocation](https://kentcdodds.com/blog/colocation)
- [React Testing Library - Setup](https://testing-library.com/docs/
  react-testing-library/setup)

---

## Time Breakdown

- Step 1: Audit (10 min)
- Step 2: Compare (15 min)
- Step 3: Remove duplicates (5 min)
- Step 4: Move api.test.ts (5 min)
- Step 5: Create integration dir (2 min)
- Step 6: Verify structure (5 min)
- Step 7: Run tests (10 min)
- Step 8: Update docs (20 min)
- Step 9: Update config (5 min)
- Step 10: Final verification (10 min)

**Total: ~87 minutes (1.5 hours)**

---

## AI-Specific Notes

**For AI Assistants implementing this task:**

1. **Read all steps before starting** - understand the full context
2. **Be cautious with file deletions** - verify content before deleting
3. **Update import paths** - this is the most common source of errors
4. **Run tests frequently** - catch issues early
5. **Document your actions** - explain what you're doing and why
6. **Ask for confirmation** - if you're unsure about which duplicate to keep
7. **Commit incrementally** - don't wait until the end to commit

**Key Decision Points:**
- Which duplicate file has better/more comprehensive tests?
- Are import paths correct after moving files?
- Does the test structure make sense for future developers?

**Safety Checks:**
- Always run `npm test` after file operations
- Verify `npm run build` succeeds
- Check git diff before committing

Good luck! This is a straightforward but important task. 🚀
