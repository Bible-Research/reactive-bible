# Integration Tests

This directory contains integration tests that test multiple components
working together.

## Guidelines

- Test complete user workflows (e.g., create → edit → delete note)
- Test component interactions
- Test data flow between components
- Use real components (minimal mocking)

## Suites

- `protected-tags.test.tsx` - /tags route protection (issue
  #68): anonymous visitors redirect to /login while public
  share pages stay reachable
- `tag-refresh.test.tsx` - Tags force-refresh on navigating to
  TagNotesRoute, BibleRoute, and TagManagementRoute
