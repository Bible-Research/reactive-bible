import { useEffect, useState, useRef } from "react";
import type { MouseEvent } from "react";
import { ScrollArea, Select, Group, Stack, Center, Text, Loader, Box } from "@mantine/core";
import { Note, Tag } from "../types";
import TagSection from "./TagSection";
import EditNoteModal from "./EditNoteModal";
import { useBibleStore } from "../store";
import { getTags, deleteNote } from "../api";
import Button from "./Button";
interface NotesViewProps {
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const NotesView = ({ onViewInBible }: NotesViewProps) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const { notes, fetchNotes } = useBibleStore((state) => ({ notes: state.notes, fetchNotes: state.fetchNotes }));
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Prevent double-fetch in React Strict Mode
    if (hasLoadedRef.current) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);
        if (fetchedTags.length > 0) {
          const sorted = [...fetchedTags].sort((a, b) => a.name.localeCompare(b.name));
          const firstTagId = sorted[0].id;
          setSelectedTagId(firstTagId);
          // Fetch notes only for the first tag
          await fetchNotes(firstTagId);
        }
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    };
    loadData();
  }, []); // Empty dependency - only load on mount

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  // Handle tag selection change
  const handleTagChange = async (value: string | null) => {
    if (value) {
      setSelectedTagId(value);
      setLoading(true);
      try {
        await fetchNotes(value);
      } catch (error) {
        console.error('Error fetching notes for tag:', error);
      }
      setLoading(false);
    }
  };

  // Handle refresh button
  const handleRefresh = async () => {
    if (selectedTagId) {
      setLoading(true);
      try {
        await fetchNotes(selectedTagId);
      } catch (error) {
        console.error('Error refreshing notes:', error);
      }
      setLoading(false);
    }
  };

  // Handle delete note
  const handleDeleteNote = async (evt: MouseEvent<HTMLButtonElement>, note: Note) => {
    evt.preventDefault();
    if(note.id) {   
      if(window.confirm('Are you sure you want to delete this note?')) {
        await deleteNote(note.id);
        fetchNotes();
      }
    }
  }

  // Sort tags alphabetically
  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

  // Notes are already filtered by the API, so we just need to group them
  const notesByTag = selectedTagId && notes.length > 0
    ? [{
        tag: sortedTags.find(t => t.id === selectedTagId)!,
        notes: notes
      }]
    : [];


    return (
    <>
      <Box mb="md">
        <Group align="flex-end" spacing="xs">
          <Select
            label="Filter by tag"
            placeholder="Select a tag"
            value={selectedTagId}
            onChange={handleTagChange}
            data={sortedTags.map(tag => ({ value: tag.id, label: tag.name }))}
            searchable
            style={{ flex: 1, minWidth: 200 }}
          />
          <Button onClick={handleRefresh} size="xs">
            Refresh
          </Button>
        </Group>
      </Box>
      <ScrollArea style={{ height: 'calc(100vh - 280px)' }}>
        {loading ? (
          <Center style={{ height: 200 }}><Loader aria-label="loading" /></Center>
        ) : notesByTag.length > 0 ? (
          <Stack spacing="md">
            {notesByTag.map(({ tag, notes }) => (
              <TagSection
                key={tag.id}
                tagName={tag.name}
                notes={notes}
                onViewInBible={onViewInBible}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
              />
            ))}
          </Stack>
        ) : (
          <Center style={{ height: 200 }}><Text>No notes found.</Text></Center>
        )}
      </ScrollArea>
      <EditNoteModal
        opened={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        note={noteToEdit}
      />
    </>
  );
};

export default NotesView;
