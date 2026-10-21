export interface Tag {
  id: string;
  name: string;
  parent_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface Verse {
  /** Backend contract: a title-cased book name (e.g. "John"). */
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Note {
  id: string;
  note_text: string;
  public: boolean;
  /** Only sent once the backend's is_owner field ships —
   *  treat absence as "not owned" (`=== true` guards). */
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
  tag: Tag | null;
  verses: Verse[];
  headings?: SectionHeading[];
  tag_position: number | null;
  /** Set when the provider failed to resolve verse text. */
  error?: string;
  /** 'rate_limited' | 'provider_error' — see `error`. */
  error_code?: string;
}

export interface SectionHeading {
  before_verse: number;
  text: string;
}

/**
 * One row of `GET /api/v1/notes/order-index/` — a compact,
 * unpaginated listing of every note in a tag in canonical
 * ascending order (`tag_position` ASC, `-created_at` tiebreak).
 * The order ID shown to users is the 1-based array index.
 */
export interface NoteOrderIndexEntry {
  id: string;
  tag_position: number | null;
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
}

/** An order-index row with its precomputed dropdown label —
 *  built once by `TagNotesRoute` and shared by every mounted
 *  `NoteOrderMenu` instead of each re-mapping the full index. */
export interface LabeledNoteOrderEntry {
  entry: NoteOrderIndexEntry;
  label: string;
}

/**
 * Everything a `NoteOrderMenu` needs, bundled so it can be
 * threaded through `TagSection` → `SortableNoteCard`/`NoteCard`
 * as a single prop. Built by `TagNotesRoute`.
 */
export interface NoteOrderMenuData {
  /** All tag notes, pre-labeled, in display order — canonical
   *  ascending, reversed under custom_desc. */
  labeledEntries: LabeledNoteOrderEntry[];
  /** note id → 1-based order ID (canonical index + 1). */
  orderIdByNoteId: Map<string, number>;
  /** Order ID of the visually topmost entry — 1 in
   *  custom_asc, the highest order ID in custom_desc. */
  topOrderId: number;
  /** Move `noteId` to just after `targetNoteId` (display order). */
  onMoveAfter: (noteId: string, targetNoteId: string) => void;
  /** Move `noteId` to the visual top of the list. */
  onMoveToTop: (noteId: string) => void;
}

export interface VerseTimestamp {
  verse_start: number;
  timestamp: number;
}

export interface FilesetCopyright {
  id: string;
  type: string;
  size: string;
  copyright: string;
  copyright_date: string;
  copyright_description: string;
}

export interface CommentAuthor {
  id: number;
  username: string;
}

export interface CommentImage {
  id: string;
  storage_url: string;
  signed_url: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_by: number;
  created_at: string;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  note_id: string;
  parent_comment: string | null;
  content: string;
  timestamp: string;
  is_deleted: boolean;
  replies: Comment[] | undefined;
  images: CommentImage[];
}

export type CommentCounts = Record<string, number>;

export interface PlaylistItem {
  /**
   * Unique per item — a note spanning chapters emits one item
   * per block, so `itemId` suffixes the note id with
   * `book:chapter`. Audio effects key on it, so duplicates
   * would skip scroll/highlight runs between blocks.
   */
  itemId: string;
  /**
   * DOM/highlight scope the item's verses render under — the
   * note id for note blocks. Defaults to `itemId` when absent
   * (search items already carry unique ids).
   */
  scope?: VerseScope;
  /** USFM book code (e.g. "JHN"). */
  bookId: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  label: string;
  verseNumbers?: number[];
}

/** A fully-qualified verse coordinate. */
export interface VerseRef {
  /** USFM book code (e.g. "JHN"). */
  bookId: string;
  chapter: number;
  verse: number;
}

/** 'bible' = PassageView chapter; a note id = inside that NoteCard. */
export type VerseScope = string;

export interface VerseSelection {
  scope: VerseScope;
  refs: VerseRef[];
}

export interface AudioActiveVerse {
  /** USFM book code (e.g. "JHN"). */
  bookId: string;
  chapter: number;
  verse: number;
  scope?: VerseScope; // 'bible' | PlaylistItem.scope/itemId
}

export interface ReadingPosition {
  id: string;
  /** Backend book name (e.g. "John"), not a USFM code. */
  book: string;
  chapter: number;
  verse: number;
  last_accessed: string;
}

export interface Fileset {
  id: string;
  type: "text_plain" | "audio" | "audio_drama";
  size: string;
  codec: "mp3" | "opus" | null;
  bitrate: string | null;
}

export interface Translation {
  abbr: string;
  name: string;
  language: string;
  language_iso: string;
  filesets: Fileset[];
  /**
   * Normalized audio/text options supplied by newer backends
   * (`by_testament` member maps). When present they take
   * precedence over client-side grouping of `filesets` — see
   * `src/utils/filesetGroups.ts`.
   */
  audio_options?: unknown[];
  text_options?: unknown[];
}

export interface KjvBook {
  chapter: number;
  verse: number;
  text: string;
  translation_id: string;
  book_id: string;
  book_name: string;
}

export interface NotePositionUpdate {
  note_id: string;
  position: number;
}

export type MovePlacement = 'before' | 'after';

export interface MoveNoteResponse {
  note_id: string;
  tag_position: number;
  rebalanced: boolean;
}

export interface PaginatedNotesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Note[];
}

export interface LinkedNotesResponse {
  count: number;
  results: Note[];
}

export interface SearchVerse {
  book_id: string;
  chapter: number;
  verse_start: number;
  verse_text: string;
}

export interface SearchPagination {
  total: number;
  count: number;
  per_page: number;
  current_page: number;
  total_pages: number;
}

export interface SearchResponse {
  verses: SearchVerse[];
  meta: { pagination?: SearchPagination };
}

export interface SearchVerseGroup {
  book_id: string;
  count: number;
  verses: SearchVerse[];
}

export interface GroupedSearchResponse {
  groups: SearchVerseGroup[];
  meta: { total: number; truncated: boolean };
}

export type ReadingPositionValue = {
  chapter: number;
  verse: number;
};
