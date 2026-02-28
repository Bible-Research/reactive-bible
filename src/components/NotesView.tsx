import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, Center, Loader, Box } from "@mantine/core";
import { Tag } from "../types";
import { getTags } from "../api";
import { useBibleStore } from "../store";

const NotesView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastSelectedTagId = useBibleStore((state) => state.lastSelectedTagId);
  const storedTags = useBibleStore((state) => state.tags);
  const [tags, setTags] = useState<Tag[]>(storedTags);
  const [loading, setLoading] = useState(!storedTags.length);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    // Reset navigation flag when component mounts
    hasNavigatedRef.current = false;
    
    // If we have cached tags and lastSelectedTagId, navigate immediately
    if (storedTags.length > 0 && lastSelectedTagId && location.pathname === '/notes') {
      console.log(`🔗 NotesView: Navigate to last selected tag /notes/tag/${lastSelectedTagId}`);
      hasNavigatedRef.current = true;
      navigate(`/notes/tag/${lastSelectedTagId}`, { replace: true });
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      try {
        const fetchedTags = await getTags();
        setTags(fetchedTags);
        
        // Only navigate if we're still on /notes route and haven't navigated yet
        if (fetchedTags.length > 0 && 
            location.pathname === '/notes' && 
            !hasNavigatedRef.current) {
          // Use lastSelectedTagId if available, otherwise use first tag
          const tagId = lastSelectedTagId || 
            [...fetchedTags].sort((a, b) => a.name.localeCompare(b.name))[0].id;
          console.log(`🔗 NotesView: Auto-navigate to tag /notes/tag/${tagId}`);
          hasNavigatedRef.current = true;
          navigate(`/notes/tag/${tagId}`, { replace: true });
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    };
    
    // Only fetch if we don't have cached data
    if (!storedTags.length) {
      loadData();
    }
    
    // Cleanup: reset flag on unmount
    return () => {
      hasNavigatedRef.current = false;
    };
  }, [location.pathname, navigate, lastSelectedTagId, storedTags]);



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
