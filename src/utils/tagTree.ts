import type { Tag } from '../types';

/** A node in the tag hierarchy rendered by TagTree. */
export interface TagNode {
  tag: Tag;
  children: TagNode[];
}

/**
 * Groups flat tags into a parent/child tree sorted by name
 * (locale order) at every level. A tag whose `parent_tag` is
 * missing from `tags` — filtered out or deleted upstream —
 * is promoted to a root.
 */
export const buildTagTree = (tags: Tag[]): TagNode[] => {
  const map = new Map<string, TagNode>();
  const roots: TagNode[] = [];

  tags.forEach((tag) => {
    map.set(tag.id, { tag, children: [] });
  });

  tags.forEach((tag) => {
    // map was populated from `tags` above, so this is
    // always present — guard anyway instead of asserting.
    const node = map.get(tag.id);
    if (!node) return;
    if (tag.parent_tag) {
      const parent = map.get(tag.parent_tag);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: TagNode[]): TagNode[] => {
    return nodes
      .sort((a, b) => a.tag.name.localeCompare(b.tag.name))
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));
  };

  return sortNodes(roots);
};

/**
 * True when `descendantId` sits anywhere under `ancestorId`
 * in the parent chain — used to reject circular parent
 * choices in the tag editor. A visited set guards against
 * parent cycles already present in the data.
 */
export const isTagDescendant = (
  tags: Tag[],
  ancestorId: string,
  descendantId: string
): boolean => {
  const visited = new Set<string>();
  let currentId: string | null = descendantId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current = tags.find((t) => t.id === currentId);
    if (!current || !current.parent_tag) return false;
    if (current.parent_tag === ancestorId) return true;
    currentId = current.parent_tag;
  }
  return false;
};

/** Display separator between ancestor names in a tag path. */
export const TAG_PATH_SEPARATOR = ' › ';

/**
 * Root→leaf ancestor names for `tag`, e.g. `['Work',
 * 'design']`. A tag whose `parent_tag` is missing from `tags`
 * is treated as a root (mirroring `buildTagTree`); the visited
 * set guards against cycles already present in the data.
 */
export const tagPathSegments = (tags: Tag[], tag: Tag): string[] => {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const segments = [tag.name];
  const visited = new Set<string>([tag.id]);
  let current = tag;
  while (current.parent_tag) {
    const parent = byId.get(current.parent_tag);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    segments.unshift(parent.name);
    current = parent;
  }
  return segments;
};

/** Full ancestor path label, e.g. `Work › design`. */
export const tagPath = (tags: Tag[], tag: Tag): string =>
  tagPathSegments(tags, tag).join(TAG_PATH_SEPARATOR);

/**
 * Canonical form for query↔path comparison: lowercase, trimmed,
 * and every separator (`/`, ` › `, with optional surrounding
 * whitespace) folded to a single `/`. `Work/design` and
 * `Work › design` normalize identically, and a bare `design`
 * substring-matches the tail of `work/design`.
 */
export const normalizeTagPath = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s*(?:›|\/)\s*/g, '/');

/**
 * Tags whose full path contains `query` (normalized — a
 * slash-typed query matches ` › ` labels and vice versa).
 * Empty query returns all tags.
 */
export const matchTagQuery = (tags: Tag[], query: string): Tag[] => {
  const q = normalizeTagPath(query);
  if (!q) return tags;
  return tags.filter((tag) =>
    normalizeTagPath(tagPath(tags, tag)).includes(q)
  );
};

/**
 * True when `query` exactly equals some tag's normalized full
 * path — used to suppress the create rows for paths that
 * already exist.
 */
export const isExactPathMatch = (
  tags: Tag[],
  query: string
): boolean => {
  const q = normalizeTagPath(query);
  return tags.some(
    (tag) => normalizeTagPath(tagPath(tags, tag)) === q
  );
};

/**
 * True when a top-level tag already carries `name`
 * (case-insensitive) — the backend rejects duplicate
 * top-level names, so the direct create row hides then.
 */
export const isTopLevelNameTaken = (
  tags: Tag[],
  name: string
): boolean => {
  const n = name.trim().toLowerCase();
  return tags.some(
    (tag) => !tag.parent_tag && tag.name.toLowerCase() === n
  );
};

export const TAG_NAME_MAX_LENGTH = 100;

/**
 * Validates a tag name for create/edit. `excludeTagId` lets
 * the editor keep its own current name without tripping the
 * duplicate check. Returns the error message, or null when
 * the name is valid.
 */
export const validateTagName = (
  name: string,
  existingTags: Tag[],
  excludeTagId?: string
): string | null => {
  if (!name.trim()) {
    return 'Tag name is required';
  }

  if (name.length > TAG_NAME_MAX_LENGTH) {
    return 'Tag name must be 100 characters or less';
  }

  const isDuplicate = existingTags.some(
    (tag) =>
      tag.id !== excludeTagId &&
      tag.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (isDuplicate) {
    return 'A tag with this name already exists';
  }

  return null;
};
