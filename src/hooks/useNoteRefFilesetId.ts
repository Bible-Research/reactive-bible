import { useBibleStore } from '../store';

/**
 * The stored text-fileset selection for note-reference
 * surfaces — the '@…' scripture preview and note-linked
 * verse text: the pinned Settings override when one is set,
 * else the reader's `activeTextFilesetId`. The returned id
 * may still be a product id (`{abbr}:text:{n}`) — callers
 * resolve it per book with `resolveTextFileset` exactly
 * like the reader does, falling back to 'ENGESV_API' only
 * when resolution yields `null`.
 */
export const useNoteRefFilesetId = (): string | null =>
  useBibleStore(
    (state) => state.noteRefFilesetId ?? state.activeTextFilesetId
  );
