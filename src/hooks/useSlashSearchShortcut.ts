import { useWindowEvent } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";

/**
 * Global `/` shortcut that navigates to the search page.
 *
 * The guard must skip rich-text editors, not just form fields:
 * TipTap renders a `contenteditable` div, so without the
 * `isContentEditable` check typing "/" inside a note editor
 * would hijack the keystroke and navigate away mid-edit.
 */
export const useSlashSearchShortcut = () => {
  const navigate = useNavigate();

  useWindowEvent("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const isEditable =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;
    if (event.key === "/" && !isEditable) {
      event.preventDefault();
      void navigate("/search");
    }
  });
};
