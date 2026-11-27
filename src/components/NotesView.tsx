import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { TagCombobox } from "./TagCombobox";
import { useTranslation } from 'react-i18next';

const NotesView = () => {
  const { t } = useTranslation();
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



  // Always show tag selector, even while loading or redirecting
  // This allows users to change tags immediately. Same picker
  // as the note form's tag field — minus the creation rows:
  // picking only navigates to the tag's notes page.
  return (
    <Box p="md" maw={400}>
      <TagCombobox
        label={t('notes.selectTagToView')}
        value={lastSelectedTagId ?? ''}
        onChange={handleTagChange}
        tags={storedTags}
        creatable={false}
        disabled={loading}
      />
    </Box>
  );
};

export default NotesView;
