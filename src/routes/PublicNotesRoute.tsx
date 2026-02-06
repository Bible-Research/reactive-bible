import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Title,
  Stack,
  Group,
  Text,
  Loader,
  Center,
  Badge,
  ActionIcon,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { getPublicNotes } from "../api";
import { Note } from "../types";

export default function PublicNotesRoute() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPublicNotes = async () => {
      setLoading(true);
      try {
        const fetchedNotes = await getPublicNotes();
        setNotes(fetchedNotes);
      } catch (err) {
        console.error("Failed to load public notes:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPublicNotes();
  }, []);

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" data-testid="loader" />
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title order={2} mb="md">
        Public Notes
      </Title>

      {notes.length === 0 ? (
        <Center h="50vh">
          <Text color="dimmed">No public notes found.</Text>
        </Center>
      ) : (
        <Stack spacing="sm">
          {notes.map((note) => (
            <Paper
              key={note.id}
              p="sm"
              withBorder
              sx={(theme) => ({
                cursor: "pointer",
                "&:hover": {
                  backgroundColor:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[6]
                      : theme.colors.gray[0],
                },
              })}
              onClick={() => navigate(`/notes/${note.id}`)}
            >
              <Group position="apart">
                <Box style={{ flex: 1 }}>
                  <Text
                    lineClamp={2}
                    size="sm"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {note.note_text}
                  </Text>
                  <Group spacing="xs" mt="xs">
                    <Badge size="xs">{note.tag.name}</Badge>
                    <Text size="xs" color="dimmed">
                      {note.verses.length} verse(s) •{" "}
                      {new Date(note.created_at).toLocaleDateString()}
                    </Text>
                  </Group>
                </Box>
                <ActionIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/notes/${note.id}`);
                  }}
                  title="View Note"
                >
                  <IconExternalLink size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
