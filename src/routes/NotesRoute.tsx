import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Center,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
type NotesRouteStatus = 'loading' | 'empty' | 'error';

export default function NotesRoute() {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  const lastSelectedTagId = useBibleStore(
    (state) => state.lastSelectedTagId
  );
  const getTags = useBibleStore((state) => state.getTags);
  // Read `token` for the anonymous check — it is the value that
  // decides whether a session exists at all. (`isAuthenticated`
  // would work too now: the persisted merge derives it from the
  // token, so both rehydrate together.)
  const token = useAuthStore((state) => state.token);

  const [status, setStatus] = useState<NotesRouteStatus>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Prevent double-navigation in React Strict Mode
    if (hasNavigatedRef.current) return;

    // Anonymous visitors have no "default tag" to land on and no way to
    // browse tags. Send them to the bible page; direct share links to
    // /notes/:noteId or /notes/tag/:tagId still work for them.
    if (!token) {
      hasNavigatedRef.current = true;
      navigate('/bible', { replace: true });
      return;
    }

    let cancelled = false;

    const navigateToTag = async () => {
      try {
        // Ensure tags are loaded (uses cache if available)
        await getTags();
        if (cancelled) return;

        // Get fresh tags from store
        const currentTags = useBibleStore.getState().tags;

        if (currentTags.length === 0) {
          // New accounts have no tags yet — show a real empty
          // state instead of spinning forever.
          setStatus('empty');
          return;
        }

        // Navigate to last selected tag or first tag
        const sorted = [...currentTags].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        const targetTagId =
          lastSelectedTagId &&
          currentTags.some((t) => t.id === lastSelectedTagId)
            ? lastSelectedTagId
            : sorted[0].id;

        hasNavigatedRef.current = true;
        navigate(`/notes/tag/${targetTagId}`, { replace: true });
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading tags:', error);
        // A failed getTags used to be caught-and-logged, leaving
        // the loader spinning forever — offer a retry instead.
        setStatus('error');
      }
    };

    setStatus('loading');
    navigateToTag();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]); // Mount + explicit retries only

  if (status === 'empty') {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="sm">
          <Text color="dimmed" size="lg">
            No tags yet — create a tag to start taking notes.
          </Text>
          <Button
            leftIcon={<IconPlus size={16} />}
            onClick={() => navigate('/tags')}
          >
            Create your first tag
          </Button>
        </Stack>
      </Center>
    );
  }

  if (status === 'error') {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" spacing="sm">
          <Text color="red" size="lg">
            Failed to load your tags.
          </Text>
          <Button
            variant="light"
            leftIcon={<IconRefresh size={16} />}
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Try again
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
