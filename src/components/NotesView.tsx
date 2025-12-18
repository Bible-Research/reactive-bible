import { useEffect, useState } from "react";
import { ScrollArea, Box, Loader, Text, Center } from "@mantine/core";
import { getNotes, Note } from "../api";
import TagSection from "./TagSection";

interface NotesViewProps {
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const NotesView = ({ onViewInBible }: NotesViewProps) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Group notes by tag name
  const groupedNotes = notes.reduce((acc, note) => {
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
      <Box p="md">
        {Object.entries(groupedNotes).map(([tagName, tagNotes]) => (
          <TagSection
            key={tagName}
            tagName={tagName}
            notes={tagNotes}
            onViewInBible={onViewInBible}
          />
        ))}
      </Box>
    </ScrollArea>
  );
};

export default NotesView;
