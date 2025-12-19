import { useEffect, useState } from "react";
import { ScrollArea, Box, Loader, Text, Center, Select, Group, Button, Stack } from "@mantine/core";
import { Note } from "../api";
import TagSection from "./TagSection";

interface NotesViewProps {
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const NotesView = ({ onViewInBible }: NotesViewProps) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [tags, setTags] = useState<{ id: string; name: string; key: number }[]>([]);

  // Fetch tags from API
  const fetchTags = async () => {
    try {
      const response = await fetch(
        "https://bible-research.vercel.app/api/v1/tags/"
      );
      const data = await response.json();
      const fetchedTags = data.map((item: { id: any; name: any; }, index: any) => ({
        id: item.id,
        name: item.name,
        key: index,
      }));
      setTags(fetchedTags);
      
      // Set first tag as default if not already set
      if (fetchedTags.length > 0 && !selectedTagId) {
        setSelectedTagId(fetchedTags[0].id);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  // Fetch notes by tag ID with timeout and abort handling
  const fetchNotesByTag = async (tagId: string) => {
    setLoading(true);
    setError(null);
    
    // Create AbortController for request cancellation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    try {
      let url = 'https://bible-research.vercel.app/api/v1/notes';
      
      // If tagId is empty string, fetch all notes
      // Otherwise, fetch notes for specific tag
      if (tagId) {
        url += `?tag_id=${tagId}`;
      }
      
      console.log(`Fetching notes from: ${url}`);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch notes: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Fetched ${data.length} notes`);
      setNotes(data);
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        setError('Request timed out after 30 seconds. The server may be slow or unavailable.');
        console.error('Request timeout:', err);
      } else {
        setError(err.message || 'Failed to fetch notes');
        console.error('Error fetching notes:', err);
      }
      
      // Keep existing notes on error (don't clear them)
    } finally {
      setLoading(false);
    }
  };

  // Fetch tags on mount
  useEffect(() => {
    fetchTags();
  }, []);

  // Fetch notes when selectedTagId changes
  useEffect(() => {
    if (selectedTagId !== null) {
      fetchNotesByTag(selectedTagId);
    }
  }, [selectedTagId]);

  // Sort tags alphabetically
  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

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
        <Stack align="center" spacing="md">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">Loading notes...</Text>
          <Text size="xs" c="dimmed">This may take up to 30 seconds</Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="80vh">
        <Stack align="center" spacing="md">
          <Text c="red" weight={500}>Error loading notes</Text>
          <Text size="sm" c="dimmed" ta="center" maw={400}>
            {error}
          </Text>
          <Button 
            onClick={() => fetchNotesByTag(selectedTagId)}
            variant="light"
          >
            Retry
          </Button>
          <Text size="xs" c="dimmed" ta="center" maw={400}>
            If the problem persists, the API server may be experiencing issues.
            Try selecting a different tag or check back later.
          </Text>
        </Stack>
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
              value={selectedTagId}
              onChange={(value) => {
                setSelectedTagId(value || '');
              }}
              onDropdownOpen={() => {
                // Refresh tags when dropdown opens
                fetchTags();
              }}
              data={[
                { value: '', label: 'All Tags' },
                ...sortedTags.map((tag) => ({ value: tag.id, label: tag.name })),
              ]}
              placeholder="Select a tag"
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
