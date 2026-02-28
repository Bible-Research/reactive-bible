import { useEffect, useState, useRef } from 'react';
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
import { IconShare } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import type { MouseEvent } from 'react';
import { Note, Tag } from '../types';
import TagSection from '../components/TagSection';
import EditNoteModal from '../components/EditNoteModal';
import { useBibleStore } from '../store';
import { deleteNote } from '../api';

export default function TagNotesRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const { notes, fetchNotes, setActiveBook, 
          setActiveChapter, setActiveVerses, setShowNotes, 
          setLastSelectedTagId, tags: storedTags } = 
    useBibleStore();
  const [tag, setTag] = useState<Tag | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>(storedTags);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousTagIdRef = useRef<string | null>(null);
  const hasLoggedWaitingRef = useRef(false);

  // Set showNotes to true and save lastSelectedTagId when on notes route
  useEffect(() => {
    setShowNotes(true);
    if (tagId) {
      setLastSelectedTagId(tagId);
    }
  }, [setShowNotes, setLastSelectedTagId, tagId]);

  useEffect(() => {
    console.log(`🔄 TagNotesRoute useEffect triggered:`, {
      tagId,
      storedTagsLength: storedTags.length,
      notesLength: notes.length,
      previousTagId: previousTagIdRef.current
    });
    
    const loadTagAndNotes = async () => {
      if (!tagId) {
        setError('No tag ID provided');
        setLoading(false);
        return;
      }

      // Only set loading if we're actually going to do something
      // If waiting for tags, loading should already be true
      if (storedTags.length === 0) {
        // Tags not loaded yet, keep showing loading state
        if (!hasLoggedWaitingRef.current) {
          console.log('⏳ Waiting for tags to load...');
          hasLoggedWaitingRef.current = true;
        }
        setLoading(true);
        setError(null);
        return;
      }
      
      // Reset the flag once tags are loaded
      hasLoggedWaitingRef.current = false;
      
      setLoading(true);
      setError(null);

      try {
        
        // Always use cached tags - they should be loaded by NotesView
        // Never fetch tags here to avoid unnecessary re-renders
        setAllTags(storedTags);
        const currentTag = storedTags.find(t => t.id === tagId);
        
        if (!currentTag) {
          setError(`Tag not found: ${tagId}`);
          setLoading(false);
          return;
        }

        setTag(currentTag);
        
        // Always fetch notes - the store will handle caching
        await fetchNotes(tagId);
        previousTagIdRef.current = tagId;
        
        // Successfully loaded, clear loading state
        setLoading(false);
      } catch (err) {
        console.error('Error loading tag notes:', err);
        setError('Failed to load notes');
        setLoading(false);
      }
    };

    loadTagAndNotes();
  }, [tagId, fetchNotes, notes.length, storedTags.length]);

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
    console.log(`🔗 Navigating to Bible: ${book} ${chapter}:${verse}`);
    
    // Set the Bible context
    setActiveBook(book);
    setActiveChapter(chapter);
    setActiveVerses([verse]);
    
    // Navigate to the Bible passage
    navigate(`/bible/${book}/${chapter}`);
    
    // Switch to Bible view
    setShowNotes(false);
  };

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      console.log(`🔗 TagNotesRoute: Navigate to /notes/tag/${value}`);
      navigate(`/notes/tag/${value}`);
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

  // Sort tags alphabetically
  const sortedTags = [...allTags].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Box p="md">
      <Group mb="md" position="apart">
        <Select
          label="Filter by tag"
          placeholder="Select a tag"
          value={tagId}
          onChange={handleTagChange}
          data={sortedTags.map(t => ({ value: t.id, label: t.name }))}
          searchable
          style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
        />
        <Group spacing="xs">
          <Text color="dimmed" size="sm">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </Text>
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
              notes={notes}
              onViewInBible={handleViewInBible}
              onEditNote={handleEditNote}
              onDeleteNote={handleDeleteNote}
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
