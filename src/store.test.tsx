import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBibleStore, initialState } from './store';
import { act } from '@testing-library/react';
import * as api from './api';

// Mock the API
vi.mock('./api', () => ({
  getNotes: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Zustand Store (useBibleStore)', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      useBibleStore.setState(initialState);
    });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should initialize with the default state', () => {
    const state = useBibleStore.getState();
    expect(state.activeBook).toBe('Genesis');
    expect(state.activeChapter).toBe(1);
    expect(state.activeVerses).toEqual([]);
  });

  it('should update activeBook and reset chapter/verses', () => {
    act(() => {
      useBibleStore.getState().setActiveBook('Exodus');
    });
    const state = useBibleStore.getState();
    expect(state.activeBook).toBe('Exodus');
    expect(state.activeChapter).toBe(1);
    expect(state.activeVerses).toEqual([]);
  });

  it('should update activeChapter and reset verses', () => {
    act(() => {
      useBibleStore.getState().setActiveChapter(5);
    });
    const state = useBibleStore.getState();
    expect(state.activeChapter).toBe(5);
    expect(state.activeVerses).toEqual([]);
  });

  it('should update activeVerses', () => {
    act(() => {
      useBibleStore.getState().setActiveVerses([1, 2, 3]);
    });
    const state = useBibleStore.getState();
    expect(state.activeVerses).toEqual([1, 2, 3]);
  });

  it('should fetch and set notes', async () => {
    const mockNotes = [{ id: '1', text: 'A test note' }];
    (api.getNotes as vi.Mock).mockResolvedValue(mockNotes);

    await act(async () => {
      await useBibleStore.getState().fetchNotes();
    });

    const state = useBibleStore.getState();
    expect(state.notes).toEqual(mockNotes);
    expect(api.getNotes).toHaveBeenCalledWith(undefined);
  });

  it('should fetch notes with a tagId', async () => {
    const mockNotes = [{ id: '2', text: 'Another test note' }];
    (api.getNotes as vi.Mock).mockResolvedValue(mockNotes);

    await act(async () => {
      await useBibleStore.getState().fetchNotes('some-tag-id');
    });

    const state = useBibleStore.getState();
    expect(state.notes).toEqual(mockNotes);
    expect(api.getNotes).toHaveBeenCalledWith('some-tag-id');
  });

  
});
