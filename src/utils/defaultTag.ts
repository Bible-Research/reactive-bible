import type { Tag } from '../types';

/**
 * Resolves the tag `/notes` should land on: the last-viewed tag
 * when it still exists, else the alphabetically first tag.
 * Returns null when the user has no tags — the route shows its
 * empty state instead of spinning on the loader forever (the
 * zero-tags spinner fix lives here).
 */
export const defaultTagId = (
  tags: Tag[],
  lastSelectedTagId: string | null
): string | null => {
  if (tags.length === 0) return null;
  if (
    lastSelectedTagId &&
    tags.some((tag) => tag.id === lastSelectedTagId)
  ) {
    return lastSelectedTagId;
  }
  const sorted = [...tags].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return sorted[0].id;
};
