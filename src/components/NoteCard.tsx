import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Box, Group, Title } from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import { Note, NoteOrderMenuData } from "../types";
import { useNoteImages } from "../hooks/useNoteImages";
import { useBibleStore } from "../store";
import NoteOrderMenu from "./NoteOrderMenu";
import CommentThread from "./CommentThread";
import CommentImageGrid from "./CommentImageGrid";
import Lightbox from "./Lightbox";
import ScripturePassagePopover from "./ScripturePassagePopover";
import useScriptureRefPreview from "../hooks/useScriptureRefPreview";
import RichTextView from "./RichTextView";
import NoteCardActions from "./NoteCardActions";
import NoteVerseList from "./NoteVerseList";
import { noteHeading } from "../utils/noteHeading";

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
  onPlayFromNote?: (noteId: string) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
  /** Verse selection scope — defaults to the note id. The drag
   *  overlay passes a distinct scope so it never shares DOM ids or
   *  selection state with the real card. */
  verseScope?: string;
  /**
   * True when the viewed tag is in the caller's own tag list.
   * Production notes do not send `is_owner` yet — without this,
   * owners could not edit/delete notes on their own tags.
   */
  isTagOwner?: boolean;
  dragHandleProps?: {
    ref?: (element: HTMLElement | null) => void;
    [key: string]: unknown;
  };
  /** When present (custom sort + authenticated), renders the
   *  `#k` order badge + move dropdown in the action group. */
  orderMenu?: NoteOrderMenuData;
}

const NoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  onPlayFromNote,
  commentCount,
  onCountChange,
  verseScope,
  isTagOwner,
  dragHandleProps,
  orderMenu,
}: NoteCardProps) => {
  const scope = verseScope ?? note.id;
  const [threadOpen, setThreadOpen] = useState(false);
  const [lightboxImageId, setLightboxImageId] =
    useState<string | null>(null);

  // Note payloads carry no image list — each card lazily
  // GETs /notes/{id}/images/ once it nears the viewport.
  // The 200 px margin prefetches ahead of the scroll so
  // thumbs are in place before the card is visible. The
  // gate latches: a card that scrolls back out keeps the
  // images it already fetched.
  const { ref: cardRef, entry: intersectionEntry } =
    useIntersection<HTMLDivElement>({ rootMargin: '200px' });
  // Where IntersectionObserver is missing entirely (old
  // WebViews), fetch on mount instead of never fetching.
  const [imagesEnabled, setImagesEnabled] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );
  useEffect(() => {
    if (intersectionEntry?.isIntersecting) {
      setImagesEnabled(true);
    }
  }, [intersectionEntry]);
  // The shared session store dedupes this fetch with the
  // drag-overlay card and the edit modal for the same note.
  const { images, refresh: refreshImages } = useNoteImages(
    note.id,
    imagesEnabled
  );

  // A signed URL that failed to load (the 600 s TTL can
  // lapse inside a session) triggers a bounded refetch —
  // the store caps retries per image set and collapses
  // concurrent thumb errors into one request.
  const handleImageError = useCallback(() => {
    refreshImages();
  }, [refreshImages]);
  // Clicked '@…' refs open the passage in a floating popover
  // anchored at the ref — never inline in the card.
  const {
    preview: passagePreview,
    error: passageError,
    open: openPassage,
    close: closePassage,
  } = useScriptureRefPreview();

  // useCallback keeps memo(RichTextView)'s onScriptureRef
  // prop stable across NoteCard re-renders.
  const onGrabBiblePassage = useCallback(
    (hashtag: string, anchorEl: HTMLElement): void => {
      openPassage(hashtag, anchorEl);
    },
    [openPassage]
  );

  const heading = noteHeading(note);
  const lightboxImage =
    images.find((img) => img.id === lightboxImageId) ?? null;

  const versesFolded = useBibleStore((state) => state.versesFolded);

  // The order badge is opt-in: notes missing from the index
  // (and callers that never pass `orderMenu`, e.g.
  // NoteDetailRoute) simply render no badge.
  const orderId = orderMenu?.orderIdByNoteId.get(note.id);
  const orderMenuNode =
    orderMenu && orderId !== undefined ? (
      <NoteOrderMenu
        noteId={note.id}
        orderId={orderId}
        data={orderMenu}
      />
    ) : null;

  return (
    <Box
      ref={cardRef}
      pb="md"
      sx={(theme) => ({
        borderBottom: `1px solid ${
          theme.colorScheme === "dark"
            ? theme.colors.dark[4]
            : theme.colors.gray[3]
        }`,
      })}
    >
      <Box
        px={10}
        sx={!versesFolded ? (theme) => ({
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          marginBottom: 0,
          overflow: 'hidden',
        }) : undefined}
      >
        <Group
          position="apart"
          mb={0}
          sx={!versesFolded
            ? { flex: 1, minWidth: 0 }
            : undefined}
        >
          <Title 
            order={4} 
            className="note-card-heading"
            ref={dragHandleProps?.ref}
            {...(dragHandleProps ? Object.fromEntries(
              Object.entries(dragHandleProps).filter(([key]) => key !== 'ref')
            ) : {})}
            sx={dragHandleProps ? {
              cursor: 'grab',
              userSelect: 'none',
              '&:active': {
                cursor: 'grabbing',
              },
            } : undefined}
          >
            {heading}
          </Title>
          {versesFolded && (
            <NoteCardActions
              note={note}
              onViewInBible={onViewInBible}
              onEdit={onEdit}
              onDelete={onDelete}
              onPlayFromNote={onPlayFromNote}
              commentCount={commentCount}
              threadOpen={threadOpen}
              onToggleThread={() =>
                setThreadOpen((o) => !o)
              }
              isTagOwner={isTagOwner}
              orderMenuNode={orderMenuNode}
              sx={{ position: 'relative', zIndex: 1 }}
            />
          )}
        </Group>
        {!versesFolded && (
          <NoteCardActions
            note={note}
            onViewInBible={onViewInBible}
            onEdit={onEdit}
            onDelete={onDelete}
            onPlayFromNote={onPlayFromNote}
            commentCount={commentCount}
            threadOpen={threadOpen}
            onToggleThread={() =>
              setThreadOpen((o) => !o)
            }
            isTagOwner={isTagOwner}
            orderMenuNode={orderMenuNode}
            sx={{
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
            }}
          />
        )}
      </Box>

      <NoteVerseList
        note={note}
        scope={scope}
        folded={versesFolded}
      />

      {note.note_text && (
        <Box
          mt={10}
          p={10}
          sx={(theme) => ({
            backgroundColor:
              theme.colorScheme === "dark"
                ? theme.colors.dark[4]
                : theme.colors.gray[4],
          })}
        >
          <Box sx={{ fontStyle: "italic" }}>
            <RichTextView
              content={note.note_text}
              onScriptureRef={onGrabBiblePassage}
            />
          </Box>
        </Box>
      )}
      {images.length > 0 && (
        <Box px={10} mt={6}>
          <CommentImageGrid
            images={images}
            parentId={note.id}
            // Deletes happen through EditNoteModal — the card
            // only displays.
            canDelete={false}
            onOpenImage={setLightboxImageId}
            onImageError={handleImageError}
          />
        </Box>
      )}
      <Lightbox
        image={lightboxImage}
        onClose={() => setLightboxImageId(null)}
        onImageError={handleImageError}
      />
      {passagePreview && (
        <ScripturePassagePopover
          reference={passagePreview.ref}
          error={passageError}
          anchor={passagePreview.anchor}
          onClose={closePassage}
        />
      )}

      {threadOpen && (
        <Box
          id={`comment-thread-${note.id}`}
          mt={8}
          px={10}
        >
          <CommentThread
            noteId={note.id}
            onCountChange={onCountChange}
          />
        </Box>
      )}
    </Box>
  );
};

export default NoteCard;
