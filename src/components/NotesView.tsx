import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Select, Center, Loader, Box, Text } from "@mantine/core";
import { Tag } from "../types";
import { getTags } from "../api";
import { useBibleStore } from "../store";

const NotesView = () => {
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(false);
  const lastSelectedTagId = useBibleStore(
    (state) => state.lastSelectedTagId
  );

  useEffect(() => {
    // Prevent double-fetch in React Strict Mode
    if (hasLoadedRef.current) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);

        // Auto-navigate to last selected tag or first tag
        if (
          fetchedTags.length > 0 &&
          !hasAutoNavigatedRef.current
        ) {
          const sorted = [...fetchedTags].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          const targetTagId =
            lastSelectedTagId &&
            fetchedTags.some((t) => t.id === lastSelectedTagId)
              ? lastSelectedTagId
              : sorted[0].id;
          console.log(
            `🔗 NotesView: Navigate to /notes/tag/${targetTagId}`
          );
          hasAutoNavigatedRef.current = true;
          navigate(`/notes/tag/${targetTagId}`, { replace: true });
        }

        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    };
    loadData();
  }, []); // Empty dependency - only load on mount



  // Handle tag selection change
  const handleTagChange = (value: string | null) => {
    if (value) {
      console.log(`🔗 NotesView: Navigate to /notes/tag/${value}`);
      // Navigate to tag-specific route
      navigate(`/notes/tag/${value}`);
    }
  };



  // Sort tags alphabetically for the dropdown
  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

  // Show loading while redirecting to first tag
  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="lg" aria-label="loading" />
      </Center>
    );
  }

  // Show empty state if no tags
  if (tags.length === 0) {
    return (
      <Center style={{ height: '50vh' }}>
        <Box ta="center">
          <Text size="lg" color="dimmed" mb="md">
            No tags found. Create tags to organize your notes.
          </Text>
          <Text size="sm" color="dimmed">
            Go to Tag Management to create your first tag.
          </Text>
        </Box>
      </Center>
    );
  }

  // Show tag selector
  return (
    <Box p="md">
      <Select
        label="Select a tag to view notes"
        placeholder="Select a tag"
        onChange={handleTagChange}
        data={sortedTags.map(tag => ({ value: tag.id, label: tag.name }))}
        searchable
        style={{ maxWidth: 400 }}
      />
    </Box>
  );
};

export default NotesView;
