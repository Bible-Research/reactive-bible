import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ScrollArea,
  Stack,
  Center,
  Text,
  Loader,
  Box,
  Title,
  Group,
  ActionIcon,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { Note, Tag } from '../types';
import TagSection from '../components/TagSection';
import EditNoteModal from '../components/EditNoteModal';
import { useBibleStore } from '../store';
import { getTags, deleteNote } from '../api';

export default function TagNotesRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const { notes, fetchNotes, setActiveBook, 
          setActiveChapter, setActiveVerses, setShowNotes } = 
    useBibleStore();
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTagAndNotes = async () => {
      if (!tagId) {
        setError('No tag ID provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch all tags to find the current one
        const allTags = await getTags();
        const currentTag = allTags.find(t => t.id === tagId);
        
        if (!currentTag) {
          setError(`Tag not found: ${tagId}`);
          setLoading(false);
          return;
        }

        setTag(currentTag);
        
        // Fetch notes for this tag
        await fetchNotes(tagId);
      } catch (err) {
        console.error('Error loading tag notes:', err);
        setError('Failed to load notes');
      }

      setLoading(false);
    };

    loadTagAndNotes();
  }, [tagId, fetchNotes]);

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

  const handleBack = () => {
    navigate('/notes');
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
        <Stack align="center">
          <Text color="red" size="lg">
            {error || 'Tag not found'}
          </Text>
          <ActionIcon onClick={handleBack} size="lg" variant="subtle">
            <IconArrowLeft />
          </ActionIcon>
        </Stack>
      </Center>
    );
  }

  return (
    <Box p="md">
      <Group mb="md" position="apart">
        <Group>
          <ActionIcon 
            onClick={handleBack} 
            size="lg" 
            variant="subtle"
            title="Back to all notes"
          >
            <IconArrowLeft />
          </ActionIcon>
          <Title order={2}>{tag.name}</Title>
        </Group>
        <Text color="dimmed" size="sm">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </Text>
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
