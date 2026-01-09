# Notes Caching Implementation Plan

## Date: 2026-01-09

---

## 1. Documentation Review & Findings

### Bible Verse Caching - Current State

#### Documentation Says (DEVELOPER_GUIDE.md):
- **Cache Key Format**: `{version}:{book}:{chapter}:{verse}`
- **Storage Keys**: 
  - `bible_verse_cache`: Verse data
  - `bible_verse_cache_metadata`: LRU queue and stats
- **Features**:
  - Maximum 500 verses (copyright compliance)
  - LRU (Least Recently Used) eviction
  - Access count tracking
  - Timestamp tracking

#### Code Reality (cacheManager.ts & api.tsx):
- **Cache Key Format**: `{filesetId}:{book}:{chapter}:{verse}` ✅
  - Uses `filesetId` instead of generic `version`
  - This is correct as the app now uses filesetId for all API calls
- **Implementation**: Matches documentation ✅
- **Usage in api.tsx**: 
  - `getCachedVerses(thebook, thechapter, filesetId)` - checks cache first
  - `cacheVerses(thebook, thechapter, filesetId, verses)` - caches after API fetch

### Documentation Mismatch Found ❌

**Issue**: Documentation uses outdated terminology
- **Doc says**: `{version}:{book}:{chapter}:{verse}` (e.g., "ESV")
- **Code uses**: `{filesetId}:{book}:{chapter}:{verse}` (e.g., "ENGESV")

**Recommendation**: Update DEVELOPER_GUIDE.md to reflect that cache keys use `filesetId` instead of `version`.

---

## 2. Notes Caching Strategy

### Current Notes Behavior (No Caching)

**NotesView.tsx**:
- On mount: Fetches tags, then fetches notes for first tag
- On tag change: Fetches notes for selected tag
- On refresh button: Re-fetches notes for current tag
- **Problem**: Every tag switch triggers API call, even for previously viewed tags

**EditNoteModal.tsx**:
- On submit: Calls `fetchNotes(tagId)` to refresh notes list
- **Problem**: Always fetches from API, no cache check

**AddTagNoteModal.tsx**:
- On submit: Does NOT refresh notes
- **Problem**: User must manually refresh to see new note

### Proposed Caching Strategy

#### Cache Structure

```typescript
interface NotesCacheData {
  notes: Note[];
  timestamp: number;
  tagId: string;
}

interface NotesCache {
  [tagId: string]: NotesCacheData;
}
```

**Storage Key**: `bible_notes_cache`

**Cache Key Format**: `{tagId}`

#### Cache Behavior

1. **On Page Load** (NotesView mount):
   - Check if ALL notes are cached (`allNotes` key)
   - If not cached: Fetch all notes from API and cache them
   - If cached: Use cached data
   - Group notes by tag for display

2. **On Tag Selection**:
   - Check if notes for this tag are cached
   - If cached: Use cached data
   - If not cached: Fetch from API and cache

3. **On Note Submission** (AddTagNoteModal):
   - After successful submission:
   - Invalidate cache for the selected tag
   - Re-fetch notes for that tag
   - Update cache with fresh data

4. **On Note Edit** (EditNoteModal):
   - After successful edit:
   - Invalidate cache for the note's tag
   - Re-fetch notes for that tag
   - Update cache with fresh data

5. **On Manual Refresh**:
   - Clear cache for current tag
   - Re-fetch from API
   - Update cache

#### Cache Invalidation Rules

- **No expiration time**: Notes don't change unless user edits them
- **Invalidate on mutation**: Clear specific tag cache when:
  - Note is added to that tag
  - Note is edited (old tag AND new tag if tag changed)
  - Note is deleted
- **Manual clear**: Refresh button clears cache for current tag

---

## 3. Implementation Steps

### Step 1: Update DEVELOPER_GUIDE.md
- Fix verse cache key format documentation
- Change `{version}` to `{filesetId}` in examples
- Add explanation that filesetId is the specific translation identifier

### Step 2: Create Notes Cache Manager
- Add to `src/utils/cacheManager.ts`:
  - `getCachedNotes(tagId?: string): Note[] | null`
  - `cacheNotes(tagId: string, notes: Note[])`
  - `invalidateNotesCache(tagId: string)`
  - `clearNotesCache()`
  - Update `getCacheStats()` to include notes cache info

### Step 3: Update API Layer
- Modify `getNotes()` in `src/api.tsx`:
  - Check cache first
  - Return cached data if available
  - Fetch from API if not cached
  - Cache the result before returning

