import { Comment } from '../types';

/**
 * Insert a new comment as a reply to the given parentId.
 * If parentId is null, appends to the root list.
 */
const replies = (node: Comment): Comment[] =>
  node.replies ?? [];

export function insertReply(
  tree: Comment[],
  parentId: string | null,
  newComment: Comment
): Comment[] {
  if (parentId === null) {
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
