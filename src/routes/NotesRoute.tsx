import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Center, Loader, Text } from '@mantine/core';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { defaultTagId } from '../utils/defaultTag';
import { shallow } from 'zustand/shallow';

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
  // Read `token`, not `isAuthenticated`: the token rehydrates
  // synchronously from localStorage, while `isAuthenticated` only
  // flips once App's mount effect calls checkAuth — child effects
  // run first, so a cold /notes load would see `false` and bounce
  // logged-in users to /bible.
  const token = useAuthStore((state) => state.token);
  // 'empty' = tags loaded but the user has none; 'error' = the
  // tags request failed. Both replace the spinner — otherwise
  // a fresh signup (zero tags) or a failed fetch would sit on
  // the Loader forever.
  const [status, setStatus] = useState<'loading' | 'empty' | 'error'>(
    'loading'
  );

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

    const navigateToTag = async () => {
      try {
        // Ensure tags are loaded (uses cache if available)
        await getTags();
        
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
        console.error('Error loading tags:', error);
        setStatus('error');
      }
    };

    void navigateToTag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (status !== 'loading') {
    return (
      <Center style={{ height: '100vh' }}>
        <Text color="dimmed">
          {status === 'empty'
            ? 'No notes yet — create a note to get started.'
            : 'Could not load notes. Please try again.'}
        </Text>
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
