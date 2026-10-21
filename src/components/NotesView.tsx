import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, Loader, Box } from "@mantine/core";
import { useBibleStore } from "../store";

const NotesView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastSelectedTagId = useBibleStore((state) => state.lastSelectedTagId);
  const storedTags = useBibleStore((state) => state.tags);
  const getTags = useBibleStore((state) => state.getTags);
  const [loading, setLoading] = useState(!storedTags.length);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    // Skip if already navigated
    if (hasNavigatedRef.current) {
      return;
    }
    
    // If we have cached tags and lastSelectedTagId, navigate
    // immediately
    if (
      storedTags.length > 0 &&
      lastSelectedTagId &&
      location.pathname === '/notes'
    ) {
      hasNavigatedRef.current = true;
      void navigate(`/notes/tag/${lastSelectedTagId}`, { replace: true });
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        // Call store's getTags which saves to store
        await getTags();
        // Tags are now in store, get them from there
        const fetchedTags = useBibleStore.getState().tags;
        
        // Only navigate if we're still on /notes and have not
        // navigated yet
        if (fetchedTags.length > 0 &&
            location.pathname === '/notes' &&
            !hasNavigatedRef.current) {
          // Prefer lastSelectedTagId; fall back to the
          // alphabetically-first tag
          const tagId = lastSelectedTagId ||
            [...fetchedTags]
              .sort((a, b) => a.name.localeCompare(b.name))[0].id;
          hasNavigatedRef.current = true;
          void navigate(`/notes/tag/${tagId}`, { replace: true });
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    };
    
    // Always fetch if we don't have cached tags
    // We need tags in the store for TagNotesRoute to work
    if (!storedTags.length) {
      void loadData();
    }
  }, [location.pathname, navigate, lastSelectedTagId, storedTags, getTags]);



  // Handle tag selection change
  const handleTagChange = (value: string | null) => {
    if (value) {
      // Navigate to tag-specific route
      void navigate(`/notes/tag/${value}`);
    }
  };



  // Sort tags alphabetically for the dropdown
  const sortedTags = [...storedTags].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

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
