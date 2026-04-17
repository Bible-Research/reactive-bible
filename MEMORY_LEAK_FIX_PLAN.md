# Memory Leak Fix Plan - Test Suite

## Current Status

GitHub Actions and local tests are failing with:
```
Error: Worker terminated due to reaching memory limit: JS heap out of memory
ERR_WORKER_OUT_OF_MEMORY
```

**Test Results:**
- 8 test files failing
- 34 tests failing
- 166 tests passing
- 8 unhandled errors

**Current Memory Allocation:**
- Local: `NODE_OPTIONS='--max-old-space-size=8192'` (8GB)
- GitHub Actions: `NODE_OPTIONS: --max-old-space-size=8192` (8GB)

## Root Causes Identified

### 1. Zustand Persist Middleware Memory Leak
**Location:** `src/stores/__tests__/authStore.test.tsx` (513 lines - largest test file)

**Problem:**
- Original helper created new store instances via `createAuthStore()` for each test
- Zustand's `persist` middleware with localStorage keeps references
- Store instances never get garbage collected
- Memory accumulates across 30+ tests in the file

**Partial Fix Applied:**
- Changed helper to use singleton store (`useAuthStore`)
- Reset state manually instead of creating new instances
- **Status:** Still failing - memory leak persists

### 2. Test File Size and Complexity
**Large Test Files:**
```
513 lines - src/stores/__tests__/authStore.test.tsx
445 lines - src/components/PassageView.performance.test.tsx
340 lines - src/components/__tests__/RegisterPage.test.tsx
330 lines - src/utils/cacheManager.test.ts
225 lines - src/routes/__tests__/TagNotesRoute.test.tsx
```

**Issue:** Running 220+ tests in parallel workers exhausts memory even with 8GB limit.

### 3. Vitest Worker Configuration
**Current Config:** `vite.config.ts`
```typescript
test: {
  globals: true,
  environment: 'happy-dom',
  setupFiles: ["src/setupTests.ts"],
  testTimeout: 30000,
}
```

**Problem:**
- Vitest 0.31.1 doesn't support modern pool/worker options
- No way to limit parallelism in this version
- Workers accumulate memory across test files

## Action Plan

### Phase 1: Immediate Fixes (HIGH Priority)

#### 1.1 Properly Cleanup Zustand Store in Tests
**File:** `src/stores/__tests__/authStore.test.tsx`

**Actions:**
- [ ] Add `afterEach` hook to destroy store subscriptions
- [ ] Clear persist storage completely between tests
- [ ] Use `useAuthStore.destroy()` if available
- [ ] Consider mocking the persist middleware entirely for tests

**Code Example:**
```typescript
afterEach(() => {
  // Clear all subscriptions
  useAuthStore.destroy?.();
  // Clear persist storage
  localStorage.removeItem('auth-storage');
  // Reset to initial state
  useAuthStore.setState(initialState);
});
```

#### 1.2 Split Large Test Files
**Target:** `authStore.test.tsx` (513 lines)

**Actions:**
- [ ] Split into multiple files:
  - `authStore.login.test.tsx` - Login tests
  - `authStore.register.test.tsx` - Registration tests
  - `authStore.logout.test.tsx` - Logout tests
  - `authStore.persistence.test.tsx` - Persistence tests
- [ ] Reduces memory per worker
- [ ] Allows better garbage collection between files

#### 1.3 Upgrade Vitest
**Current:** `vitest@0.31.1`  
**Target:** `vitest@latest` (1.x or 2.x)

**Benefits:**
- Modern pool configuration options
- Better memory management
- `pool: 'forks'` with `singleFork: true` option
- `fileParallelism: false` option

**Actions:**
- [ ] Update `package.json` dependencies
- [ ] Update test configuration in `vite.config.ts`
- [ ] Test compatibility with existing tests

### Phase 2: Configuration Optimizations (MEDIUM Priority)

#### 2.1 Run Tests Sequentially
**File:** `package.json`

**Change:**
```json
"test": "NODE_OPTIONS='--max-old-space-size=8192' vitest run --no-threads"
```

**Note:** `--no-threads` forces sequential execution (slower but uses less memory)

#### 2.2 Add Test Sharding for CI
**File:** `.github/workflows/test.yml`

**Actions:**
- [ ] Split tests into multiple jobs
- [ ] Run different test suites in parallel jobs
- [ ] Each job gets its own memory allocation

**Example:**
```yaml
jobs:
  test-unit:
    runs-on: ubuntu-latest
    env:
      NODE_OPTIONS: --max-old-space-size=8192
    steps:
      - run: npm test -- src/components
      
  test-stores:
    runs-on: ubuntu-latest
    env:
      NODE_OPTIONS: --max-old-space-size=8192
    steps:
      - run: npm test -- src/stores
```

#### 2.3 Mock Heavy Dependencies
**Targets:**
- MSW server (mock API calls)
- Mantine components
- React Router

**Actions:**
- [ ] Review MSW usage - may be keeping responses in memory
- [ ] Mock heavy UI components in unit tests
- [ ] Use lighter test environment (jsdom vs happy-dom)

### Phase 3: Test Refactoring (LOW Priority)

#### 3.1 Reduce Test Duplication
**Issue:** Similar test patterns repeated across files

**Actions:**
- [ ] Create shared test utilities
- [ ] Reduce number of `renderHook` calls
- [ ] Reuse test fixtures instead of recreating

#### 3.2 Add Memory Profiling
**Actions:**
- [ ] Add `--expose-gc` flag for manual garbage collection
- [ ] Profile memory usage per test file
- [ ] Identify specific leaking tests

**Command:**
```bash
NODE_OPTIONS='--max-old-space-size=8192 --expose-gc' vitest run --reporter=verbose
```

#### 3.3 Skip Performance Tests in CI
**Files:**
- `PassageView.performance.test.tsx` (445 lines)
- `Passage.performance.test.tsx` (178 lines)
- `cacheManager.performance.test.ts` (223 lines)

**Actions:**
- [ ] Mark with `test.skip` or separate test command
- [ ] Run only on-demand, not in CI
- [ ] Reduces memory pressure

## Implementation Order

### Week 1: Critical Fixes
1. ✅ Increase memory to 8GB (DONE)
2. ✅ Fix authStore helper to use singleton (DONE - but insufficient)
3. **TODO:** Properly cleanup Zustand subscriptions in `afterEach`
4. **TODO:** Split `authStore.test.tsx` into 4 smaller files
5. **TODO:** Test with `--no-threads` flag

### Week 2: Upgrade & Optimize
1. **TODO:** Upgrade Vitest to latest version
2. **TODO:** Configure modern pool options
3. **TODO:** Add test sharding to GitHub Actions
4. **TODO:** Profile memory usage to find remaining leaks

### Week 3: Refactor
1. **TODO:** Reduce test duplication
2. **TODO:** Skip performance tests in CI
3. **TODO:** Review and optimize MSW usage

## Success Criteria

- [ ] All tests pass in GitHub Actions without memory errors
- [ ] Local tests complete without memory errors
- [ ] Test duration < 5 minutes
- [ ] Memory usage < 6GB (leaving 2GB headroom)

## Rollback Plan

If fixes don't work:
1. Temporarily skip failing test files with `test.skip`
2. Run tests in separate CI jobs (sharding)
3. Consider switching to Jest (different memory model)

## Notes

- The memory leak is NOT in the application code, only in tests
- Production build is unaffected
- Issue is specific to how Zustand + persist middleware behaves in test environment
- May need to mock persist middleware entirely for tests
