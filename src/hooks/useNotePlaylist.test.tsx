import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotePlaylist } from './useNotePlaylist';
import { useBibleStore, initialState } from '../store';
import type {
  BibleStructure,
  Note,
  Verse,
} from '../types';
import catalogLv from '../assets/bookNames.lv.json';

const LV = catalogLv as unknown as BibleStructure;

const verse = (
  book: string,
  chapter: number,
  v: number
): Verse => ({ book, chapter, verse: v, text: '' });

const note = (id: string, verses: Verse[] = []): Note => ({
  id,
  note_text: '',
  public: true,
  is_owner: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '',
  tag: null,
  verses,
  tag_position: null,
});

beforeEach(() => {
  useBibleStore.setState({
    ...initialState,
    structureByBible: {},
    activeStructureKey: null,
  });
});

describe('useNotePlaylist', () => {
  it('re-derives localized labels when the active ' +
    'structure swaps in', () => {
      const notes = [note('n1', [verse('John', 3, 16)])];
      renderHook(() => useNotePlaylist(notes, false, 't1'));

      // English contract name until a structure lands.
      expect(
        useBibleStore.getState().audioPlaylistItems?.[0]
          ?.label
      ).toContain('John 3:16');

      act(() => {
        useBibleStore.setState({
          structureByBible: { LAVNLI: LV },
          activeStructureKey: 'LAVNLI',
        });
      });

      expect(
        useBibleStore.getState().audioPlaylistItems?.[0]
          ?.label
      ).toContain('Jāņa evaņģēlijs');
    });
});
