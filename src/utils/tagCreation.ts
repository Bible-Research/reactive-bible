/**
 * Inline tag creation from the note tag combobox: `Parent/child`
 * path parsing, ancestor reuse, sequential creation with
 * compensating rollback, and the "delete only what's still
 * unused" sweep behind the toast's Undo action.
 */
import { createTag, deleteTag, getTags } from '../api';
import type { Tag } from '../types';

/**
 * Split `query` on `/` into trimmed, non-empty segments.
 * Returns null for anything that isn't a ≥2-segment path —
 * `design`, `Work/` and `/x` are literal names, `Work/design`
 * and `a//b` are paths.
 */
export const splitPathQuery = (query: string): string[] | null => {
  // `›` splits too — a pasted display path (`Work ›
  // design`) must behave like the typed `Work/design`,
  // not create a literal separator-bearing name.
  if (!/[/›]/.test(query)) return null;
  const segments = query
    .split(/[/›]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return segments.length >= 2 ? segments : null;
};

export interface PathResolution {
  /** Existing tags matched root→down. */
  existing: Tag[];
  /** Segment names still needing creation (leaf last). */
  missing: string[];
}

/**
 * Walk `segments` level by level starting under `parentId`
 * (null = top level), matching each name case-insensitively
 * among that level's children. Matching stops at the first
 * miss — everything deeper is reported as `missing`.
 */
export const resolvePath = (
  tags: Tag[],
  segments: string[],
  parentId: string | null = null
): PathResolution => {
  const existing: Tag[] = [];
  let level = parentId;
  for (const segment of segments) {
    const match = tags.find(
      (tag) =>
        tag.parent_tag === level &&
        tag.name.toLowerCase() === segment.toLowerCase()
    );
    if (!match) {
      return {
        existing,
        missing: segments.slice(existing.length),
      };
    }
    existing.push(match);
    level = match.id;
  }
  return { existing, missing: [] };
};

export interface CreatedTagPath {
  /** The deepest tag — the one to select for the note. */
  leaf: Tag;
  /** Tags this call created, root→leaf order. */
  created: Tag[];
}

/**
 * Create `query` under `parentTagId`. A `/` query creates the
 * missing tail of the resolved path; a plain query creates a
 * single tag named `query`. On failure, tags created by this
 * call are deleted deepest-first (best-effort atomicity —
 * the API has no bulk endpoint) and the error rethrows.
 *
 * When the whole path already exists nothing is created:
 * `leaf` is the resolved tag and `created` is empty.
 */
export const createTagPath = async (
  query: string,
  tags: Tag[],
  parentTagId: string | null = null
): Promise<CreatedTagPath> => {
  const segments = splitPathQuery(query) ?? [query.trim()];
  const { existing, missing } = resolvePath(
    tags,
    segments,
    parentTagId
  );
  let parent = existing.length
    ? existing[existing.length - 1].id
    : parentTagId;
  const created: Tag[] = [];
  try {
    for (const name of missing) {
      const tag = await createTag(name, parent);
      created.push(tag);
      parent = tag.id;
    }
  } catch (error) {
    for (const tag of [...created].reverse()) {
      // Rollback is best-effort — a failed delete must not
      // mask the original creation error.
      await deleteTag(tag.id).catch(() => undefined);
    }
    throw error;
  }
  const leaf =
    created.length > 0
      ? created[created.length - 1]
      : existing[existing.length - 1];
  return { leaf, created };
};

export interface UndoCreatedResult {
  /** Created tags actually deleted. */
  deleted: Tag[];
  /** Created tags kept because they are now in use. */
  kept: Tag[];
}

/**
 * Undo sweep behind the creation toast: delete every tag the
 * action `created`, deepest-first, skipping any that are now
 * in use — a fresh listing shows `note_count` > 0 or a child
 * that was not itself deleted by this sweep. Reused ancestors
 * are never in `created`, so they are never touched.
 */
export const deleteUnusedCreatedTags = async (
  created: Tag[]
): Promise<UndoCreatedResult> => {
  const fresh = await getTags();
  const byId = new Map(fresh.map((t) => [t.id, t]));
  const deletedIds = new Set<string>();
  const deleted: Tag[] = [];
  const kept: Tag[] = [];

  for (const tag of [...created].reverse()) {
    const current = byId.get(tag.id);
    // Already gone — nothing to do.
    if (!current) continue;
    const foreignChild = fresh.some(
      (other) =>
        other.parent_tag === tag.id && !deletedIds.has(other.id)
    );
    // A missing count means "unknown" — keep rather than
    // risk deleting a tag that has notes.
    const inUse =
      current.note_count === undefined ||
      current.note_count > 0 ||
      foreignChild;
    if (inUse) {
      kept.push(current);
      continue;
    }
    try {
      await deleteTag(tag.id);
      deletedIds.add(tag.id);
      deleted.push(current);
    } catch {
      kept.push(current);
    }
  }
  return { deleted, kept };
};
