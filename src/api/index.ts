/**
 * API barrel: every backend call lives in the domain modules
 * under `src/api/` and is re-exported here so existing
 * `from '../api'` imports — and every `vi.mock('../api')` in
 * tests — keep intercepting the whole surface unchanged.
 */
export * from './errors';
export * from './structure';
export * from './verses';
export * from './audio';
export * from './translations';
export * from './notes';
export * from './tags';
export * from './comments';
export * from './search';
export * from './readingPositions';

// Shared API/domain types live in `../types`; re-export them
// here so every existing `from '../api'` type import (and the
// vi.mock barrels) keeps working unchanged.
export type {
  SectionHeading,
  KjvBook,
  Note,
  Tag,
  NotePositionUpdate,
  MovePlacement,
  MoveNoteResponse,
  PaginatedNotesResponse,
  LinkedNotesResponse,
  Comment,
  CommentAuthor,
  CommentCounts,
  CommentImage,
  NoteImage,
  SearchVerse,
  SearchPagination,
  SearchResponse,
  SearchVerseGroup,
  GroupedSearchResponse,
  ReadingPositionValue,
} from '../types';
