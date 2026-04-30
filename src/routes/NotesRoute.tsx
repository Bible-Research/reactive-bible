import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Center, Loader, Text, Button, Stack } from '@mantine/core';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';

export default function NotesRoute() {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { lastSelectedTagId, getTags } = useBibleStore((state) => ({
    lastSelectedTagId: state.lastSelectedTagId,
    getTags: state.getTags,
  }));
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const navigateToTag = async () => {
    setError(null);
    try {
      // Ensure tags are loaded (uses cache if available)
      await getTags();

      // Get fresh tags from store
      const currentTags = useBibleStore.getState().tags;

      if (currentTags.length === 0) {
        // No tags - stay on /notes and show empty state
        return;
      }

      // Navigate to last selected tag or first tag
      const sorted = [...currentTags].sort((a, b) => a.name.localeCompare(b.name));
      const targetTagId =
        lastSelectedTagId && currentTags.some((t) => t.id === lastSelectedTagId)
          ? lastSelectedTagId
          : sorted[0].id;

      console.log(`🔗 NotesRoute: Navigate to /notes/tag/${targetTagId}`);
      hasNavigatedRef.current = true;
      navigate(`/notes/tag/${targetTagId}`, { replace: true });
    } catch (err) {
      console.error('Error loading tags:', err);
      setError('Failed to load tags. Please try again.');
    }
  };

  useEffect(() => {
    // Prevent double-navigation in React Strict Mode
    if (hasNavigatedRef.current) return;

    // Anonymous visitors have no "default tag" to land on and no way to
    // browse tags. Send them to the bible page; direct share links to
    // /notes/:noteId or /notes/tag/:tagId still work for them.
    if (!isAuthenticated) {
      hasNavigatedRef.current = true;
      navigate('/bible', { replace: true });
      return;
    }

    navigateToTag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (error) {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="md">
          <Text color="red" size="lg">{error}</Text>
          <Button onClick={navigateToTag}>
            Retry
          </Button>
        </Stack>
      </Center>
    );
  }

  // Show loading while redirecting
  return (
    <Center style={{ height: '100vh' }}>
      <Loader size="lg" aria-label="Loading notes" />
    </Center>
  );
}