### Step 4: Update Store
- Modify `fetchNotes` in `src/store.tsx`:
  - Add parameter to force refresh (bypass cache)
  - Use existing API function (which now has caching)

### Step 5: Update NotesView Component
- Modify initial load to fetch all notes if not cached
- Keep existing tag selection behavior (API now handles caching)
- Update refresh button to force cache bypass

### Step 6: Update EditNoteModal
- After successful edit:
  - Invalidate cache for old tag
  - Invalidate cache for new tag (if tag changed)
  - Call `fetchNotes(tagId)` to refresh

### Step 7: Update AddTagNoteModal
- After successful submission:
  - Invalidate cache for the tag
  - Call `fetchNotes(tagId)` to refresh
  - This ensures new note appears immediately

### Step 8: Rename Git Branch
- Rename from `new` to `feature/notes-caching`

---

## 4. Technical Considerations

### Cache Size
- Notes are small (text + metadata)
- Typical user might have 10-50 tags with 5-20 notes each
- Estimated size: ~50KB for 500 notes
- **Conclusion**: No size limit needed, localStorage can handle this

### Cache Persistence
- Store in localStorage (same as verse cache)
- Persists across sessions
- User can clear via browser settings

### Error Handling
- If cache read fails: Fall back to API
- If cache write fails: Log error, continue (non-critical)
- If API fails: Show error to user

### Performance Benefits
- Eliminates API calls for previously viewed tags
- Instant tag switching
- Reduces server load
- Better offline experience (cached data available)

---

## 5. Testing Strategy

### Manual Testing
1. Load NotesView - verify all notes fetched and cached
2. Switch between tags - verify cache is used (no network calls)
3. Add a note - verify cache invalidated and refreshed
4. Edit a note - verify cache invalidated and refreshed
5. Change note's tag - verify both old and new tag caches invalidated
6. Click refresh - verify cache cleared and re-fetched
7. Close and reopen app - verify cache persists

### Edge Cases
- Empty cache on first load
- No notes for a tag
- Network error during fetch
- localStorage full (unlikely but possible)
- Concurrent note edits (last write wins)

---

## 6. Future Enhancements (Not in This PR)

1. **Optimistic Updates**: Update UI immediately, sync with API in background
2. **Sync Indicator**: Show when cache is stale or syncing
3. **Batch Operations**: Cache multiple tag fetches in one call
4. **Prefetching**: Load adjacent tags in background
5. **Cache Expiration**: Add TTL if notes can change from other devices

---

## 7. Files to Modify

1. ✅ `DEVELOPER_GUIDE.md` - Fix verse cache documentation
2. ✅ `src/utils/cacheManager.ts` - Add notes cache functions
3. ✅ `src/api.tsx` - Add caching to getNotes()
4. ✅ `src/store.tsx` - Add force refresh parameter
5. ✅ `src/components/NotesView.tsx` - Update to use cache
6. ✅ `src/components/EditNoteModal.tsx` - Invalidate cache on edit
7. ✅ `src/components/AddTagNoteModal.tsx` - Invalidate cache on add
8. ✅ Git branch - Rename to `feature/notes-caching`

---

## 8. Estimated Effort

- Documentation fix: 5 minutes
- Cache manager implementation: 30 minutes
- API layer update: 15 minutes
- Store update: 10 minutes
- Component updates: 30 minutes
- Testing: 20 minutes
- **Total**: ~2 hours

---

## 9. Questions for Review

1. Should we cache ALL notes on initial load, or only fetch notes per tag?
   - **Recommendation**: Fetch per tag (current behavior) to avoid large initial payload
   
2. Should we add cache expiration (TTL)?
   - **Recommendation**: No, notes only change when user edits them
   
3. Should we show a "cached" indicator to the user?
   - **Recommendation**: No, caching should be transparent
   
4. Should we prefetch notes for other tags in background?
   - **Recommendation**: Not in this PR, add as future enhancement

---

## 10. Branch Naming

**Current**: `new`
**Proposed**: `feature/notes-caching`

**Rationale**: 
- Follows conventional branch naming (feature/*)
- Descriptive of the feature being implemented
- Easier to track in git history

---

## Next Steps

1. Review this plan
2. Get approval for approach
3. Proceed with implementation following the steps above
4. Test thoroughly
5. Submit PR with updated documentation

---

**Author**: Cascade AI  
**Date**: 2026-01-09  
**Status**: Awaiting Review
