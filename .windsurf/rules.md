# Windsurf Rules for Reactive Bible

## Project Context

**Reactive Bible** is a Bible reading application built with:
- React 18 + TypeScript
- Vite (build tool)
- Mantine v6 (UI library)
- Zustand (state management with localStorage persistence)
- Howler.js (audio playback)
- Vitest + React Testing Library (testing)

### Key Features
- Offline Bible reading (KJV stored locally in kjv.json)
- Online Bible translations (ESV via Bible Research API)
- Audio Bible playback with auto-advance
- Full-text search with autocomplete
- Verse tagging and note-taking
- Light/Dark theme with persistence

---

## Code Standards

### TypeScript
- Use strict typing, avoid `any` when possible
- Define interfaces for all data structures
- Use type inference where appropriate

### Code Style
- **Max line length: 79 characters** (CRITICAL - user requirement)
- Use functional components with hooks only (no class components)
- Use arrow functions for component definitions
- Prefer `const` over `let`, avoid `var`

### Component Patterns
- Functional components only
- Use React hooks (useState, useEffect, useRef, etc.)
- Extract custom hooks for reusable logic
- Keep components focused and single-responsibility

### State Management
- **Global state**: Use Zustand store (`useBibleStore`)
- **Component state**: Use local `useState` for UI-only state
- **Derived state**: Calculate from existing state, don't store
- Access store: `const value = useBibleStore(state => state.property)`
- Update store: `const setValue = useBibleStore(state => state.setValue)`

### Styling
- Use Mantine's `createStyles` hook for component styles
- Follow existing theme patterns (dark/light mode support)
- Use Mantine components for consistency
- Responsive design with Mantine breakpoints

### File Organization
- Components: `src/components/ComponentName.tsx`
- API functions: `src/api.tsx` (centralized data access)
- State: `src/store.tsx` (Zustand store)
- Utils: `src/utils/` (helper functions, caching)
- Tests: `ComponentName.test.tsx` (co-located with components)

---

## Architecture Patterns

### Data Flow
1. User interaction → Update Zustand store
2. Store update → Components re-render (via subscription)
3. Component needs data → Call API function
4. API function → Check cache first
5. Cache miss → Fetch from API/JSON
6. Store in cache → Return data

### Caching Strategy
- **Verse cache**: LRU with 500-verse limit (copyright compliance)
- **Audio cache**: Unlimited with expiration handling
- Always check cache before fetching
- Cache key format: `{version}:{book}:{chapter}:{verse}`
- Use functions from `src/utils/cacheManager.ts`

### API Integration
- All API calls in `src/api.tsx`
- KJV: Direct access to local `kjv.json`
- ESV: Fetch from Bible Research API with caching
- Audio: Different sources per translation (KJV=wordpocket, ESV=API)
- Handle errors gracefully with user-friendly messages

---

## Testing Requirements
Don't run any tests.

---

## Documentation Requirements

### CRITICAL: Always Update DEVELOPER_GUIDE.md

**After ANY functionality change, you MUST update DEVELOPER_GUIDE.md**

Update these sections based on your changes:
- **New feature** → [Core Functionalities](#core-functionalities)
- **New component** → [Component Structure](#component-structure)
- **API changes** → [API Integration](#api-integration)
- **State changes** → [State Management](#state-management)
- **Cache changes** → [Caching System](#caching-system)
- **Architecture changes** → [Architecture](#architecture) and [Data Flow](#data-flow)

### Documentation Checklist
- [ ] Updated relevant sections in DEVELOPER_GUIDE.md
- [ ] Added code examples for new patterns
- [ ] Updated data flow if changed
- [ ] Added new dependencies to Tech Stack
- [ ] Updated API endpoints if changed
- [ ] Updated Table of Contents if needed

---

## Common Development Tasks

### Adding a New Bible Translation

1. Update `src/api.tsx`:
   ```typescript
   export const getVersesInNIVChapter = async (
     book: string, 
     chapter: number
   ) => {
     // Implement fetch logic with caching
     const cached = getCachedVerses(book, chapter, 'NIV');
     if (cached) return cached;
     
     const verses = await fetchFromAPI();
     cacheVerses(book, chapter, 'NIV', verses);
     return verses;
   };
   
   // Update main function
   export const getVersesInChapter = async (...) => {
     if (version === 'NIV') {
       return await getVersesInNIVChapter(...);
     }
     // ...
   };
   ```

2. Update version toggle component
3. Update DEVELOPER_GUIDE.md with new translation info

### Adding a New Component

1. Create `src/components/ComponentName.tsx`
2. Follow existing patterns (functional, TypeScript, Mantine)
3. Connect to Zustand store if needed
4. Add tests in `ComponentName.test.tsx`
5. Import and use in parent component
6. Update DEVELOPER_GUIDE.md Component Structure section

### Debugging Tips

- **State issues**: Use React DevTools to inspect Zustand store
- **Cache issues**: Check localStorage in browser DevTools
- **API issues**: Check Network tab for failed requests
- **Audio issues**: Check console for Howler.js errors
- **Build issues**: Check TypeScript errors with `npm run build`

---

## Git Workflow

### Commit Messages
Follow conventional commits with **UPPERCASE type and capitalized message**:
- `Feat: Add new feature`
- `Fix: Resolve bug`
- `Docs: Update documentation`
- `Refactor: Restructure code`
- `Test: Add tests`
- `Chore: Update dependencies`

**Format**: `Type: Capitalized message description`

Examples:
- ✅ `Feat: Add Vercel Analytics integration`
- ✅ `Fix: Resolve audio playback issue on Safari`
- ✅ `Docs: Update DEVELOPER_GUIDE with caching strategy`
- ❌ `feat: add analytics` (lowercase - incorrect)
- ❌ `Feat: add analytics` (message not capitalized - incorrect)

### Before Submitting PR
1. **Documentation updated**: DEVELOPER_GUIDE.md
2. Code follows style guidelines
3. All changes committed with clear messages

---

## Key Files Reference

- `src/App.tsx` - Main app shell, theme provider, layout
- `src/store.tsx` - Zustand state management
- `src/api.tsx` - All API functions and data access
- `src/utils/cacheManager.ts` - Caching logic (verse & audio)

---

## Windsurf-Specific Instructions

When working on this project:

1. **Always check DEVELOPER_GUIDE.md first** for context
2. **Follow the 79-character line limit strictly**
3. **Update documentation immediately** after code changes
4. **Use existing patterns** - don't introduce new patterns without discussion
5. **Cache-first approach** - always check cache before fetching
6. **Error handling** - provide user-friendly error messages
7. **TypeScript strict** - no `any` types unless absolutely necessary
8. **Functional components** - no class components
9. **Zustand for global state** - don't use Context API or Redux
10. **At the end of a plan, prepare a PR description in `PR_DESCRIPTION.md`. This file should not be committed.**
