import { useEffect, useState } from "react";
import { ScrollArea, Box, Loader, Text, Center, Select, Group } from "@mantine/core";
import { getNotes, Note } from "../api";
import TagSection from "./TagSection";

interface NotesViewProps {
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const NotesView = ({ onViewInBible }: NotesViewProps) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    getNotes()
      .then((data) => {
        setNotes(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Extract unique tags and sort alphabetically
  const uniqueTags = Array.from(
    new Set(notes.map((note) => note.tag.name))
  ).sort();

  // Filter notes by selected tag
  const filteredNotes = selectedTag
    ? notes.filter((note) => note.tag.name === selectedTag)
    : notes;

  // Group filtered notes by tag name
  const groupedNotes = filteredNotes.reduce((acc, note) => {
    const tagName = note.tag.name;
    if (!acc[tagName]) {
      acc[tagName] = [];
    }
    acc[tagName].push(note);
    return acc;
  }, {} as Record<string, Note[]>);

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="80vh">
        <Text c="red">Error loading notes: {error}</Text>
      </Center>
    );
  }

  if (notes.length === 0) {
    return (
      <Center h="80vh">
        <Text c="dimmed">No notes yet. Create your first note!</Text>
      </Center>
    );
  }

  return (
    <ScrollArea h="80vh">
      <Box>
        {/* Tag Filter Dropdown */}
        <Box mb={20} px={10}>
          <Group spacing="xs">
            <Text size="sm" weight={500}>
              Filter by Tag:
            </Text>
            <Select
              value={selectedTag}
              onChange={setSelectedTag}
              data={[
                { value: '', label: 'All Tags' },
                ...uniqueTags.map((tag) => ({ value: tag, label: tag })),
              ]}
              placeholder="All Tags"
              size="sm"
              style={{ minWidth: 150 }}
            />
          </Group>
        </Box>

        {/* Notes Display */}
        {Object.keys(groupedNotes).length === 0 ? (
          <Center h="60vh">
            <Text c="dimmed">No notes found for this tag.</Text>
          </Center>
        ) : (
          Object.entries(groupedNotes).map(([tagName, tagNotes]) => (
            <TagSection
              key={tagName}
              tagName={tagName}
              notes={tagNotes}
              onViewInBible={onViewInBible}
            />
          ))
        )}
      </Box>
    </ScrollArea>
  );
};

export default NotesView;
