import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { Anchor, Box, Button, Card, Group, Text, Title, Tooltip } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconMessageCircle } from "@tabler/icons-react";
import { Note, SectionHeading } from "../types";
import { useAuthStore } from "../stores/authStore";
import { useBibleStore } from "../store";
import Verse from "./Verse";
import ButtonComponent from "./Button";
import CommentThread from "./CommentThread";
import SectionHeadingComponent from "./SectionHeading";
import { getVersesInChapter } from "../api.tsx";
import { findVersesInBetween } from "../utils/findVersesInBetween.ts";

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
}

type PassageState = {
  verse: number;
  text: string;
  book?: string;
  chapter?: number;
  verses?: number[];
}

type PassageContainerState = Pick<PassageState, 'book' | 'verses' | 'chapter'>;

const NoteCard = ({
  note,
  onViewInBible,
  onEdit,
  onDelete,
  commentCount,
  onCountChange,
}: NoteCardProps) => {
  const [threadOpen, setThreadOpen] = useState(false);
  const [passageContainer, setPassageContainer] = useState<PassageContainerState | null>(null);
  const [passages, setPassages] = useState<PassageState[]>([]);
  const [passageHeadings, setPassageHeadings] = useState<SectionHeading[]>([]);
  const [noteHeadings, setNoteHeadings] = useState<SectionHeading[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  
  // Use ENGESV_API for note verses display
  const noteFilesetId = "ENGESV_API";

  const onGrabBiblePassage = (hashtag: string): void => {
    const ref = hashtag.startsWith('@') ? hashtag.slice(1) : hashtag;
    const match = ref.match(/^([a-zA-Z0-9\s+]+)\.(\d+):(\d+)(?:-(\d+))?$/)

    if(!match) {
      setError('Invalid scripture format');
      return;
    }

    const colonIndex = ref.indexOf(':');
    const dotIndex = ref.indexOf('.');

    if (dotIndex === -1 || colonIndex === -1 || colonIndex < dotIndex) {
      setError('Invalid Bible reference format');
      return;
    }

    const book = ref.slice(0, dotIndex).replaceAll('+', ' ');
    const chapter = Number(ref.slice(dotIndex + 1, colonIndex));
    let verses: number[] = [];

    if(!book || isNaN(chapter)) {
      setError('Invalid Bible reference');
      return;
    }

    const rawVerseRange = ref.slice(colonIndex + 1);
    const singleVerse = Number(rawVerseRange);

    if (rawVerseRange) {
      if (rawVerseRange.includes('-')) {
        const [startStr, endStr] = rawVerseRange.split('-');

        verses = findVersesInBetween(startStr, endStr);
      } else verses.push(+singleVerse);
    }

    setPassageContainer({
      book,
      chapter,
      verses
    });
  };

  const transformNote = (note_text: string) => {
    const parts = note_text.split(/(@[a-zA-Z0-9_+.:+-]+)/g);
    const newParts = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("@"))
        newParts.push(
          <Anchor onClick={() => onGrabBiblePassage(part)}>
            {part}
          </Anchor>
        );
      else newParts.push(part);
    }

    return newParts;
   }

  useEffect(() => {
    if (!passageContainer) return;
    const { book, chapter, verses } = passageContainer;

    if (!book || !chapter || !verses?.length) return;

    let cancelled = false;

    const getPassage = async () => {
      try {
        const res = await getVersesInChapter(book, chapter, noteFilesetId);
        
        if (cancelled) return;

        const verseFound = res?.verses?.filter(res =>
          verses.includes(res.verse)
        );

        setPassages(verseFound);
        
        // Filter headings to only those that appear before verses in our range
        const relevantHeadings = res?.headings?.filter(heading =>
          verses.includes(heading.before_verse)
        ) || [];
        setPassageHeadings(relevantHeadings);
      } catch (err) {
        console.error("Failed to load passage", err);
        setError('Failed to load passage')
      }
    };

    void getPassage();

    return () => {
      cancelled = true;
    };
  }, [passageContainer, noteFilesetId]);

  // Fetch headings for the note's own verses
  useEffect(() => {
    if (!note?.verses?.length) return;
    
    const book = note.verses[0].book;
    const chapter = note.verses[0].chapter;
    const verseNumbers = note.verses.map(v => v.verse);
    
    let cancelled = false;

    const fetchNoteHeadings = async () => {
      try {
        const res = await getVersesInChapter(book, chapter, noteFilesetId);
        
        if (cancelled) return;
        
        // Filter headings to only those that appear before verses in the note
        const relevantHeadings = res?.headings?.filter(heading =>
          verseNumbers.includes(heading.before_verse)
        ) || [];
        setNoteHeadings(relevantHeadings);
      } catch (err) {
        console.error("Failed to load note headings", err);
      }
    };

    void fetchNoteHeadings();

    return () => {
      cancelled = true;
    };
  }, [note, noteFilesetId]);

  const versesFolded = useBibleStore((state) => state.versesFolded);

  const firstVerse = note?.verses?.[0]?.verse || 1;
  const lastVerse =
    note?.verses?.[(note.verses?.length ?? 0) - 1]?.verse || 1;
  const book = note?.verses?.[0]?.book || "";
  const chapter = note?.verses?.[0]?.chapter || 1;

  const heading =
    firstVerse === lastVerse
      ? `${book} ${chapter}:${firstVerse}`
      : `${book} ${chapter}:${firstVerse}-${lastVerse}`;

  const canEdit = (note.is_owner !== false) && !!onEdit;
  const canDelete = (note.is_owner !== false) && !!onDelete;
  const canShare = note.public;

  const handleShare = async () => {
    const url = `${window.location.origin}/notes/${note.id}`;
    const title = note.tag?.name
      ? `Note: ${note.tag.name}`
      : 'Shared note';
    const text = note.note_text
      ? note.note_text.slice(0, 140)
      : 'Shared Bible note';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Error sharing:', err);
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showNotification({
        title: 'Link Copied!',
        message: 'Note link copied to clipboard',
        color: 'blue',
      });
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  // commentCount is undefined on the detail route, which renders
  // its own always-expanded CommentThread – no badge needed there.
  const showCommentButton = commentCount === undefined
    ? false
    : commentCount > 0 || isAuthenticated;

  return (
    <Card shadow="sm" padding="sm" radius="md" mb={15}>
      {error && (
        <Text color="red">{error}</Text>
      )}
      <Box
        sx={!versesFolded ? (theme) => ({
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          marginBottom: 0,
          overflow: 'hidden',
        }) : undefined}
      >
        <Group position="apart" mb={0} sx={!versesFolded ? { flex: 1, minWidth: 0 } : undefined}>
          <Title order={4} className="note-card-heading">{heading}</Title>
          {versesFolded && (
            <Group spacing="xs">
              <ButtonComponent
                variant="subtle"
                size="xs"
                onClick={() => onViewInBible(book, chapter, firstVerse)}
              >
                View in Bible
              </ButtonComponent>
              {canShare && (
                <ButtonComponent
                  variant="subtle"
                  size="xs"
                  onClick={handleShare}
                >
                  Share
                </ButtonComponent>
              )}
              {canEdit && (
                <ButtonComponent
                  variant="subtle"
                  size="xs"
                  onClick={() => onEdit!(note)}
                >
                  Edit
                </ButtonComponent>
              )}
              {canDelete && (
                <ButtonComponent
                  variant="subtle"
                  size="xs"
                  onClick={
                    (evt: MouseEvent<HTMLButtonElement>) =>
                      onDelete!(evt, note)
                  }
                >
                  Remove
                </ButtonComponent>
              )}
              {showCommentButton && (
                <Tooltip
                  label={
                    commentCount === 0
                      ? 'Add a comment'
                      : `${commentCount} comment${
                          commentCount === 1 ? '' : 's'
                        }`
                  }
                  position="top"
                >
                  <Box component="span" sx={{ display: 'inline-block' }}>
                    <Button
                      variant="subtle"
                      size="xs"
                      compact
                      leftIcon={
                        <IconMessageCircle size={14} />
                      }
                      aria-label={
                        commentCount === 0
                          ? 'Add a comment'
                          : undefined
                      }
                      aria-expanded={threadOpen}
                      aria-controls={`comment-thread-${note.id}`}
                      onClick={() =>
                        setThreadOpen((o) => !o)
                      }
                    >
                      {commentCount && commentCount > 0
                        ? String(commentCount)
                        : null}
                    </Button>
                  </Box>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
        {!versesFolded && (
          <Group spacing="xs" sx={{ flexShrink: 0 }}>
            <ButtonComponent
              variant="subtle"
              size="xs"
              onClick={() => onViewInBible(book, chapter, firstVerse)}
            >
              View in Bible
            </ButtonComponent>
            {canShare && (
              <ButtonComponent
                variant="subtle"
                size="xs"
                onClick={handleShare}
              >
                Share
              </ButtonComponent>
            )}
            {canEdit && (
              <ButtonComponent
                variant="subtle"
                size="xs"
                onClick={() => onEdit!(note)}
              >
                Edit
              </ButtonComponent>
            )}
            {canDelete && (
              <ButtonComponent
                variant="subtle"
                size="xs"
                onClick={
                  (evt: MouseEvent<HTMLButtonElement>) =>
                    onDelete!(evt, note)
                }
              >
                Remove
              </ButtonComponent>
            )}
            {showCommentButton && (
              <Tooltip
                label={
                  commentCount === 0
                    ? 'Add a comment'
                    : `${commentCount} comment${
                        commentCount === 1 ? '' : 's'
                      }`
                }
                position="top"
              >
                <Box component="span" sx={{ display: 'inline-block' }}>
                  <Button
                    variant="subtle"
                    size="xs"
                    compact
                    leftIcon={
                      <IconMessageCircle size={14} />
                    }
                    aria-label={
                      commentCount === 0
                        ? 'Add a comment'
                        : undefined
                    }
                    aria-expanded={threadOpen}
                    aria-controls={`comment-thread-${note.id}`}
                    onClick={() =>
                      setThreadOpen((o) => !o)
                    }
                  >
                    {commentCount && commentCount > 0
                      ? String(commentCount)
                      : null}
                  </Button>
                </Box>
              </Tooltip>
            )}
          </Group>
        )}
      </Box>

      <Box mt={-10}>
        {versesFolded
          ? note?.verses?.slice(0, 1).map(v => {
              // Check if there's a heading before this verse
              const heading = noteHeadings.find(h => h.before_verse === v.verse);
              return (
                <Box key={v.verse}>
                  {heading && (
                    <SectionHeadingComponent text={heading.text} />
                  )}
                  <Verse
                    verse={v.verse}
                    text={v.text}
                    folded
                    selectable={false}
                  />
                </Box>
              );
            })
          : note?.verses?.map(v => {
              // Check if there's a heading before this verse
              const heading = noteHeadings.find(h => h.before_verse === v.verse);
              return (
                <Box key={v.verse}>
                  {heading && (
                    <SectionHeadingComponent text={heading.text} />
                  )}
                  <Verse
                    verse={v.verse}
                    text={v.text}
                    selectable={false}
                  />
                </Box>
              );
            })
        }
      </Box>

      <Box
        mt={10}
        p={10}
        sx={(theme) => ({
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[4]
              : theme.colors.gray[4],
          borderRadius: theme.radius.sm,
        })}
      >
        <Text fs="italic">
          {transformNote(note.note_text)}
        </Text>
      </Box>
      {passageContainer && (
        <Box data-testid='passage-container'>
          <h1>{passageContainer?.book} {passageContainer?.chapter || ""}</h1>
          <>
            {passages?.map((passage: PassageState, i: number) => {
              // Check if there's a heading before this verse
              const heading = passageHeadings.find(h => h.before_verse === passage.verse);
              return (
                <Box key={i}>
                  {heading && (
                    <SectionHeadingComponent text={heading.text} />
                  )}
                  <Text>{passage.verse}{". "}{passage.text}</Text>
                </Box>
              );
            })}
          </>
        </Box>
      )}

      {threadOpen && (
        <Box
          id={`comment-thread-${note.id}`}
          mt={8}
        >
          <CommentThread
            noteId={note.id}
            onCountChange={onCountChange}
          />
        </Box>
      )}
    </Card>
  );
};

export default NoteCard;
