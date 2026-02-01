import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Title,
  Button,
  Stack,
  Textarea,
  Select,
  Loader,
  Center,
  Text,
  Group,
} from "@mantine/core";
import { getNote, updateNote, getTags } from "../api";
import { Note, Tag } from "../types";

export default function NoteEditRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [selectedTagId, setSelectedTagId] = useState("");
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (!noteId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedNote, fetchedTags] = await Promise.all([
          getNote(noteId),
          getTags(),
        ]);
        setNote(fetchedNote);
        setTags(fetchedTags);
        setSelectedTagId(fetchedNote.tag.id);
        setNoteText(fetchedNote.note_text);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load note"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [noteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteId || !selectedTagId || !noteText.trim()) return;

    setSaving(true);
    try {
      // Keep existing verse references
      const verseRefs = note?.verses.map((v) => ({
        book: v.book,
        chapter: v.chapter,
        verse: v.verse,
      }));
      
      await updateNote(noteId, selectedTagId, noteText, verseRefs);
      navigate(`/notes/${noteId}`);
    } catch (err) {
      alert("Failed to update note");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate(`/notes/${noteId}`);
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error || !note) {
    return (
      <Center h="80vh">
        <Stack align="center">
          <Text color="red">{error || "Note not found"}</Text>
          <Button onClick={() => navigate("/notes")}>
            Back to Notes
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Paper shadow="sm" p="lg">
        <Title order={2} mb="md">
          Edit Note
        </Title>

        <form onSubmit={handleSubmit}>
          <Stack spacing="md">
            <Select
              label="Tag"
              placeholder="Select a tag"
              value={selectedTagId}
              onChange={(value) => setSelectedTagId(value || "")}
              data={tags.map((tag) => ({
                value: tag.id,
                label: tag.name,
              }))}
              searchable
              required
            />

            <Textarea
              label="Note Text"
              placeholder="Enter your note..."
              value={noteText}
              onChange={(e) => setNoteText(e.currentTarget.value)}
              minRows={6}
              required
            />

            <Text size="sm" color="dimmed">
              Verse references: {note.verses.length} verse(s) linked
            </Text>

            <Group position="right">
              <Button
                variant="subtle"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save Changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
