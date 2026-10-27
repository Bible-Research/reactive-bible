import {
  Affix,
  Box,
  Button,
  Checkbox,
  FileButton,
  Group,
  Select,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconCheck, IconPhoto } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { NoteImage, Tag } from "../types";
import { commentImageName } from "../utils/commentTree";
import { toPlainText } from "../utils/tiptapContent";
import {
  useStagedImages,
  ALLOWED_IMAGE_TYPES,
  IMAGE_THUMB_STYLE,
} from "../hooks/useStagedImages";
import {
  RemoveImageButton,
  UnavailableThumb,
} from "./CommentImageGrid";
import RichTextEditor from "./RichTextEditor";

interface NoteFormProps {
  tags: Tag[];
  note?: { tagId: string; text: string };
  /**
   * May resolve `false` to signal a rejected submit (failed
   * validation or save) — the content then stays eligible for
   * the unmount flush. Any other resolved value counts as
   * persisted.
   */
  onSubmit: (
    tagId: string,
    text: string
  ) => void | Promise<unknown>;
  /**
   * Permits saves and submits with no note text — the caller
   * sets it when the note still links verse references, so
   * the form holds content even with an empty editor. Without
   * it an empty note is rejected as before.
   */
  allowEmptyText?: boolean;
  submitText: string;
  onTagDropdownOpen: () => void;
  onAutoSave?: (tagId: string, text: string) => Promise<unknown>;
  /**
   * Called after a save triggered by the unmount flush
   * resolves — the parent's own close handler already ran, so
   * this is its only chance to react (e.g. refetch stale UI).
   */
  onUnmountedSave?: () => void;
  /**
   * Reports every draft change so an outer draft store can
   * restore the autosaved note after the form remounts (the
   * modal unmounts it on close).
   */
  onDraftChange?: (tagId: string, text: string) => void;
  /** Images already attached to the note (edit mode). */
  existingImages?: NoteImage[];
  /** Delete an attached image (owner-gated by the parent). */
  onDeleteImage?: (imageId: string) => void | Promise<void>;
  /**
   * A rendered attached image failed to load — its signed
   * URL expired; the parent refetches fresh ones.
   */
  onImageError?: (src: string) => void;
  /**
   * Edit mode: validated files upload immediately against
   * the existing note instead of staging for the next save.
   */
  onAttachFiles?: (files: File[]) => void;
  /**
   * Create mode: reports the staged File[] after every
   * change so the editor draft can carry pending uploads
   * across remounts.
   */
  onFilesChange?: (files: File[]) => void;
  /** Re-staged files from a restored editor draft. */
  initialFiles?: File[];
}

const AUTOSAVE_INTERVAL_MS = 5000;
const SAVED_FLASH_MS = 500;
// Mirrors the backend's IMAGE_MAX_PER_NOTE (comments cap
// lower, at 5).
const MAX_NOTE_IMAGES = 10;

// Marks `save` as the in-flight write until it settles. The
// tracked promise never rejects, so awaiting the lock stays safe
// even when the underlying save fails.
const trackInFlight = (
  ref: React.MutableRefObject<Promise<void> | null>,
  save: Promise<unknown>
) => {
  const tracked = save.then(
    () => undefined,
    () => undefined
  );
  ref.current = tracked;
  void tracked.finally(() => {
    if (ref.current === tracked) {
      ref.current = null;
    }
  });
  return save;
};

