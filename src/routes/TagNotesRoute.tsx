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
} from '@mantine/core';
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
  const [allTags, setAllTags] = useState<Tag[]>([]);
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
        const fetchedTags = await getTags();
        setAllTags(fetchedTags);
        const currentTag = fetchedTags.find(t => t.id === tagId);
        
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

  const handleTagChange = (value: string | null) => {
    if (value && value !== tagId) {
      console.log(`🔗 TagNotesRoute: Navigate to /notes/tag/${value}`);
      navigate(`/notes/tag/${value}`);
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
