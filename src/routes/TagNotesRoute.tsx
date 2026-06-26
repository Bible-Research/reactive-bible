import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ScrollArea,
  Stack,
  Center,
  Text,
  Loader,
  Box,
  Group,
  Select,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconShare, IconRefresh, IconArrowsMaximize, IconArrowsMinimize } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import type { MouseEvent } from 'react';
import { Note, Tag, CommentCounts } from '../types';
import TagSection from '../components/TagSection';
import EditNoteModal from '../components/EditNoteModal';
import { useBibleStore } from '../store';
import { deleteNote, getTag, fetchCommentCounts } from '../api';
import { useAuthStore } from '../stores/authStore';
import { clearNotesCache } from '../utils/cacheManager';

export default function TagNotesRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  
  const notes = useBibleStore((state) => state.notes);
  const storedTags = useBibleStore((state) => state.tags);
  const fetchNotes = useBibleStore((state) => state.fetchNotes);
  const getTags = useBibleStore((state) => state.getTags);
  const setActiveBook = useBibleStore((state) => state.setActiveBook);
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const setShowNotes = useBibleStore((state) => state.setShowNotes);
  const setLastSelectedTagId = useBibleStore(
    (state) => state.setLastSelectedTagId
  );
  const versesFolded = useBibleStore((state) => state.versesFolded);
  const setVersesFolded = useBibleStore((state) => state.setVersesFolded);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  type SortOrder =
    | 'created_desc'
    | 'created_asc'
    | 'verse_asc'
    | 'verse_desc';

  const [sortOrder, setSortOrder] = useState<SortOrder>('created_desc');
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] =
    useState<CommentCounts>({});

  // Set showNotes to true and save lastSelectedTagId when on notes route
  useEffect(() => {
    setShowNotes(true);
    if (tagId) {
      setLastSelectedTagId(tagId);
    }
  }, [setShowNotes, setLastSelectedTagId, tagId]);

  useEffect(() => {
    let cancelled = false;

    const loadTagAndNotes = async () => {
      if (!tagId) {
        setError('No tag ID provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Preload the caller's own tags when authenticated so the tag
        // switcher works. Failures are non-fatal for shared pages.
        if (isAuthenticated) {
          try { await getTags(); } catch { /* ignore */ }
        }

        await fetchNotes(tagId);
        if (cancelled) return;

        const fetchedNotes = useBibleStore.getState().notes;
        let resolvedTag: Tag | null =
          useBibleStore.getState().tags.find((t) => t.id === tagId) ||
          fetchedNotes[0]?.tag ||
          null;

        if (!resolvedTag) {
          try {
            resolvedTag = await getTag(tagId);
          } catch {
            resolvedTag = null;
          }
        }

        if (cancelled) return;

        if (!resolvedTag) {
          setError('No public notes available for this tag.');
        } else {
          setTag(resolvedTag);
        }
        setLoading(false);

        if (!cancelled && tagId) {
          fetchCommentCounts({ tagId }).then((counts) => {
            if (!cancelled) setCommentCounts(counts);
          }).catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading tag notes:', err);
        setError('Failed to load notes');
        setLoading(false);
      }
    };

    loadTagAndNotes();

    return () => {
      cancelled = true;
    };
  }, [tagId, fetchNotes, getTags, isAuthenticated]);

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  const handleDeleteNote = async (
    evt: MouseEvent<HTMLButtonElement>, 
    note: Note
  ) => {
    evt.preventDefault();
    if (note.id) {
      if (window.confirm('Are you sure you want to delete this note?')) {
        await deleteNote(note.id);
        if (tagId) {
          await fetchNotes(tagId);
        }
      }
    }
  };

  const handleViewInBible = (
    book: string, 
    chapter: number, 
    verse: number
  ) => {
    // Set the Bible context
    setActiveBook(book);
    setActiveChapter(chapter);
    setActiveVerses([verse]);
    
    // Navigate to the Bible passage
    navigate(`/bible/${book}/${chapter}`);
    
    // Switch to Bible view
    setShowNotes(false);
  };

  const handleCountChange = (
    noteId: string,
    delta: number
  ) => {
    setCommentCounts((prev) => ({
      ...prev,
      [noteId]: (prev[noteId] ?? 0) + delta,
    }));
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      navigate(`/notes/tag/${value}`);
    }
  };

  const handleRefresh = async () => {
    if (!tagId) return;
    
    try {
      // Clear cache for this tag
      clearNotesCache(tagId);
      
      // Refetch notes from API
      await fetchNotes(tagId);

      await getTags();
      
      showNotification({
        title: 'Refreshed!',
        message: 'Notes updated from server',
        color: 'green',
      });
    } catch (err) {
      console.error('Error refreshing notes:', err);
      showNotification({
        title: 'Error',
        message: 'Failed to refresh notes',
        color: 'red',
      });
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = `Notes: ${tag?.name || 'Tag'}`;
    const text = `Check out these ${notes.length} note(s) tagged with "${tag?.name}"`;

    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        showNotification({
          title: 'Shared!',
          message: 'Link shared successfully',
          color: 'green',
        });
      } catch (err) {
        // User cancelled or error occurred
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        showNotification({
          title: 'Link Copied!',
          message: 'Tag link copied to clipboard',
          color: 'blue',
        });
      } catch (err) {
        console.error('Error copying to clipboard:', err);
        showNotification({
          title: 'Error',
          message: 'Failed to copy link',
          color: 'red',
        });
      }
    }
  };

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="loading" />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="red" size="lg">
          {error || 'Tag not found'}
        </Text>
      </Center>
    );
  }

  const sortedTags = [...storedTags].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  const sortedNotes = [...notes].sort((a, b) => {
    switch (sortOrder) {
      case 'created_desc':
        return (
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
        );
      case 'created_asc':
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      case 'verse_asc': {
        const aV = a.verses[0];
        const bV = b.verses[0];
        if (!aV) return 1;
        if (!bV) return -1;
        if (aV.chapter !== bV.chapter)
          return aV.chapter - bV.chapter;
        return aV.verse - bV.verse;
      }
      case 'verse_desc': {
        const aV = a.verses[0];
        const bV = b.verses[0];
        if (!aV) return 1;
        if (!bV) return -1;
        if (aV.chapter !== bV.chapter)
          return bV.chapter - aV.chapter;
        return bV.verse - aV.verse;
      }
      default:
        return 0;
    }
  });

  return (
    <Box p="md">
      <Group mb="md" position="apart">
        {isAuthenticated && sortedTags.length > 0 ? (
          <Select
            label="Filter by tag"
            placeholder="Select a tag"
            value={tagId}
            onChange={handleTagChange}
            data={sortedTags.map(t => ({ value: t.id, label: t.name }))}
            searchable
            style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
          />
        ) : (
          <Text fw={500} size="lg">{tag.name}</Text>
        )}
        <Group spacing="xs">
          <Select
            size="xs"
            value={sortOrder}
            onChange={(v) =>
              v && setSortOrder(v as SortOrder)
            }
            data={[
              {
                value: 'created_desc',
                label: 'Date: Newest first',
              },
              {
                value: 'created_asc',
                label: 'Date: Oldest first',
              },
              {
                value: 'verse_asc',
                label: 'Verse: Ascending',
              },
              {
                value: 'verse_desc',
                label: 'Verse: Descending',
              },
            ]}
            style={{ width: 170 }}
          />
          <Text color="dimmed" size="sm">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </Text>
          <Tooltip
            label={versesFolded ? "Unfold verses" : "Fold verses"}
            position="left"
          >
            <ActionIcon
              onClick={() => setVersesFolded(!versesFolded)}
              variant="subtle"
              color={versesFolded ? "blue" : "gray"}
              size="lg"
            >
              {versesFolded
                ? <IconArrowsMaximize size={20} />
                : <IconArrowsMinimize size={20} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh notes" position="left">
            <ActionIcon
              onClick={handleRefresh}
              variant="subtle"
              color="gray"
              size="lg"
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Share tag link" position="left">
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
      </Group>

      <ScrollArea style={{ height: 'calc(100vh - 200px)' }}>
        {notes.length > 0 ? (
          <Stack spacing="md">
            <TagSection
              tagName={tag.name}
              notes={sortedNotes}
              onViewInBible={handleViewInBible}
              onEditNote={
                isAuthenticated ? handleEditNote : undefined
              }
              onDeleteNote={
                isAuthenticated
                  ? handleDeleteNote
                  : undefined
              }
              commentCounts={commentCounts}
              onCountChange={handleCountChange}
            />
          </Stack>
        ) : (
          <Center style={{ height: 200 }}>
            <Text>No notes found for this tag.</Text>
          </Center>
        )}
      </ScrollArea>

      <EditNoteModal
        opened={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        note={noteToEdit}
      />
    </Box>
  );
}
