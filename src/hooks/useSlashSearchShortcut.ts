import { useWindowEvent } from "@mantine/hooks";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Global `/` shortcut that navigates to the search page.
 *
 * The guard must skip rich-text editors and form fields: TipTap
 * renders a `contenteditable` div, so without the
 * `isContentEditable`/closest check typing "/" inside a note
 * editor would hijack the keystroke and navigate away
 * mid-edit.
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
    navigate("/search");
  });
};
