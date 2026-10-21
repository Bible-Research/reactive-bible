import { Comment, CommentImage } from '../types';

/**
 * Display name for an attached comment image. The original file
 * name is the last path segment of storage_url
 * (…/originals/<image_id>/<file name>) — URL-decoded so
 * 'my%20pic.png' shows as 'my pic.png'.
 */
export function commentImageName(image: CommentImage): string {
  const segment = (image.storage_url ?? '').split('/').pop();
  if (!segment) return 'comment attachment';
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed escape — show the raw segment.
    return segment;
  }
}

/**
 * Find a node by id anywhere in the tree (deep).
 */
export function findNode(
  tree: Comment[],
  id: string
): Comment | null {
  for (const node of tree ?? []) {
    if (node.id === id) return node;
    const hit = findNode(node.replies ?? [], id);
    if (hit) return hit;
  }
  return null;
}

const replies = (node: Comment): Comment[] =>
  node.replies ?? [];

/**
 * Insert a new comment as a reply to the given parentId.
 * If parentId is null — or the parent vanished between fetch
 * and submit (deleted while the user was writing) — appends to
 * the root list so the reply is never silently dropped.
 */
export function insertReply(
  tree: Comment[],
  parentId: string | null,
  newComment: Comment
): Comment[] {
  if (parentId === null || !findNode(tree ?? [], parentId)) {
    return [...(tree ?? []), newComment];
  }
  return (tree ?? []).map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        replies: [...replies(node), newComment],
      };
    }
    if (replies(node).length > 0) {
      return {
        ...node,
        replies: insertReply(replies(node), parentId, newComment),
      };
    }
    return node;
  });
}

/**
 * Apply updater to the node with the given id (deep).
 */
export function updateNode(
  tree: Comment[],
  id: string,
  updater: (node: Comment) => Comment
): Comment[] {
  return (tree ?? []).map((node) => {
    if (node.id === id) {
      return updater(node);
    }
    if (replies(node).length > 0) {
      return {
        ...node,
        replies: updateNode(replies(node), id, updater),
      };
    }
    return node;
  });
}

/**
 * Prune deleted comments from the tree:
 * - Deleted leaf nodes are removed entirely.
 * - Deleted nodes that have surviving descendants are kept as
 *   tombstones (is_deleted stays true, replies preserved).
 */
export function pruneDeleted(tree: Comment[]): Comment[] {
  return (tree ?? []).reduce<Comment[]>((acc, node) => {
    const prunedReplies = pruneDeleted(replies(node));
    const nodeWithPruned = { ...node, replies: prunedReplies };
    if (!node.is_deleted) {
      acc.push(nodeWithPruned);
      return acc;
    }
    if (prunedReplies.length > 0) {
      acc.push(nodeWithPruned);
    }
    return acc;
  }, []);
}
