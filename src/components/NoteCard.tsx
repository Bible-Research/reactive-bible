import type {MouseEvent} from "react";
import {useEffect, useState} from "react";
import {Anchor, Box, Button, Card, Group, Text, Title, Tooltip} from "@mantine/core";
import {showNotification} from "@mantine/notifications";
import {IconMessageCircle} from "@tabler/icons-react";
import {Note} from "../types";
import {useAuthStore} from "../stores/authStore";
import Verse from "./Verse";
import ButtonComponent from "./Button";
import CommentThread from "./CommentThread";
import {getVersesInChapter} from "../api.tsx";
import {findVersesInBetween} from "../utils/findVersesInBetween.ts";
import { useBibleStore } from '../store.tsx'

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
  onEdit?: (note: Note) => void;
  onDelete?: (evt: MouseEvent<HTMLButtonElement>, note: Note) => void;
  commentCount?: number;
  onCountChange?: (delta: number) => void;
}

interface PassageContainerState {
  book: string;
  chapter: number,
  verses: number[];
}

interface PassageState {
  verse: number;
  text: string;
}

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
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const filesetId = useBibleStore(state => state.activeTextFilesetId) as string;

  const onGrabBiblePassage = (hashtag: string): void => {
    const ref = hashtag.startsWith('@') ? hashtag.slice(1) : hashtag;

    const atColon = ref.indexOf(':');
    const atDot = ref.indexOf('.');

    const biblePassageParts = {
      book: "",
      chapter: 0,
      verses: []
    } as { book: string; chapter: number, verses: number[]; };

    biblePassageParts['book'] = ref.slice(0, atDot).replaceAll('+', ' ');

    biblePassageParts['chapter'] = Number(ref.slice(atDot + 1, atColon));

    const getRawVerses = ref.slice(atColon + 1, ref.length + 1)
    const getVerses = Number(ref.slice(atColon + 1, ref.length + 1))

    if (getRawVerses) {
      if (getRawVerses.includes('-')) {
        const [startStr, endStr] = getRawVerses.split('-');

        biblePassageParts['verses'] = findVersesInBetween(startStr, endStr);
      } else biblePassageParts['verses'].push(+getVerses);
    }

    setPassageContainer(biblePassageParts);
  }

  const transformNote = (note_text: string) => {
    const parts = note_text.split(/(@[a-zA-Z0-9_+.:\-]+)/g);
    const newParts = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith("@"))
        newParts.push(
          <Anchor onClick={() => onGrabBiblePassage(part)}>{part}</Anchor>
        );
      else newParts.push(part);
    }

    return newParts;
   }

  useEffect(() => {
    if (!passageContainer) return;

    const { book, chapter, verses } = passageContainer;

    if (!book || !chapter || !verses.length) return;

    let cancelled = false;

    const getPassage = async () => {
      try {
        const res = await getVersesInChapter(book, chapter, filesetId);

        if (cancelled) return;

        const verseFound = res?.filter(res =>
          verses.includes(res.verse)
        );

        setPassages(verseFound);
      } catch (err) {
        console.error("Failed to load passage", err);
      }
    };

    void getPassage();

    return () => {
      cancelled = true;
    };
  }, [passageContainer, filesetId]);

  const firstVerse = note?.verses?.[0]?.verse || 1;
  const lastVerse = note?.verses?.[note.verses.length - 1]?.verse || 1;
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
      <Group position="apart" mb={0}>
        <Title order={4}>{heading}</Title>
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
            </Tooltip>
          )}
        </Group>
      </Group>

      <Box mt={-10}>
        {note?.verses?.map(v => (
          <Verse key={v.verse} verse={v.verse} text={v.text} />
        ))}
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
            {passages?.map((passage: PassageState, i: number) => (
              <Text key={i}>{passage.verse}{". "}{passage.text}</Text>
            ))}
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
