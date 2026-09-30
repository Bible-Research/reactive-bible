# Tag Refresh Behavior Tests

## Overview

This document explains the comprehensive test suite in `src/routes/__tests__/tag-refresh.test.tsx` that ensures tags are always force-refreshed when navigating to key routes.

## Background

### The Problem

Tags are cached in the Zustand store for performance optimization (~95% faster, < 10ms vs 200-500ms). However, this caching created a UX issue where users wouldn't see newly created/edited/deleted tags when navigating between routes.

### The Solution

All three main routes now call `getTags(true)` on mount to force-refresh tags from the API, ensuring users always see the latest data while still benefiting from caching during normal usage.

## Test Suite Structure

### File: `src/routes/__tests__/tag-refresh.test.tsx`

**Total Tests**: 12  
**All Passing**: ✅

## Test Categories

### 1. TagNotesRoute Tests (3 tests)

#### `should call getTags with forceRefresh=true on mount`
- **Purpose**: Ensures the route calls `getTags(true)` when mounted
- **Verifies**: Force refresh parameter is passed correctly
- **Critical**: Prevents stale tag dropdown data

#### `should fetch fresh tags even when cache exists`
- **Purpose**: Confirms API call is made despite cached tags
- **Verifies**: Cache is bypassed on route mount
- **Critical**: Ensures users see latest tags after mutations

#### `should only refresh tags when authenticated`
- **Purpose**: Verifies tags are only fetched for authenticated users
- **Verifies**: Auth gating works correctly
- **Critical**: Prevents unnecessary API calls for anonymous users

### 2. BibleRoute Tests (4 tests)

#### `should call getTags with forceRefresh=true on mount`
- **Purpose**: Ensures the route calls `getTags(true)` when mounted
- **Verifies**: Force refresh parameter is passed correctly
- **Critical**: Keeps notes sidebar tag data fresh

#### `should fetch fresh tags even when cache exists`
- **Purpose**: Confirms API call is made despite cached tags
- **Verifies**: Cache is bypassed on route mount
- **Critical**: Ensures users see latest tags in notes sidebar

#### `should only refresh tags when authenticated`
- **Purpose**: Verifies tags are only fetched for authenticated users
- **Verifies**: Auth gating works correctly
- **Critical**: Prevents unnecessary API calls for anonymous users

#### `should refresh tags on every navigation to BibleRoute`
- **Purpose**: Confirms tags refresh on each route navigation
- **Verifies**: Multiple navigations trigger multiple refreshes
- **Note**: Limited by MemoryRouter rerender behavior

### 3. TagManagementRoute Tests (2 tests)

#### `should call getTags with forceRefresh=true on mount`
- **Purpose**: Ensures the route calls `getTags(true)` when mounted
- **Verifies**: Force refresh parameter is passed correctly
- **Critical**: Shows latest tags in management interface

#### `should fetch fresh tags even when cache exists`
- **Purpose**: Confirms API call is made despite cached tags
- **Verifies**: Cache is bypassed on route mount
- **Critical**: Ensures tag list is always current

### 4. Cross-Route Freshness Tests (1 test)

#### `should show updated tags after creating a tag in TagManagement`
- **Purpose**: Simulates real-world workflow of creating a tag then navigating
- **Verifies**: Tags created in one route appear in another route
- **Critical**: Validates the entire refresh mechanism works end-to-end

### 5. Performance Tests (2 tests)

#### `should use cache when getTags is called without forceRefresh`
- **Purpose**: Confirms caching still works for normal calls
- **Verifies**: `getTags(false)` doesn't make API calls when cache exists
- **Critical**: Ensures performance optimization is preserved

#### `should bypass cache when getTags is called with forceRefresh`
- **Purpose**: Confirms force refresh bypasses cache
- **Verifies**: `getTags(true)` always makes API calls
- **Critical**: Validates the force-refresh mechanism

## Running the Tests

```bash
# Run only tag refresh tests
npm test -- src/routes/__tests__/tag-refresh.test.tsx

# Run with verbose output
npm test -- src/routes/__tests__/tag-refresh.test.tsx --reporter=verbose

# Run all tests
npm test
```

## Expected Output

