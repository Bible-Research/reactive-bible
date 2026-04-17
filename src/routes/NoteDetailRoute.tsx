import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Center,
  Loader,
  Stack,
  Text,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconShare } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { Note } from '../types';
import NoteCard from '../components/NoteCard';
import { getNote } from '../api';
import { useBibleStore } from '../store';

/**
 * Public single-note page reachable via `/notes/:noteId`. Works for any
 * visitor when the note is `public=true`; a private note returns 404
 * from the backend and surfaces a friendly error.
 */
export default function NoteDetailRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();

  const setActiveBook = useBibleStore((state) => state.setActiveBook);
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!noteId) {
        setError('No note ID provided');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const fetched = await getNote(noteId);
        if (cancelled) return;
        setNote(fetched);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading note:', err);
        setError('Note not found or is not public.');
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number,
  ) => {
    setActiveBook(book);
    setActiveChapter(chapter);
    setActiveVerses([verse]);
    navigate(`/bible/${book}/${chapter}`);
    setShowNotes(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = note?.tag?.name
      ? `Note: ${note.tag.name}`
      : 'Shared note';
    const text = note?.note_text
      ? note.note_text.slice(0, 140)
      : 'Shared Bible note';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
      return;
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

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="loading" />
      </Center>
    );
  }

  if (error || !note) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || 'Note not found.'}
        </Text>
      </Center>
    );
  }

  return (
    <Box p="md">
      <Group position="apart" mb="md">
        <Text fw={500} size="lg">
          {note.tag?.name || 'Shared note'}
        </Text>
        <Tooltip label="Share note link" position="left">
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
      </Stack>
    </Box>
  );
}
