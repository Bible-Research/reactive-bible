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
import { defaultTagId } from '../utils/defaultTag';
import { shallow } from 'zustand/shallow';

type NotesRouteStatus = 'loading' | 'empty' | 'error';

export default function NotesRoute() {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  const { lastSelectedTagId, getTags } = useBibleStore(
    (state) => ({
      lastSelectedTagId: state.lastSelectedTagId,
      getTags: state.getTags,
    }),
    shallow
  );
  // Read `token` for the anonymous check — it is the value that
  // decides whether a session exists at all. (`isAuthenticated`
  // would work too now: the persisted merge derives it from the
  // token, so both rehydrate together.)
  const token = useAuthStore((state) => state.token);
  // 'empty' = tags loaded but the user has none; 'error' = the
  // tags request failed. Both replace the spinner — otherwise
  // a fresh signup (zero tags) or a failed fetch would sit on
  // the Loader forever.
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
      void navigate('/bible', { replace: true });
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
        const targetTagId = defaultTagId(
          currentTags,
          lastSelectedTagId
        );

        if (!targetTagId) {
          // No tags — stay on /notes and show the empty state.
          setStatus('empty');
          return;
        }

        hasNavigatedRef.current = true;
        void navigate(`/notes/tag/${targetTagId}`, { replace: true });
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading tags:', error);
        // A failed getTags used to be caught-and-logged, leaving
        // the loader spinning forever — offer a retry instead.
        setStatus('error');
      }
    };

    setStatus('loading');
    void navigateToTag();
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
