# Comprehensive Test Plan for Reactive Bible Core Functionalities

Based on analysis of the DEVELOPER_GUIDE.md and existing test coverage, 
here's a detailed plan for writing missing tests for the core 
functionalities.

---

## Current Test Coverage

✅ **Basic Navigation & Verse Display** (2 tests in `App.test.tsx`)
- Navigation to Exodus 2:18
- Navigation to John 11:35 with next chapter buttons

---

## Missing Test Coverage - Organized by Priority

---

## Priority 1: Critical Core Functionalities

### 1. Bible Reading & Navigation Tests (`MyNavbar.test.tsx`)

**File to create:** `src/components/MyNavbar.test.tsx`

**Test cases:**
- ✏️ Should navigate to New Testament books (e.g., Matthew, John, 
  Revelation)
- ✏️ Should highlight active book in navigation
- ✏️ Should highlight active chapter in navigation
- ✏️ Should collapse navbar on mobile (burger menu)
- ✏️ Should persist navigation state in localStorage

---

### 2. Verse Selection & Highlighting Tests (`Verse.test.tsx`)

**File to create:** `src/components/Verse.test.tsx`

**Test cases:**
- ✏️ Should highlight verse when clicked
- ✏️ Should support multi-verse selection (Ctrl/Cmd + click)
- ✏️ Should deselect verse when clicked again
- ✏️ Should scroll to verse when selected programmatically
- ✏️ Should apply correct CSS class to selected verses (`linkActive`)
- ✏️ Should clear selection when navigating to different chapter
- ✏️ Should display verse number and text correctly

---

### 3. Translation Switching Tests (`TranslationSelector.test.tsx`)

**File to create:** `src/components/TranslationSelector.test.tsx`

**Test cases:**
- ✏️ Should display available translations (mock API response)
- ✏️ Should filter translations by language
- ✏️ Should switch from KJV to ESV translation
- ✏️ Should update activeTextFilesetId when translation selected
- ✏️ Should persist selected translation in localStorage
- ✏️ Should display translation name and language
- ✏️ Should handle API errors gracefully
- ✏️ Should show loading state while fetching translations

---

## Priority 2: Important Features

### 4. Audio Playback Tests (`Audio.test.tsx` & `AudioPlayer.test.tsx`)

**Files to create:** 
- `src/components/Audio.test.tsx`
- `src/components/AudioPlayer.test.tsx`

**Test cases for Audio.tsx:**
- ✏️ Should fetch audio URL from API (mock response)
- ✏️ Should create Howler instance with correct URL
- ✏️ Should handle audio loading errors
- ✏️ Should auto-advance to next chapter when audio ends
- ✏️ Should clean up audio instance on unmount
- ✏️ Should update Media Session metadata
- ✏️ Should cache audio URLs in localStorage
- ✏️ Should use cached audio URL if not expired

**Test cases for AudioPlayer.tsx:**
- ✏️ Should display play/pause button
- ✏️ Should toggle play state when button clicked
- ✏️ Should display current time and duration
- ✏️ Should update progress bar as audio plays
- ✏️ Should seek to position when progress bar clicked
- ✏️ Should display previous/next chapter buttons
- ✏️ Should navigate to previous chapter when button clicked
- ✏️ Should navigate to next chapter when button clicked
- ✏️ Should handle Media Session API controls (mock)

---

### 5. Note Taking & Tagging Tests (`NotesView.test.tsx`)

**Files to create:**
- `src/components/NotesView.test.tsx`
- `src/components/AddTagNoteModal.test.tsx`
- `src/components/EditNoteModal.test.tsx`

**Test cases for NotesView.tsx:**
- ✏️ Should fetch notes for selected tag (mock API)
- ✏️ Should display notes in list format
- ✏️ Should switch tags and fetch corresponding notes
- ✏️ Should refresh notes when refresh button clicked
- ✏️ Should handle empty notes list
- ✏️ Should display loading state while fetching
- ✏️ Should handle API errors

**Test cases for AddTagNoteModal.tsx:**
- ✏️ Should open modal when "Add Note" clicked
- ✏️ Should display selected verses in modal
- ✏️ Should submit note with tag and verses
- ✏️ Should clear selected verses after successful submission
- ✏️ Should close modal after submission
- ✏️ Should handle submission errors

**Test cases for EditNoteModal.tsx:**
- ✏️ Should open with pre-filled note data
- ✏️ Should update note when submitted
- ✏️ Should refresh notes for current tag after edit
- ✏️ Should close modal after successful update

---

### 6. Theme System Tests (`App.test.tsx` - extend existing)

**File to extend:** `src/App.test.tsx`

**Test cases:**
- ✏️ Should toggle between light and dark mode
- ✏️ Should persist theme preference in localStorage
- ✏️ Should load theme from localStorage on mount
- ✏️ Should apply correct Mantine theme colors

