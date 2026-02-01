import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Text,
  Title,
  Badge,
  Group,
  Button,
  Stack,
  Divider,
  ActionIcon,
  Loader,
  Center,
} from "@mantine/core";
import {
  IconEdit,
  IconTrash,
  IconShare,
  IconExternalLink,
} from "@tabler/icons-react";
import { getNote, deleteNote } from "../api";
import { Note } from "../types";

export default function NoteDetailRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;

    const loadNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedNote = await getNote(noteId);
        setNote(fetchedNote);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load note"
        );
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [noteId]);

  const handleDelete = async () => {
    if (!noteId || !confirm("Delete this note?")) return;

    try {
      await deleteNote(noteId);
      navigate("/notes");
    } catch (err) {
      alert("Failed to delete note");
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  };

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(`/bible/${book}/${chapter}/${verse}`);
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
        {/* Header */}
        <Group position="apart" mb="md">
          <Group>
            <Badge>{note.tag.name}</Badge>
            {note.public && <Badge color="green">Public</Badge>}
          </Group>
          <Group>
            <ActionIcon onClick={handleShare} title="Share">
              <IconShare size={18} />
            </ActionIcon>
            <ActionIcon
              onClick={() => navigate(`/notes/${noteId}/edit`)}
              title="Edit"
            >
              <IconEdit size={18} />
            </ActionIcon>
            <ActionIcon
              onClick={handleDelete}
              color="red"
              title="Delete"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <Divider mb="md" />

        {/* Note Content */}
        <Box mb="xl">
          <Text style={{ whiteSpace: "pre-wrap" }}>
            {note.note_text}
          </Text>
        </Box>

        <Divider mb="md" />

        {/* Verse References */}
        <Title order={4} mb="sm">
          Verse References
        </Title>
        <Stack spacing="sm">
          {note.verses.map((verse, idx) => (
            <Paper key={idx} p="sm" withBorder>
              <Group position="apart">
                <Box>
                  <Text weight={500}>
                    {verse.book} {verse.chapter}:{verse.verse}
                  </Text>
                  <Text size="sm" color="dimmed">
                    {verse.text}
                  </Text>
                </Box>
                <ActionIcon
                  onClick={() =>
                    handleViewInBible(
                      verse.book,
                      verse.chapter,
                      verse.verse
                    )
                  }
                  title="View in Bible"
                >
                  <IconExternalLink size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>

        {/* Metadata */}
        <Box mt="xl">
          <Text size="xs" color="dimmed">
            Created: {new Date(note.created_at).toLocaleString()}
          </Text>
          <Text size="xs" color="dimmed">
            Updated: {new Date(note.updated_at).toLocaleString()}
          </Text>
        </Box>
      </Paper>

      {/* Back Button */}
      <Group position="center" mt="md">
        <Button variant="subtle" onClick={() => navigate("/notes")}>
          Back to Notes
        </Button>
      </Group>
    </Box>
  );
}
