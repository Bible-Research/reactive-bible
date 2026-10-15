# Integration Tests

This directory contains integration tests that test multiple components
working together.

## Guidelines

- Test complete user workflows (e.g., create → edit → delete note)
- Test component interactions
- Test data flow between components
- Use real components (minimal mocking)

## History

This directory is currently empty of test files. Its two former
suites were removed in the test-quality sweep (see
`docs/plans/test-quality-implementation-plan.md`, JOB-5/JOB-7):

- `parallel-async.test.tsx` was deleted — it tested only its own
  mocks, no production code.
- `notes-workflow.test.tsx` was deleted — its meaningful
  assertions (modal close + verse-selection clearing) were ported
  into `src/components/AddTagNoteModal.test.tsx`.
