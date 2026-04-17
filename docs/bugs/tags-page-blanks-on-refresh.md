# Bug: `/tags` page blanks out while refreshing after create / edit / delete

Related: [`tags-page-not-scrollable.md`](./tags-page-not-scrollable.md)

## Summary

On `http://localhost:5173/tags`, creating (or editing, or deleting) a tag causes the entire page to be replaced by a full-screen loader until the new tag list comes back from the API. The existing tags already in memory could continue to be shown while the refresh happens in the background — the blank screen is an unnecessary UX regression.

Expected behavior: after creating a tag, keep the current tag list rendered, fetch the latest tags in the background, and swap in the new list as soon as it arrives (optionally with a subtle inline "refreshing" indicator). Same for edit and delete.

## Diagnosis

### Root cause

`TagManagementRoute` gates all rendering behind a single boolean `loading`, which is set to `true` for **every** refresh — not just the initial mount.

```tsx
// src/routes/TagManagementRoute.tsx:39-52
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

```tsx
// src/routes/TagManagementRoute.tsx:95-101
if (loading) {
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading tags" />
    </Center>
  );
}
```

### Flow that triggers the blank screen

1. User clicks **New Tag** → `CreateTagModal` opens.
2. User submits → `createTag(...)` POST succeeds → modal calls `onSuccess()` which is wired to `() => loadTags(true)` (see `TagManagementRoute.tsx:159`).
3. `loadTags(true)` sets `loading = true` → the early `if (loading) return <Loader />` unmounts the entire page chrome (title, search box, tag list).
4. `getTags(true)` in `store.tsx:138` skips the cache and calls the API.
5. When the network request resolves, `setLoading(false)` → tag list re-renders.

The same blanking happens for:

- Delete: `TagManagementRoute.tsx:67` — `await loadTags(true)` after `deleteTagApi`.
- Edit: `TagManagementRoute.tsx:166` — `onSuccess={() => loadTags(true)}` wired to `EditTagModal`.

The root issue is conflating two very different loading states (initial load vs. background refresh) into a single boolean that controls a full-screen loader.

## Fix plan

Goal: keep the tag list visible during post-mutation refreshes; reserve the full-screen loader for the true initial load before any tags are available.

### Option A (preferred) — split the loading states

File: `src/routes/TagManagementRoute.tsx`

1. Introduce two state booleans:
   - `initialLoading: boolean` — true only until the first successful (or failed) load.
   - `refreshing: boolean` — true during background refetches.
2. Update `loadTags` to accept a `silent` flag:

```tsx
const [initialLoading, setInitialLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);

const loadTags = async (forceRefresh = false, { silent = false } = {}) => {
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

3. Change the early return so it **only** blocks rendering for the initial load, and only when there are no tags yet:

```tsx
if (initialLoading && tags.length === 0) {
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading tags" />
    </Center>
  );
}
```

   (If `tags.length > 0` on mount — e.g., the store was warmed by a previous visit — we skip the full-screen loader entirely and render immediately.)

4. Update the callers that are *post-mutation refreshes* to pass `silent: true`:

```tsx
// After successful delete
await loadTags(true, { silent: true });

// CreateTagModal success handler
onSuccess={() => loadTags(true, { silent: true })}

// EditTagModal success handler
onSuccess={() => loadTags(true, { silent: true })}
```

5. (Optional polish) Surface `refreshing` with a subtle inline indicator — e.g., show a small `<Loader size="xs" />` next to the "N tags" count text, or disable the **New Tag** button while `refreshing` to prevent double submits. This is nice-to-have, not required to fix the blanking.

### Option B — optimistic update (additional improvement)

For even snappier UX on create/edit/delete, update the Zustand store optimistically so the new tag appears instantly, then reconcile with the server response.

Proposed additions to `store.tsx`:

- `addTag(tag: Tag)` — pushes into `state.tags`.
- `updateTag(tag: Tag)` — replaces the matching tag in `state.tags`.
- `removeTag(tagId: string)` — filters out of `state.tags`.

Callers in the modals / route then:

1. Call the API.
2. On success, apply the optimistic store update synchronously using the returned server tag (with its real id).
3. Fire a background `getTags(true)` to eventually reconcile (or skip it entirely, since the server tag is already in the store).

If we add optimistic updates, the `loadTags(true, { silent: true })` call after mutations can be dropped entirely, removing the refresh round-trip.

Recommend starting with **Option A** (small, isolated fix that directly addresses the reported bug), and considering **Option B** as a follow-up if the server latency still feels noticeable.

### Step-by-step to implement Option A

1. Edit `src/routes/TagManagementRoute.tsx`:
   - Replace `const [loading, setLoading] = useState(true)` with the two booleans above.
   - Update `loadTags` signature and body to branch on `silent`.
   - Update the early-return guard to use `initialLoading && tags.length === 0`.
   - Update the three call sites (mount, delete success, CreateTagModal `onSuccess`, EditTagModal `onSuccess`) to pass `{ silent: true }` where appropriate — note that the initial mount call `loadTags()` stays non-silent.
   - (Optional) Add an inline `<Loader size="xs" />` next to the `{filteredTags.length} tags` text when `refreshing`.
2. No changes needed in `CreateTagModal.tsx`, `EditTagModal.tsx`, `TagTree.tsx`, `store.tsx`, or `api.tsx` for Option A.

### Manual test checklist

1. Fresh page load of `/tags` still shows the full-screen loader briefly, then the list (unchanged behavior on first visit).
2. Click **New Tag**, create a tag, hit Submit:
   - Modal closes, success notification shows.
   - Page chrome (title, search, existing tag list) **remains visible** — no blank/loader screen.
   - The new tag appears in the list within a second (or immediately if Option B is implemented).
3. Delete a tag:
   - Confirmation dialog appears.
   - After confirming, the list stays rendered; the deleted tag disappears once the refresh completes.
4. Edit a tag (rename / reparent):
   - Modal closes, list stays rendered, updated name/position appears when refresh completes.
5. Error path: simulate an API failure for the create flow — verify the error notification fires and the existing list is still visible (no blank page on error either).
6. Rapid succession: create two tags back-to-back — the second create should not cause a blank screen while the first refresh is still in flight.

### Automated test (optional)

Add to `src/routes/__tests__/TagManagementRoute.test.tsx` (create if missing):

- Render `TagManagementRoute` with a pre-populated `tags` store and the API's `getTags` mocked with a controllable delay.
- Trigger create via the modal.
- Assert the existing tags remain in the DOM (`screen.queryByText(existingTagName)` is still present) while the mocked API is still pending.
- Advance the mock and assert the new tag appears.

## Files that will change

- `src/routes/TagManagementRoute.tsx` — introduce `initialLoading` / `refreshing`, gate full-screen loader on first-load-only, pass `silent: true` for post-mutation refreshes, optional inline refresh indicator.

No changes to API layer, Zustand store, or modals required for Option A.
