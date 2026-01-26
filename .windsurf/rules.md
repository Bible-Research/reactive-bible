# Windsurf Rules for Reactive Bible

This file contains essential, high-priority rules that supplement the main `DEVELOPER_GUIDE.md`. While the developer guide describes the project's architecture and patterns, this file lists prescriptive rules for code style and workflow to ensure consistency.

---

## 1. Code Style

- **Max line length: 79 characters** (CRITICAL - user requirement)
- Use functional components with hooks only (no class components).
- Prefer `const` over `let`; avoid `var`.

---

## 2. Git Commit Messages

Follow the conventional commit format with an **UPPERCASE type and a capitalized message**.

**Format**: `Type: Capitalized message description`

- `Feat: Add new feature`
- `Fix: Resolve bug`
- `Docs: Update documentation`
- `Refactor: Restructure code`
- `Test: Add tests`
- `Chore: Update dependencies`

**Examples**:
- ✅ `Feat: Add Vercel Analytics integration`
- ✅ `Fix: Resolve audio playback issue on Safari`
- ❌ `feat: add analytics` (Incorrect: type must be uppercase)
- ❌ `Feat: add analytics` (Incorrect: message must be capitalized)

---

## 3. Git Workflow

- **Commit frequently**: After completing a logical unit of work (e.g., a single step in a plan), create a git commit. This keeps the project history clean and easy to follow.
- **Never commit to `main`**: All changes must be made on a feature branch. The `main` branch should only be updated through pull requests.

---

## 4. Documentation (CRITICAL)

**After ANY functionality change, you MUST update `DEVELOPER_GUIDE.md`**.

This is the most important rule. The developer guide must always be the single source of truth for the project's implementation details.

---

## 5. Testing

- After making code changes, run tests relevant to the modified files to ensure your changes are safe.
- For example, if you edit a component, run its corresponding test file.
- Before submitting a pull request, run the full test suite (`npm test`) to catch any unintended side effects.
- **Run tests in CI mode**: When running the test suite, ensure it executes once and exits without watching for changes. Use `npm test -- --run` to prevent the terminal from hanging.

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
