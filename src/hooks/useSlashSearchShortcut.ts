import { useWindowEvent } from "@mantine/hooks";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Global `/` shortcut that navigates to the search page.
 *
 * The guard must skip rich-text editors, not just form fields:
 * TipTap renders a `contenteditable` div, so without the
 * `isContentEditable`/`closest` checks typing "/" inside a
 * note editor would hijack the keystroke, navigate away, and
 * destroy the draft. On `/search` itself the key is left
 * un-prevented so no duplicate history entry is pushed.
 */
export const useSlashSearchShortcut = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useWindowEvent("keydown", (event) => {
    if (event.key !== "/" || event.isComposing) return;
    // Already on the search page — another "/" must not push a
    // duplicate history entry or swallow the keystroke.
    if (location.pathname === "/search") return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      // Bail while typing: inputs, selects, and contenteditable
      // surfaces (TipTap's .ProseMirror) — otherwise the
      // swallowed "/" navigates away and destroys drafts.
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable ||
        target.closest("[contenteditable]") !== null
      ) {
        return;
      }
    }
    event.preventDefault();
    void navigate("/search");
  });
};
