import { ActionIcon, Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { useBibleStore } from "../store";
import { useEffect, useState } from "react";
import { useNoteEditor } from "../hooks/useNoteEditor";
import type { NoteVerseReference } from "../hooks/useNoteEditor";
import NoteForm from "./NoteForm";
import { shallow } from "zustand/shallow";

interface AddStandaloneNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

// A standalone note links no verses — the payload shape stays
// stable so the editor hook's dep-driven render is cheap.
const NO_REFERENCES: NoteVerseReference[] = [];

const AddStandaloneNoteModal = ({
  opened,
  onClose,
}: AddStandaloneNoteModalProps) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  // Collapsed = the editor hides completely, leaving a thin
  // header bar (expand chevron + close) over the Bible.
  const [collapsed, setCollapsed] = useState(false);
  const {
    tags,
    getTags,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }), shallow);

  useEffect(() => {
    if (opened) {
      // A rejection already produced a store notification —
      // swallow it so it stays off the global error reporter.
      void getTags().catch(() => {
        /* notified by the store */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const editor = useNoteEditor({
    mode: "create",
    draftKey: "standalone-note",
    verseReferences: NO_REFERENCES,
    onSubmitted: (tagId) => {
      setLastSelectedTagId(tagId || null);
      onClose();
    },
  });

  const collapsedMobile = isMobile && collapsed;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      // No heading on mobile (redundant chrome) — the title
      // slot instead carries the collapse toggle, right-
      // aligned next to the close button via `styles.title`.
      title={
        isMobile ? (
          <ActionIcon
            variant="subtle"
            size="lg"
            title={
              collapsed ? "Expand editor" : "Collapse editor"
            }
            aria-label={
              collapsed ? "Expand editor" : "Collapse editor"
            }
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <IconChevronDown size={18} />
            ) : (
              <IconChevronUp size={18} />
            )}
          </ActionIcon>
        ) : (
          "New note"
        )
      }
      fullScreen
      // Collapsed unlocks scroll/focus so the Bible behind
      // stays readable and scrollable.
      lockScroll={!collapsedMobile}
      trapFocus={!collapsedMobile}
      styles={{
        // Mobile: let the form's editing surface fill the
        // viewport — body is a bounded flex column so the
        // form's flex:1 resolves and the modal content never
        // scrolls (a scrolled content slides the sticky
        // toolbar under the sticky header). Collapsed shrinks
        // the modal to a thin header bar.
        content: isMobile
          ? {
              display: "flex",
              flexDirection: "column",
              ...(collapsed && { height: "auto" }),
            }
          : {},
        body: isMobile
          ? {
              flex: 1,
              display: collapsed ? "none" : "flex",
              flexDirection: "column",
              minHeight: 0,
            }
          : {},
        title: isMobile
          ? {
              display: "flex",
              flex: 1,
              justifyContent: "flex-end",
              alignItems: "center",
            }
          : {},
        overlay: collapsedMobile ? { display: "none" } : {},
      }}
    >
      <NoteForm
        tags={tags}
        fillHeight={isMobile}
        onSubmit={editor.submit}
        submitText="Submit"
        onTagDropdownOpen={() => {
          void getTags().catch(() => {
            /* notified by the store */
          });
        }}
        onAutoSave={editor.save}
        onDraftChange={editor.trackDraft}
        // Staged files ride in the draft — uploads run once a
        // save produces savedNoteId, and a reopen re-stages.
        onFilesChange={editor.trackFiles}
        // Includes files behind already-uploaded images so
        // their thumbs (and remove buttons) survive a reopen.
        initialFiles={editor.draft?.stagedFiles}
        note={
          // Gate on draft content, not just savedNoteId: while
          // the unmount flush's POST is still in flight the id
          // is null but the typed text is already tracked —
          // keying on the id alone would reopen a blank form.
          // Staged files count too: a files-only draft (no
          // text, never saved) must restore its tag.
          editor.draft &&
          (editor.draft.savedNoteId ||
            editor.draft.text ||
            editor.draft.stagedFiles.length > 0)
            ? {
                tagId:
                  editor.draft.tagId || lastSelectedTagId || "",
                text: editor.draft.text,
                isPublic: editor.draft.isPublic,
              }
            : lastSelectedTagId
              ? { tagId: lastSelectedTagId, text: "" }
              : undefined
        }
      />
    </Modal>
  );
};

export default AddStandaloneNoteModal;
