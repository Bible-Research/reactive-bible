import { useEffect, useState } from "react";
import { ScrollArea, Select, Group, Button, Stack, Center, Text, Loader } from "@mantine/core";
import { Note, Tag } from "../types";
import TagSection from "./TagSection";
import EditNoteModal from "./EditNoteModal";
import { useBibleStore } from "../store";
import { getTags } from "../api";

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

    const fetchTags = async () => {
    try {
      const fetchedTags = await getTags();
      setTags(fetchedTags);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  

    useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchNotes();
      await fetchTags();
      setLoading(false);
    };
    loadData();
  }, [fetchNotes]);

  const handleEditNote = (note: Note) => {
    setNoteToEdit(note);
    setIsEditModalOpen(true);
  };

  // Sort tags alphabetically
  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

    const filteredNotes = selectedTagId
    ? notes.filter(note => note.tag.id === selectedTagId)
    : notes;

  const notesByTag = sortedTags.map(tag => ({
    tag,
    notes: filteredNotes.filter(note => note.tag.id === tag.id)
  })).filter(group => group.notes.length > 0);

  

  

  

    return (
    <>
      <ScrollArea style={{ height: 'calc(100vh - 220px)' }}>
        <Stack spacing="md" p="md">
          <Group>
            <Select
              label="Filter by tag"
              placeholder="Select a tag"
              value={selectedTagId}
              onChange={(value) => setSelectedTagId(value || '')}
              data={[
                { value: '', label: 'All Tags' },
                ...sortedTags.map(tag => ({ value: tag.id, label: tag.name }))
              ]}
              searchable
            />
            <Button onClick={fetchNotes}>Refresh Notes</Button>
          </Group>

          {loading ? (
            <Center style={{ height: 200 }}><Loader /></Center>
          ) : notesByTag.length > 0 ? (
            notesByTag.map(({ tag, notes }) => (
              <TagSection
                key={tag.id}
                tagName={tag.name}
                notes={notes}
                onViewInBible={onViewInBible}
                onEditNote={handleEditNote}
              />
            ))
          ) : (
            <Center style={{ height: 200 }}><Text>No notes found.</Text></Center>
          )}
        </Stack>
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
