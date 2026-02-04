import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  TextInput,
  Select,
  Button,
  ActionIcon,
} from "@mantine/core";
import { IconSearch, IconX, IconExternalLink } from "@tabler/icons-react";
import { searchNotes, getTags } from "../api";
import { Note, Tag } from "../types";

export default function NotesSearchRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedTagId, setSelectedTagId] = useState(
    searchParams.get("tag") || ""
  );

  useEffect(() => {
    const loadTags = async () => {
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);
      } catch (err) {
        console.error("Failed to load tags:", err);
      }
    };

    loadTags();
    
    // Trigger search on initial load if query exists
    if (query) {
      handleSearch();
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setSearchParams({ q: query, tag: selectedTagId });
    try {
      const results = await searchNotes(query, selectedTagId);
      setNotes(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Title order={2} mb="md">
        Search Notes
      </Title>

      {/* Search Form */}
      <Paper shadow="sm" p="lg" mb="xl">
        <form onSubmit={handleFormSubmit}>
          <Stack>
            <TextInput
              label="Search Query"
              placeholder="Enter keywords..."
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              rightSection={
                <ActionIcon onClick={() => setQuery("")}>
                  <IconX size={16} />
                </ActionIcon>
              }
              autoFocus
            />
            <Select
              label="Filter by Tag (Optional)"
              placeholder="All tags"
              value={selectedTagId}
              onChange={(value) => setSelectedTagId(value || "")}
              data={tags.map((tag) => ({
                value: tag.id,
                label: tag.name,
              }))}
              clearable
            />
            <Group position="right">
              <Button
                type="submit"
                leftIcon={<IconSearch size={18} />}
                loading={loading}
              >
                Search
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      {/* Results */}
      {loading ? (
        <Center h="40vh">
          <Loader />
        </Center>
      ) : notes.length > 0 ? (
        <Stack spacing="sm">
          <Text color="dimmed">Found {notes.length} note(s)</Text>
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
      ) : (
        searchParams.get("q") && (
          <Center h="40vh">
            <Text color="dimmed">No notes found matching your query.</Text>
          </Center>
        )
      )}
    </Box>
  );
}