```
✓ src/routes/__tests__/tag-refresh.test.tsx (12 tests) 315ms
  ✓ Tag Refresh Behavior (12 tests)
    ✓ TagNotesRoute (3 tests)
      ✓ should call getTags with forceRefresh=true on mount
      ✓ should fetch fresh tags even when cache exists
      ✓ should only refresh tags when authenticated
    ✓ BibleRoute (4 tests)
      ✓ should call getTags with forceRefresh=true on mount
      ✓ should fetch fresh tags even when cache exists
      ✓ should only refresh tags when authenticated
      ✓ should refresh tags on every navigation to BibleRoute
    ✓ TagManagementRoute (2 tests)
      ✓ should call getTags with forceRefresh=true on mount
      ✓ should fetch fresh tags even when cache exists
    ✓ Cross-route tag freshness (1 test)
      ✓ should show updated tags after creating a tag in TagManagement
    ✓ Performance: cache is still used within same session (2 tests)
      ✓ should use cache when getTags is called without forceRefresh
      ✓ should bypass cache when getTags is called with forceRefresh

Test Files  1 passed (1)
     Tests  12 passed (12)
```

## What These Tests Prevent

### Regression Scenarios

1. **Stale Tag Dropdown**: Without force refresh, the tag dropdown in TagNotesRoute would show outdated tags
2. **Missing New Tags**: After creating a tag in TagManagementRoute, it wouldn't appear in other routes
3. **Deleted Tags Persist**: Deleted tags would still appear in dropdowns until manual page refresh
4. **Cache Over-Optimization**: Someone might remove force-refresh to "optimize" performance, breaking freshness

### Real-World Impact

- **Collaborative Editing**: Multiple users editing tags see each other's changes
- **Multi-Tab Scenarios**: Changes in one tab appear when navigating in another tab
- **User Confidence**: Users trust that the UI shows current data

## Related Commits

- **5a6e14c** (April 17, 2026): "feat: Implement tag caching in store to prevent unnecessary API calls"
  - Added the caching mechanism for performance
  
- **2407a23** (Sept 3, 2026): "Feat: Force refresh tags on route navigation"
  - Fixed the incomplete implementation by adding force-refresh on route mount
  
- **ef67e87** (Sept 3, 2026): "Test: Add comprehensive tag refresh behavior tests"
  - Added this test suite to prevent regression

## Implementation Details

### Mocked Dependencies

```typescript
// API mocks
vi.mock('../../api');
mockApi.getTags.mockResolvedValue(mockTags);
mockApi.getNotes.mockResolvedValue(mockNotes);
mockApi.getTag.mockResolvedValue(mockTags[0]);

// Component mocks (to isolate route behavior)
vi.mock('../../components/Passage');
vi.mock('../../components/TagSection');
vi.mock('../../components/TagTree');
vi.mock('../../components/CreateTagModal');
vi.mock('../../components/EditTagModal');
vi.mock('../../components/EditNoteModal');

// Cache manager mocks
vi.mock('../../utils/cacheManager');
```

### Store Setup

Each test resets the Zustand stores to a known state:

```typescript
beforeEach(() => {
  useBibleStore.setState({
    tags: [],
    notes: [],
    activeBook: 'John',
    activeChapter: 1,
    // ... other state
  });

  useAuthStore.setState({
    token: 'test-token',
    user: { username: 'testuser' },
    isAuthenticated: true,
  });
});
```

### Spy Pattern

Tests use Vitest spies to verify function calls:

```typescript
const getTagsSpy = vi.spyOn(useBibleStore.getState(), 'getTags');

// ... render component ...

await waitFor(() => {
  expect(getTagsSpy).toHaveBeenCalledWith(true);
});
```

## Maintenance

### When to Update These Tests

1. **Route Changes**: If TagNotesRoute, BibleRoute, or TagManagementRoute are refactored
2. **Store Changes**: If the `getTags` function signature changes
3. **Auth Changes**: If authentication logic changes
4. **New Routes**: If new routes are added that display tags

### How to Add Tests

Follow the existing pattern:

```typescript
it('should call getTags with forceRefresh=true on mount', async () => {
  const getTagsSpy = vi.spyOn(useBibleStore.getState(), 'getTags');

  render(
    <MemoryRouter initialEntries={['/your-route']}>
      <Routes>
        <Route path="/your-route" element={<YourRoute />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(getTagsSpy).toHaveBeenCalledWith(true);
  });
});
```

## Troubleshooting

### Common Issues

1. **Test Timeout**: Increase `waitFor` timeout if API mocks are slow
2. **Mock Not Called**: Ensure component is actually mounting (check for errors)
3. **Wrong Call Count**: React Strict Mode calls effects twice in development

### Debug Tips

```typescript
// Log store state
console.log('Store state:', useBibleStore.getState());

// Log mock calls
console.log('getTags calls:', mockApi.getTags.mock.calls);

// Check if component rendered
screen.debug();
```

## Conclusion

This test suite is critical for maintaining the balance between performance (caching) and data freshness (force-refresh). It ensures that users always see the latest tags when navigating to key routes, while still benefiting from the ~95% performance improvement that caching provides.

**Do not remove or skip these tests** without understanding the full impact on user experience.