const NoteForm = ({
  tags,
  note,
  onSubmit,
  allowEmptyText = false,
  submitText,
  onTagDropdownOpen,
  onAutoSave,
  onUnmountedSave,
  onDraftChange,
  existingImages = [],
  onDeleteImage,
  onImageError,
  onAttachFiles,
  onFilesChange,
  initialFiles,
}: NoteFormProps) => {
  const [selectedTagId, setSelectedTagId] = useState(note?.tagId || "");
  const [noteText, setNoteText] = useState(note?.text || "");
  const [autoSave, setAutoSave] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // Staged image attachments — create mode reports them so
  // the editor draft can upload them once the note exists;
  // edit mode hands validated files to `onAttachFiles`
  // instead.
  const {
    staged,
    fileError,
    addFiles,
    reportFiles,
    removeStaged,
    markStagedFailed,
  } = useStagedImages({
    maxImages: MAX_NOTE_IMAGES,
    existingCount: existingImages.length,
    parentNoun: 'note',
    initialFiles,
    onChange: onFilesChange,
  });
  const totalAttached = existingImages.length + staged.length;
  const latest = useRef({ tagId: "", text: "", attachedCount: 0 });
  const onAutoSaveRef = useRef(onAutoSave);
  const onUnmountedSaveRef = useRef(onUnmountedSave);
  const onDraftChangeRef = useRef(onDraftChange);
  const autoSaveRef = useRef(autoSave);
  const allowEmptyTextRef = useRef(allowEmptyText);
  // Shared save lock for autosave ticks and submit: overlapping
  // writes could POST two notes for one draft (or let stale text
  // win over a submit), so both paths must respect it.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flashTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = {
      tagId: selectedTagId,
      text: noteText,
      // Attached + staged — an image-only note in edit
      // mode (all images already uploaded, none staged)
      // still counts as content.
      attachedCount: totalAttached,
    };
    onAutoSaveRef.current = onAutoSave;
    onUnmountedSaveRef.current = onUnmountedSave;
    onDraftChangeRef.current = onDraftChange;
    autoSaveRef.current = autoSave;
    allowEmptyTextRef.current = allowEmptyText;
  });

  // Keep the outer draft store in sync — a reopened modal
  // restores `note` from it.
  useEffect(() => {
    onDraftChangeRef.current?.(selectedTagId, noteText);
  }, [selectedTagId, noteText]);

  // Sync on the primitive fields, not the `note` object itself:
  // every call site passes a fresh inline object each render, so
  // keying on identity would wipe in-progress edits whenever the
  // parent re-renders (linked-notes fetches, verse picker, etc.).
  const noteTagId = note?.tagId;
  const noteTextProp = note?.text;
  useEffect(() => {
    if (noteTagId !== undefined && noteTextProp !== undefined) {
      setSelectedTagId(noteTagId);
      setNoteText(noteTextProp);
    }
  }, [noteTagId, noteTextProp]);

  // The last content autosave persisted — ticks that would write
  // the same payload again are skipped.
  const lastSavedRef = useRef<{ tagId: string; text: string } | null>(
    null
  );
  // Set once a submit persisted the form: the hook deletes the
  // draft, so the unmount flush must not run — a late save
  // would recreate it with `savedNoteId: null` and POST a
  // duplicate of the just-submitted note.
  const submittedRef = useRef(false);

  // Unmount = the modal closed (Mantine unmounts content, and
  // parents drop the modal itself). Flush the unsaved tail so
  // a close inside the autosave window does not drop the last
  // seconds of typing.
  useEffect(
    () => () => {
      const save = onAutoSaveRef.current;
      if (!save || !autoSaveRef.current) return;
      const { tagId, text, attachedCount } = latest.current;
      // A verse-linked note may flush with empty text, and a
      // note with only images (staged or already attached)
      // is content too; a truly empty note (no text, no
      // images, nothing linked) is skipped.
      if (!tagId) return;
      if (
        !allowEmptyTextRef.current &&
        !toPlainText(text).trim() &&
        attachedCount === 0
      ) {
        return;
      }
      // Chain behind an in-flight save — the draft's note id
      // only exists once its POST resolves.
      const chain = inFlightRef.current ?? Promise.resolve();
      void chain
        .then(() => {
          // Decide HERE, once the in-flight write settled —
          // not at unmount. A submit still in flight marks
          // lastSavedRef/submittedRef only when it resolves,
          // and that resolve also deletes the draft: flushing
          // anyway would POST the same text into a fresh
          // draft as a duplicate note.
          if (submittedRef.current) return undefined;
          const last = lastSavedRef.current;
          if (
            last &&
            last.tagId === tagId &&
            last.text === text
          ) {
            return undefined;
          }
          return save(tagId, text);
        })
        .then(() => onUnmountedSaveRef.current?.())
        .catch((error) => console.error(error));
    },
    []
  );

  useEffect(() => {
    if (!autoSave) return;
    const tick = () => {
      const save = onAutoSaveRef.current;
      if (!save || inFlightRef.current) return;
      const { tagId, text, attachedCount } = latest.current;
      // Skip contentless notes AND empty tag — the latter
      // used to POST `tag: ''` every 5s, a stream of silent
      // 400s. Verse-linked and image-only notes (staged or
      // already attached) may save with empty text.
      if (!tagId) return;
      if (
        !allowEmptyTextRef.current &&
        !toPlainText(text).trim() &&
        attachedCount === 0
      ) {
        return;
      }
      const last = lastSavedRef.current;
      if (last && last.tagId === tagId && last.text === text) {
        return;
      }
      trackInFlight(inFlightRef, save(tagId, text))
        .then((result) => {
          // A resolved-false save was declined — the content
          // stays dirty so the next tick or the unmount
          // flush retries, and the saved check must not
          // flash for a write that never happened.
          if (result === false) return;
          lastSavedRef.current = { tagId, text };
          setSavedFlash(true);
          flashTimeout.current = window.setTimeout(
            () => setSavedFlash(false),
            SAVED_FLASH_MS
          );
        })
        .catch((error) => console.error(error));
    };
    const interval = window.setInterval(tick, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoSave]);

  useEffect(
    () => () => {
      if (flashTimeout.current) {
        window.clearTimeout(flashTimeout.current);
      }
    },
    []
  );

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    // Guard empty submissions — the API would reject a
    // tagless note, and a note with neither text nor linked
    // verses carries nothing.
    if (!selectedTagId) {
      showNotification({
        title: 'Cannot save note',
        message: 'Please choose a tag.',
        color: 'red',
      });
      return;
    }
    if (
      !allowEmptyText &&
      !toPlainText(noteText).trim() &&
      totalAttached === 0
    ) {
      showNotification({
        title: 'Cannot save note',
        message: 'Add note text or attach an image.',
        color: 'red',
      });
      return;
    }
    // Wait for an in-flight autosave first: the parent then sees
    // the created note id and PATCHes instead of POSTing a
    // duplicate. Holding the lock while submitting also keeps an
    // interval tick from interleaving a write mid-submit.
    await inFlightRef.current;
    try {
      const result = await trackInFlight(
        inFlightRef,
        Promise.resolve(onSubmit(selectedTagId, noteText))
      );
      // `false` signals a rejected submit — leave the content
      // eligible for the unmount flush. Anything else means the
      // content is persisted; mark it saved so the flush does
      // not rewrite it on close. submittedRef additionally
      // covers text typed after the submit click: the draft is
      // finished, so those edits must not spawn a second note.
      if (result !== false) {
        submittedRef.current = true;
        lastSavedRef.current = {
          tagId: selectedTagId,
          text: noteText,
        };
        // Staged thumbs are NOT cleared here: a successful
        // submit closes the modal (the hook's unmount cleanup
        // revokes the object URLs), and clearing would also
        // report an empty File[] to a draft slot the editor
        // just deleted — recreating a ghost draft.
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileSelect = (files: File[]) => {
    if (onAttachFiles) {
      // Edit mode: the note already exists, so validated
      // files upload immediately instead of staging.
      const accepted = reportFiles(files);
      if (accepted.length > 0) onAttachFiles(accepted);
      return;
    }
    addFiles(files);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Select
        variant="transparent"
        label="Tag"
        // Select by id — mapping by name silently picked the
        // first of two same-named tags.
        value={selectedTagId || null}
        onChange={(item: string | null) => {
          setSelectedTagId(item ?? "");
        }}
        onDropdownOpen={onTagDropdownOpen}
        data={tags.map((tag) => ({
          value: tag.id,
          label: tag.name,
        }))}
        searchable
        maxDropdownHeight={window.innerHeight * 0.7}
      />
      <RichTextEditor
        variant="note"
        label="Note"
        value={noteText}
        onChange={setNoteText}
      />
      {(existingImages.length > 0 || staged.length > 0) && (
        <Group spacing={6} mt={6} align="flex-start">
          {existingImages.map((img) => {
            const src = img.signed_url;
            const name = commentImageName(img);
            return (
              <Box
                key={img.id}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                {src ? (
                  <img
                    src={src}
                    alt={name}
                    onError={() => onImageError?.(src)}
                    style={IMAGE_THUMB_STYLE}
                  />
                ) : (
                  <UnavailableThumb
                    label={`${name} (unavailable)`}
                  />
                )}
                {onDeleteImage && (
                  <RemoveImageButton
                    label={`Remove image ${name}`}
                    offset={2}
                    onClick={() => onDeleteImage(img.id)}
                  />
                )}
              </Box>
            );
          })}
          {staged.map((s) => (
            <Box
              key={s.id}
              style={{
                position: 'relative',
                display: 'inline-block',
              }}
            >
              {s.failed ? (
                <UnavailableThumb
                  label={`${s.file.name} (unavailable)`}
                />
              ) : (
                <img
                  src={s.url}
                  alt={s.file.name}
                  style={IMAGE_THUMB_STYLE}
                  onError={() => markStagedFailed(s.id)}
                />
              )}
              <RemoveImageButton
                label={`Remove staged image ${s.file.name}`}
                offset={2}
                onClick={() => removeStaged(s.id)}
              />
            </Box>
          ))}
        </Group>
      )}
      {fileError && (
        <Text size="xs" color="red" mt={4}>
          {fileError}
        </Text>
      )}
      <Box
        data-testid="note-submit-bar"
        sx={(theme) => ({
          position: "sticky",
          bottom: 0,
          padding: theme.spacing.xs,
          zIndex: 1,
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[7]
              : theme.white,
          borderTop: `1px solid ${
            theme.colorScheme === "dark"
              ? theme.colors.dark[4]
              : theme.colors.gray[3]
          }`,
        })}
      >
        <Group spacing="xs">
          <Button variant="transparent" type="submit" fullWidth>
            {submitText}
          </Button>
          {(onAttachFiles || onFilesChange) && (
            <FileButton
              onChange={handleFileSelect}
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              disabled={totalAttached >= MAX_NOTE_IMAGES}
            >
              {(props) => (
                <Button
                  {...props}
                  variant="transparent"
                  leftIcon={<IconPhoto size={14} />}
                  disabled={totalAttached >= MAX_NOTE_IMAGES}
                  aria-label="Attach images"
                >
                  {totalAttached > 0
                    ? `${totalAttached}/${MAX_NOTE_IMAGES}`
                    : 'Images'}
                </Button>
              )}
            </FileButton>
          )}
          {onAutoSave && (
            <Checkbox
              label="Auto save"
              checked={autoSave}
              onChange={(event) =>
                setAutoSave(event.currentTarget.checked)
              }
            />
          )}
        </Group>
      </Box>
      {savedFlash && (
        <Affix position={{ top: 20, right: 20 }}>
          <ThemeIcon color="green" variant="filled" radius="xl">
            <IconCheck size={16} />
          </ThemeIcon>
        </Affix>
      )}
    </form>
  );
};

export default NoteForm;