---

## Priority 3: Utility Functions & State Management

### 7. Cache Manager Tests (`cacheManager.test.ts`)

**File to create:** `src/utils/cacheManager.test.ts`

**Test cases:**
- ✏️ Should cache verse with correct key format
- ✏️ Should retrieve cached verse
- ✏️ Should enforce 500 verse limit (LRU eviction)
- ✏️ Should update access count on cache hit
- ✏️ Should evict least recently used verse when limit reached
- ✏️ Should cache audio URL with expiration
- ✏️ Should not return expired audio URL
- ✏️ Should clear expired audio URLs
- ✏️ Should cache translation list
- ✏️ Should handle localStorage quota exceeded errors

---

### 8. Bible Utils Tests (`bibleUtils.test.ts`)

**File to create:** `src/utils/bibleUtils.test.ts`

**Test cases:**
- ✏️ Should return correct testament for book code (OT/NT)
- ✏️ Should return null for invalid book code
- ✏️ Should convert book name to code (e.g., "genesis" → "GEN")
- ✏️ Should convert book code to name (e.g., "GEN" → "genesis")
- ✏️ Should handle case-insensitive book names
- ✏️ Should validate book codes correctly
- ✏️ Should return correct book list for testament

---

### 9. Zustand Store Tests (`store.test.tsx`)

**File to create:** `src/store.test.tsx`

**Test cases:**
- ✏️ Should initialize with default state
- ✏️ Should update activeBook when setActiveBook called
- ✏️ Should update activeChapter when setActiveChapter called
- ✏️ Should update activeVerses and scroll to verse
- ✏️ Should clear activeVerses when setActiveVerses([]) called
- ✏️ Should persist state to localStorage
- ✏️ Should load state from localStorage on initialization
- ✏️ Should update bibleVersion when setBibleVersion called
- ✏️ Should toggle theme correctly
- ✏️ Should fetch notes with optional tagId parameter
- ✏️ Should handle async fetchNotes errors

---

### 10. API Integration Tests (`api.test.tsx`)

**File to create:** `src/api.test.tsx`

**Test cases:**
- ✏️ Should fetch verses for chapter (mock fetch)
- ✏️ Should fetch audio URL for chapter (mock fetch)
- ✏️ Should fetch translations for language (mock fetch)
- ✏️ Should fetch notes without tagId (all notes)
- ✏️ Should fetch notes with tagId (filtered)
- ✏️ Should create new note via API
- ✏️ Should update existing note via API
- ✏️ Should delete note via API
- ✏️ Should handle network errors
- ✏️ Should handle API rate limiting
- ✏️ Should parse API responses correctly

---

## Priority 4: Edge Cases & Error Handling

### 11. Error Handling Tests (Various components)

**Test cases to add across components:**
- ✏️ Should display error message when API fails
- ✏️ Should retry failed API calls (if implemented)
- ✏️ Should handle malformed API responses
- ✏️ Should handle missing audio files gracefully
- ✏️ Should handle localStorage quota exceeded
- ✏️ Should handle network offline scenarios
- ✏️ Should display fallback UI when data unavailable

---

### 12. Performance & Prefetching Tests (`App.test.tsx` - extend)

**Test cases:**
- ✏️ Should prefetch next chapter when navigating
- ✏️ Should prefetch previous chapter when navigating
- ✏️ Should prefetch audio for adjacent chapters
- ✏️ Should not prefetch if already cached
- ✏️ Should handle prefetch failures silently

---

### 13. Browser Compatibility Tests (Integration tests)

**Test cases:**
- ✏️ Should work without Media Session API (mock unavailable)
- ✏️ Should work without localStorage (fallback to memory)
- ✏️ Should handle audio autoplay restrictions
- ✏️ Should work on mobile viewport sizes

---

## Test File Organization Structure

```
src/
├── components/
│   ├── AddTagNoteModal.test.tsx       [NEW]
│   ├── Audio.test.tsx                 [NEW]
│   ├── AudioPlayer.test.tsx           [NEW]
│   ├── EditNoteModal.test.tsx         [NEW]
│   ├── MyNavbar.test.tsx              [NEW]
│   ├── NotesView.test.tsx             [NEW]
│   ├── TranslationSelector.test.tsx   [NEW]
│   └── Verse.test.tsx                 [NEW]
├── utils/
│   ├── bibleUtils.test.ts             [NEW]
│   └── cacheManager.test.ts           [NEW]
├── api.test.tsx                       [NEW]
├── store.test.tsx                     [NEW]
└── App.test.tsx                       [EXTEND EXISTING]
```

---

## Testing Utilities to Create

### 1. Test Helpers (`src/__tests__/helpers.tsx`)

