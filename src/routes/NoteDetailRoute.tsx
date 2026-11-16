import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Center,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconShare } from '@tabler/icons-react';
import { Note } from '../types';
import NoteCard from '../components/NoteCard';
import CommentThread from '../components/CommentThread';
import { getNote } from '../api';
import { toPlainText } from '../utils/tiptapContent';
import { buildBiblePath } from '../utils/bibleUtils';
import { shareOrCopyLink } from '../utils/share';
import { useBibleStore } from '../store';
import { useTranslation } from 'react-i18next';

/**
 * Public single-note page reachable via `/notes/:noteId`. Works for any
 * visitor when the note is `public=true`; a private note returns 404
 * from the backend and surfaces a friendly error.
 */
export default function NoteDetailRoute() {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();

  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  // The fetched note stays in local state, but the share
  // toolbar needs its verses for folded-note shares — park it
  // in a transient store slot instead of polluting `notes`
  // (the tag page's pagination state).
  const setDetailNote = useBibleStore(
    (state) => state.setDetailNote
  );

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!noteId) {
        setError(t('notes.noNoteId'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const fetched = await getNote(noteId);
        if (cancelled) return;
        setNote(fetched);
        setDetailNote(fetched);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading note:', err);
        setError(t('notes.notFoundOrPrivate'));
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      setDetailNote(null);
    };
  }, [noteId, setDetailNote, t]);

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number,
  ) => {
    void navigate(buildBiblePath(book, chapter, [verse]));
    setShowNotes(false);
  };

  const handleShare = async () => {
    const title = note?.tag?.name
      ? t('notes.noteTitle', { name: note.tag.name })
      : t('notes.sharedNote');
    const text = note?.note_text
      ? toPlainText(note.note_text).slice(0, 140)
      : t('notes.sharedBibleNote');

    await shareOrCopyLink(
      { title, text, url: window.location.href },
      {
        copySuccess: {
          title: t('notes.linkCopied'),
          message: t('notes.linkCopiedMsg'),
        },
      }
    );
  };

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader
          size="lg"
          aria-label={t('notes.loadingNotes')}
        />
      </Center>
    );
  }

  if (error || !note) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || t('notes.notFound')}
        </Text>
      </Center>
    );
  }

  return (
    // The AppShell main area is `overflow: hidden` — give this route
    // its own scroll container so long notes can be read to the end.
    <ScrollArea style={{ height: '100%' }} type="auto">
      <Box p="md">
        <Group position="apart" mb="md">
          <Text fw={500} size="lg">
            {note.tag?.name || t('notes.sharedNote')}
          </Text>
          <Tooltip label={t('notes.shareNoteLink')} position="left">
            <ActionIcon
              onClick={handleShare}
              variant="subtle"
              color="blue"
              size="lg"
            >
              <IconShare size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Stack spacing="md">
          <NoteCard
            note={note}
            onViewInBible={handleViewInBible}
          />
          <CommentThread noteId={note.id} />
        </Stack>
      </Box>
    </ScrollArea>
  );
}
