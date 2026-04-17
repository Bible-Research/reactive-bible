# Implementation plan: keep `/tags` list visible during refresh (Option A)

Scope: fixes the blank-screen flash on `/tags` after creating, editing, or deleting a tag. Diagnosis is documented in [`tags-page-blanks-on-refresh.md`](./tags-page-blanks-on-refresh.md).

This plan implements **Option A only** — a minimal, isolated change that keeps the existing tag list rendered while a background refresh is in flight. Optimistic store updates (Option B) are out of scope.

## Goal

- First-time visit to `/tags` with an empty store still shows a full-screen loader until tags load (unchanged).
- Post-mutation refreshes (after create / edit / delete) must **not** unmount the page. The existing list stays visible; the list updates in place once the new data arrives.
- Errors during refresh surface via notification, but do not blank the page.

## Non-goals

- No changes to the Zustand store, API layer, `CreateTagModal`, `EditTagModal`, or `TagTree`.
- No optimistic updates.
- Not addressing the separate scroll bug tracked in [`tags-page-not-scrollable.md`](./tags-page-not-scrollable.md).

## Files to change

- `src/routes/TagManagementRoute.tsx` (only)

## Detailed steps

### 1. Replace the single `loading` state with two booleans

Current (`src/routes/TagManagementRoute.tsx:29`):

```tsx
const [loading, setLoading] = useState(true);
```

Replace with:

```tsx
const [initialLoading, setInitialLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
```

### 2. Update `loadTags` to accept a `silent` option

Current (`src/routes/TagManagementRoute.tsx:39-52`):

```tsx
const loadTags = async (forceRefresh = false) => {
  setLoading(true);
  try {
    await getTags(forceRefresh);
  } catch (error) {
    console.error('Error loading tags:', error);
    showNotification({
      title: 'Error',
      message: 'Failed to load tags',
      color: 'red',
    });
  }
  setLoading(false);
};
```

Replace with:

```tsx
const loadTags = async (
  forceRefresh = false,
  { silent = false }: { silent?: boolean } = {}
) => {
  if (silent) {
    setRefreshing(true);
  } else {
    setInitialLoading(true);
  }
  try {
    await getTags(forceRefresh);
  } catch (error) {
    console.error('Error loading tags:', error);
    showNotification({
      title: 'Error',
      message: 'Failed to load tags',
      color: 'red',
    });
  } finally {
    if (silent) {
      setRefreshing(false);
    } else {
      setInitialLoading(false);
    }
  }
};
```

Note the move to `try/finally` so the state is always cleared, including on error paths.

### 3. Gate the full-screen loader on first-load only

Current (`src/routes/TagManagementRoute.tsx:95-101`):

```tsx
if (loading) {
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading tags" />
    </Center>
  );
}
```

Replace with:

```tsx
if (initialLoading && tags.length === 0) {
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading tags" />
    </Center>
  );
}
```

Rationale:

- `initialLoading` is only true during the mount-time load.
- Additionally requiring `tags.length === 0` means that if the Zustand store was already warmed (e.g., by a previous visit or another route that loaded tags), the user skips the loader entirely and sees the list immediately.

### 4. Pass `{ silent: true }` from post-mutation refreshes

Three call sites change; the initial-mount call stays as-is.

**Initial mount — unchanged:**

```tsx
// src/routes/TagManagementRoute.tsx:34-37
useEffect(() => {
  loadTags();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Delete success** (`src/routes/TagManagementRoute.tsx:67`) — change from:

```tsx
await loadTags(true); // Force refresh
```

to:

```tsx
await loadTags(true, { silent: true });
```

**CreateTagModal success** (`src/routes/TagManagementRoute.tsx:159`) — change from:

```tsx
onSuccess={() => loadTags(true)}
```

to:

```tsx
onSuccess={() => loadTags(true, { silent: true })}
```

**EditTagModal success** (`src/routes/TagManagementRoute.tsx:166`) — change from:

```tsx
onSuccess={() => loadTags(true)}
```

to:

```tsx
onSuccess={() => loadTags(true, { silent: true })}
```

### 5. (Optional) Inline refresh indicator

Low-effort UX polish. In the count line (`src/routes/TagManagementRoute.tsx:144-146`), show a small spinner while `refreshing` is true:

```tsx
<Group spacing="xs" mb="md">
  <Text color="dimmed" size="sm">
    {filteredTags.length} {filteredTags.length === 1 ? 'tag' : 'tags'}
  </Text>
  {refreshing && <Loader size="xs" aria-label="Refreshing tags" />}
</Group>
```

Skip if we want an absolutely minimal diff.

## Validation

### Lint / types

Run `npm run lint` and `npm run build` (the latter also runs `tsc`). Fix any issues introduced by the changes.

### Manual test checklist

1. **Initial load**: Open `/tags` in a fresh session. Full-screen loader appears briefly, then the list renders. Unchanged behavior.
2. **Warm cache**: Navigate away from `/tags` and back (while tags remain in the Zustand store). The list should render immediately — no full-screen loader.
3. **Create**: Click **New Tag**, submit a valid tag. Modal closes, success notification fires, existing list stays on screen, new tag appears once the background refresh completes.
4. **Edit**: Rename or reparent a tag via the edit modal. List stays rendered; changes appear after refresh.
5. **Delete**: Delete a tag via the confirm dialog. List stays rendered; the deleted tag disappears after refresh.
6. **Error path**: Temporarily force `getTags` to throw (e.g., disconnect network). The error notification fires and the existing list remains visible — no blank page.
7. **Rapid succession**: Create two tags back-to-back. Neither operation should cause a blank screen while a previous refresh is still in flight.
8. **Regression sweep**: Visit `/notes/tag/:tagId` and `/bible` after exercising the tags page to ensure nothing else is affected.

### Automated test (optional, nice-to-have)

Add a test to `src/routes/__tests__/TagManagementRoute.test.tsx` (create if missing):

- Seed the Zustand store with a few tags.
- Mock the `getTags` API with a deferred promise so the test controls resolution.
- Render the route, trigger create via the modal.
- Assert that the pre-existing tag names remain in the DOM while the refresh promise is still pending.
- Resolve the promise and assert the new tag appears.

## Rollback

Revert the single file (`src/routes/TagManagementRoute.tsx`). No migrations, no store changes, no API changes.

## Estimated risk / effort

- Effort: ~15 minutes including manual testing.
- Risk: low. Change is isolated to one route component and only affects loading-state gating.

## Follow-ups (not in this plan)

- Consider Option B (optimistic store updates) if the refresh round-trip still feels sluggish after Option A ships.
- Apply the same pattern elsewhere if we find other routes that use a single `loading` boolean for both initial-load and background refresh.
