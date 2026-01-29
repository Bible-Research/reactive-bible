# ~~Current Issue: `api.test.ts` Failure~~ ✅ RESOLVED

**Date:** 2026-01-29  
**File:** `src/api.test.ts`  
**Test:** `should throw an error if the fetch response is not ok`  
**Status:** ✅ **RESOLVED**

## Problem

The test was failing with the error:

```
Error: promise resolved "http://audio.url/test.mp3" instead of rejecting
```

This indicated that the `getBibleAudioUrl` function was not throwing an error as expected. The test was designed to verify that the function correctly handles a 404 Not Found response from the API.

## Root Cause

The issue stemmed from a conflict between the default MSW (Mock Service Worker) handler in `src/mocks/handlers.ts` and the specific error-handling logic required for this test.

The default handler for `/bible` requests was too broad and provided a successful response for all audio requests, preventing the test's specific error condition from being met.

## Solution ✅

The issue was resolved by **simplifying the approach**:

1. **Used a unique fileset ID:** Changed the test to use `'ERRORTEST'` instead of `'ESVDA'` as the fileset ID.
2. **Specific handler with passthrough:** Modified the test's MSW handler to:
   - Return a 404 error only for the specific `'ERRORTEST'` fileset
   - Return `undefined` for all other requests, allowing them to pass through to the default handler
3. **Kept default handler simple:** Removed any error-specific logic from the default handler in `src/mocks/handlers.ts`

### Code Changes

**File:** `src/api.test.ts`
```typescript
it('should throw an error if the fetch response is not ok', async () => {
  // Use a specific handler that returns 404 for a specific fileset
  server.use(
    http.get(`${API_URL}/bible`, ({ request }) => {
      const url = new URL(request.url);
      const filesetId = url.searchParams.get('fileset_id');
      
      // Only return 404 for this specific test case
      if (filesetId === 'ERRORTEST') {
        return new HttpResponse(null, { status: 404, statusText: 'Not Found' });
      }
      
      // Let other requests pass through to default handler
      return;
    })
  );

  localStorage.clear();

  await expect(api.getBibleAudioUrl('Genesis', 1, 'ERRORTEST')).rejects.toThrow(
    'Failed to fetch audio for ERRORTEST: Not Found'
  );
});
```

## Test Results ✅

```
✓ Test Files  21 passed (21)
✓ Tests  103 passed | 11 skipped (114)
```

**All tests are now passing!** The Vercel compliance plan can now proceed to Phase 2.

## Key Learnings

1. **Simplicity wins:** Using a unique identifier (`'ERRORTEST'`) avoided conflicts entirely
2. **Passthrough pattern:** Returning `undefined` from MSW handlers allows requests to fall through to default handlers
3. **Test isolation:** Each test should use unique data that won't conflict with other tests or default handlers
