import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Select, Center, Loader, Box } from "@mantine/core";
import { Tag } from "../types";
import { getTags } from "../api";

const NotesView = () => {
  const navigate = useNavigate();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Prevent double-fetch in React Strict Mode
    if (hasLoadedRef.current) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);
        if (fetchedTags.length > 0) {
          const sorted = [...fetchedTags].sort((a, b) => a.name.localeCompare(b.name));
          const firstTagId = sorted[0].id;
          // Navigate to first tag instead of fetching directly
          console.log(`🔗 NotesView: Auto-navigate to first tag /notes/tag/${firstTagId}`);
          navigate(`/notes/tag/${firstTagId}`, { replace: true });
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

  // Show tag selector (will redirect when tag is selected)
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
