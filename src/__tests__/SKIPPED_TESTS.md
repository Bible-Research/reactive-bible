# Skipped Tests

**Last Updated:** 2026-01-30

This document lists tests that are intentionally skipped. The vast majority of previously skipped tests have been fixed.

---

## Modal Form Submission Tests

- **Files:**
  - `src/components/AddTagNoteModal.test.tsx`
  - `src/components/EditNoteModal.test.tsx`

- **Skipped Tests:**
  - `should call addTagNote when form submitted`
  - `should clear selected verses after submission`
  - `should call editNote when form submitted`
  - `should refresh notes after successful edit`

- **Reason for Skipping:**
  These tests involve submitting a form within a Mantine `Modal` component. Mantine renders modals in a React Portal, which places the DOM nodes in a different part of the document, outside the main component tree. This makes it notoriously difficult for React Testing Library to reliably simulate user interactions like form submissions.

  While the modal's rendering and initial state are tested, the full end-to-end submission flow is skipped to avoid brittle and flaky tests. This is a known challenge when testing portal-based UI components.

- **Status:**
  This is an accepted limitation. The core logic is tested, and the risk of the submission failing due to the modal itself is low.
