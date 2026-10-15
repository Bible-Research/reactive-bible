import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createTestAuthStore } from '../authStore';
import { useBibleStore } from '../../store';
import {
  cacheNotes,
  getCachedNotes,
} from '../../utils/cacheManager';
import { Note, Tag } from '../../types';

describe('authStore - Logout', () => {
  const mockToken = 'test-token-123';
  const mockUsername = 'testuser';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('auth-storage');
    vi.restoreAllMocks();
  });

  describe('logout', () => {
    it('should clear auth state on logout', () => {
      const useTestAuthStore = createTestAuthStore();
      const { result } = renderHook(() => useTestAuthStore());

      // Set authenticated state
      act(() => {
        result.current.setToken(mockToken, mockUsername);
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Logout
      act(() => {
        result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should clear persisted user data and the notes ' +
      'cache on logout', () => {
        const tag: Tag = {
          id: 'tag-1', name: 'Private Tag', parent_tag: null,
          created_at: '', updated_at: '',
        };
        const note: Note = {
          id: 'note-1', note_text: 'Private note', tag,
          verses: [], public: false, is_owner: true,
          created_at: '', updated_at: '', tag_position: null,
        };
        const useTestAuthStore = createTestAuthStore();
        const { result } = renderHook(() => useTestAuthStore());

        act(() => {
          result.current.setToken(mockToken, mockUsername);
        });

        // Seed the previous session's private data — both
        // the persisted store fields and the notes cache.
        act(() => {
          useBibleStore.setState({
            notes: [note],
            tags: [tag],
            notesCount: 1,
            notesHasMore: true,
            allNotesFetched: true,
            lastSelectedTagId: 'tag-1',
            notesPage: 3,
            readingPositions: {
              MRK: { chapter: 2, verse: 5 },
            },
          });
          cacheNotes('tag-1', [note], {
            count: 1,
            hasMore: false,
          });
        });

        act(() => {
          result.current.logout();
        });

        const state = useBibleStore.getState();
        expect(state.notes).toEqual([]);
        expect(state.tags).toEqual([]);
        expect(state.notesCount).toBe(0);
        expect(state.notesHasMore).toBe(false);
        expect(state.allNotesFetched).toBe(false);
        expect(state.lastSelectedTagId).toBeNull();
        expect(state.notesPage).toBe(1);
        expect(state.readingPositions).toEqual({});
        expect(getCachedNotes('tag-1', 1, null)).toBeNull();
      });
  });
});