**File to create:** `src/__tests__/helpers.tsx`

**Utilities:**
```typescript
// Mock Zustand store with custom initial state
export const createMockStore = (initialState) => { ... }

// Mock API responses
export const mockApiResponses = {
  verses: [...],
  audio: {...},
  translations: [...],
  notes: [...]
}

// Render with providers (Mantine, store)
export const renderWithProviders = (component, options) => { ... }

// Wait for loading states to complete
export const waitForLoadingToFinish = () => { ... }
```

---

## Mock Data to Create

### 2. Mock Data Files (`src/__tests__/mocks/`)

**Files to create:**
- `src/__tests__/mocks/verses.ts` - Sample verse data
- `src/__tests__/mocks/audio.ts` - Sample audio URLs
- `src/__tests__/mocks/translations.ts` - Sample translation list
- `src/__tests__/mocks/notes.ts` - Sample notes data

---

## Execution Strategy

### Phase 1: Foundation (Week 1)
1. Create test helpers and mock data
2. Write utility function tests (bibleUtils, cacheManager)
3. Write store tests
4. Write API tests

### Phase 2: Core Components (Week 2)
5. Write navigation tests (MyNavbar)
6. Write verse selection tests (Verse)
7. Write translation selector tests

### Phase 3: Advanced Features (Week 3)
8. Write audio playback tests
9. Write notes & tagging tests
10. Write theme system tests

### Phase 4: Edge Cases & Integration (Week 4)
11. Write error handling tests
12. Write performance tests
13. Write browser compatibility tests
14. Achieve target coverage: **80%+**

---

## Contingency Plan: Handling Failing Tests

If a specific test proves difficult to fix and is blocking progress, do not get stuck. Follow these steps:

1.  **Attempt a Fix:** Make a maximum of 2-3 genuine attempts to fix the failing test.
2.  **Skip the Test:** If the test still fails, skip it using the `.skip()` method (e.g., `it.skip(...)` or `describe.skip(...)`).
3.  **Document the Issue:** Create or update the `SKIPPED_TESTS.md` file in the project root. Add an entry detailing:
    - The name of the test and the file it's in.
    - A clear, concise reason why the test was skipped (e.g., bug in the source code, complex logic issue).
4.  **Commit and Continue:** Commit the skipped test and the updated documentation, then proceed with the rest of the test plan.

This ensures that the test suite remains green and progress is not halted by a single problematic test.

## Coverage Goals

| Category | Target Coverage |
|----------|----------------|
| **Utilities** | 90%+ |
| **State Management** | 85%+ |
| **API Layer** | 85%+ |
| **Core Components** | 80%+ |
| **UI Components** | 70%+ |
| **Overall** | 80%+ |

---

## Testing Best Practices to Follow

1. ✅ Use `waitFor()` for all async operations
2. ✅ Mock external APIs and services
3. ✅ Test user behavior, not implementation
4. ✅ Keep tests isolated and independent
5. ✅ Use semantic queries (getByRole, getByTitle)
6. ✅ Follow AAA pattern (Arrange, Act, Assert)
7. ✅ Add descriptive test names
8. ✅ Mock Vercel Analytics/Speed Insights
9. ✅ Respect 79-character line limit (user rule)
10. ✅ Update DEVELOPER_GUIDE.md with new testing patterns

### Bug Handling During Test Implementation

**Small Bugs:**
- Fix small bugs encountered during test writing
- Document the fix in commit messages
- Continue with test implementation

**Larger Bugs:**
- Comment out the failing test(s)
- Document the issue in `TEST_ISSUES.md`
- Include:
  - Test file and test case name
  - Description of the bug
  - Error messages/stack traces
  - Steps to reproduce
  - Potential root cause (if known)
- Move on to next test
- Address bugs separately after test writing phase

### Failed Test Implementation

**If you struggle to implement a test:**
- Don't force it - skip the test
- Document in `FAILED_TESTS.md`
- Include:
  - Test file and test case name
  - Reason for failure (mocking difficulty, complexity, etc.)
  - What was attempted
  - Suggestions for future implementation
- Continue with other tests
- Revisit later with fresh perspective or team discussion

---

## Additional Considerations

### CI/CD Integration
- Add test coverage reporting to CI pipeline
- Fail builds if coverage drops below 75%
- Run tests on every PR

### Performance Testing
- Consider adding Lighthouse CI for performance metrics
- Test bundle size limits
- Monitor test execution time

### Accessibility Testing
- Add `jest-axe` for automated a11y testing
- Test keyboard navigation
- Test screen reader compatibility

---

## Summary

This plan provides comprehensive coverage of all core functionalities 
documented in the DEVELOPER_GUIDE.md, with **~125+ test cases** 
organized by priority and component. The phased approach allows for 
incremental progress while maintaining code quality.
