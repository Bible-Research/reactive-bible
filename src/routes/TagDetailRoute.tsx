import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Title,
  Button,
  Stack,
  Group,
  Text,
  Loader,
  Center,
  ActionIcon,
  Divider,
  Badge,
} from "@mantine/core";
import {
  IconEdit,
  IconTrash,
  IconArrowLeft,
  IconNote,
} from "@tabler/icons-react";
import { getTag, deleteTag, getNotes } from "../api";
import { Tag, Note } from "../types";

export default function TagDetailRoute() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const [tag, setTag] = useState<Tag | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tagId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedTag, fetchedNotes] = await Promise.all([
          getTag(tagId),
          getNotes(tagId),
        ]);
        setTag(fetchedTag);
        setNotes(fetchedNotes);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tag"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tagId]);

  const handleDelete = async () => {
    if (!tagId || !tag) return;
    if (!confirm(`Delete tag "${tag.name}"? This will not delete the notes.`)) {
      return;
    }

    try {
      await deleteTag(tagId);
      navigate("/tags");
    } catch (err) {
      alert("Failed to delete tag");
    }
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error || !tag) {
    return (
      <Center h="80vh">
        <Stack align="center">
          <Text color="red">{error || "Tag not found"}</Text>
          <Button onClick={() => navigate("/tags")}>Back to Tags</Button>
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
            <ActionIcon onClick={() => navigate("/tags")}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Title order={2}>{tag.name}</Title>
          </Group>
          <Group>
            <ActionIcon
              onClick={() => navigate(`/tags/${tagId}/edit`)}
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

        {/* Tag Info */}
        <Stack spacing="md" mb="xl">
          <Group>
            <Text weight={500}>Parent Tag:</Text>
            <Text color="dimmed">
              {tag.parent_tag ? (
                <Button
                  variant="subtle"
                  compact
                  onClick={() => navigate(`/tags/${tag.parent_tag}`)}
                >
                  View Parent
                </Button>
              ) : (
                "None (Root Tag)"
              )}
            </Text>
          </Group>
          <Group>
            <Text weight={500}>Total Notes:</Text>
            <Badge>{notes.length}</Badge>
          </Group>
        </Stack>

        <Divider mb="md" />

        {/* Notes List */}
        <Title order={4} mb="sm">
          Notes with this tag
        </Title>
        {notes.length === 0 ? (
          <Center p="xl">
            <Stack align="center">
              <Text color="dimmed">No notes with this tag yet</Text>
              <Button
                leftIcon={<IconNote size={18} />}
                onClick={() =>
                  navigate(`/notes/new?tag=${tagId}`)
                }
              >
                Create Note
              </Button>
            </Stack>
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
                    <Text size="xs" color="dimmed" mt="xs">
                      {note.verses.length} verse(s) •{" "}
                      {new Date(note.created_at).toLocaleDateString()}
                    </Text>
                  </Box>
                  {note.public && (
                    <Badge color="green" size="sm">
                      Public
                    </Badge>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Back Button */}
      <Group position="center" mt="md">
        <Button variant="subtle" onClick={() => navigate("/tags")}>
          Back to Tags
        </Button>
      </Group>
    </Box>
  );
}
