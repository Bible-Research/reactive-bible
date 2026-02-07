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
- `parallel-async.test.tsx` - Parallel data fetching and Vercel best practices
