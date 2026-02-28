import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, Loader, Box } from "@mantine/core";
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
    // Skip if already navigated
    if (hasNavigatedRef.current) {
      return;
    }
    
    // If we have cached tags and lastSelectedTagId, navigate immediately
    if (storedTags.length > 0 && lastSelectedTagId && location.pathname === '/notes') {
      console.log(`🔗 NotesView: Navigate to last selected tag /notes/tag/${lastSelectedTagId}`);
      hasNavigatedRef.current = true;
      navigate(`/notes/tag/${lastSelectedTagId}`, { replace: true });
      return;
    }
    
    // If tags not cached, we MUST load them before navigating
    // Even if we have lastSelectedTagId, we need tags in the store
    if (storedTags.length === 0) {
      console.log('📝 Loading tags before navigation...');
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
    
    // Always fetch if we don't have cached tags
    // We need tags in the store for TagNotesRoute to work
    if (!storedTags.length) {
      loadData();
    }
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

  // Always show tag selector, even while loading or redirecting
  // This allows users to change tags immediately
  return (
    <Box p="md">
      <Select
        label="Select a tag to view notes"
        placeholder={loading ? "Loading tags..." : "Select a tag"}
        value={lastSelectedTagId || undefined}
        onChange={handleTagChange}
        data={sortedTags.map(tag => ({ value: tag.id, label: tag.name }))}
        searchable
        disabled={loading}
        style={{ maxWidth: 400 }}
        rightSection={loading ? <Loader size="xs" /> : undefined}
      />
    </Box>
  );
};

export default NotesView;
