import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useBibleStore } from '../store';
import { getTags } from '../api';

export default function NotesRoute() {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  const lastSelectedTagId = useBibleStore((state) => state.lastSelectedTagId);

  useEffect(() => {
    // Prevent double-navigation in React Strict Mode
    if (hasNavigatedRef.current) return;

    const navigateToTag = async () => {
      try {
        const tags = await getTags();
        
        if (tags.length === 0) {
          // No tags - stay on /notes and show empty state
          // This will be handled by NotesView component
          return;
        }

        // Navigate to last selected tag or first tag
        const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
        const targetTagId = 
          lastSelectedTagId && tags.some((t) => t.id === lastSelectedTagId)
            ? lastSelectedTagId
            : sorted[0].id;
        
        console.log(`🔗 NotesRoute: Navigate to /notes/tag/${targetTagId}`);
        hasNavigatedRef.current = true;
        navigate(`/notes/tag/${targetTagId}`, { replace: true });
      } catch (error) {
        console.error('Error loading tags:', error);
      }
    };

    navigateToTag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Show loading while redirecting
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading notes" />
    </Center>
  );
}
