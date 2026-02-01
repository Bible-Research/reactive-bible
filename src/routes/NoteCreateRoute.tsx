import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Badge,
} from "@mantine/core";
import { addTagNote, getTags } from "../api";
import { Tag } from "../types";

export default function NoteCreateRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedTagId, setSelectedTagId] = useState("");
  const [noteText, setNoteText] = useState("");

  // Parse verse context from URL params
  const book = searchParams.get("book");
  const chapter = searchParams.get("chapter");
  const verse = searchParams.get("verse");
  const tagParam = searchParams.get("tag");

  useEffect(() => {
    const loadTags = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);
        
        // Pre-select tag if provided in URL
        if (tagParam) {
          setSelectedTagId(tagParam);
        } else if (fetchedTags.length > 0) {
          // Default to first tag
          setSelectedTagId(fetchedTags[0].id);
        }
      } catch (err) {
        console.error("Failed to load tags:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTags();
  }, [tagParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTagId || !noteText.trim()) return;

    setSaving(true);
    try {
      // Build verse references array
      const verseRefs = [];
      if (book && chapter && verse) {
        verseRefs.push({
          book,
          chapter: parseInt(chapter, 10),
          verse: parseInt(verse, 10),
        });
      }

      const newNote = await addTagNote(
        selectedTagId,
        noteText,
        verseRefs
      );
      
      // Navigate to the new note detail page
      navigate(`/notes/${newNote.id}`);
    } catch (err) {
      alert("Failed to create note");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/notes");
  };

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Box p="md" style={{ maxWidth: 800, margin: "0 auto" }}>
      <Paper shadow="sm" p="lg">
        <Title order={2} mb="md">
          Create New Note
        </Title>

        {book && chapter && verse && (
          <Group mb="md">
            <Text size="sm" color="dimmed">
              Linked to verse:
            </Text>
            <Badge>
              {book} {chapter}:{verse}
            </Badge>
          </Group>
        )}

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
              autoFocus
            />

            <Text size="xs" color="dimmed">
              Tip: You can create notes from any Bible verse by
              right-clicking on it (coming soon)
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
                Create Note
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
